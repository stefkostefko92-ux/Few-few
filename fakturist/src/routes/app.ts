import { Router, type Request, type Response } from 'express';
import QRCode from 'qrcode';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { prisma } from '../db.js';
import { audit } from '../audit.js';
import { BRAND } from '../brand.js';
import { HttpError, requireOrg, requireUser } from '../auth/guards.js';
import { roleCan } from '../auth/roles.js';
import { decryptTotpDraft, encryptTotpDraft, encryptTotpSecret } from '../auth/keys.js';
import { generateTotpSecret, otpauthUrl, readableSecret, verifyTotp } from '../auth/totp.js';
import {
  hashPassword,
  passwordProblem,
  verifyPassword,
  PASSWORD_MAX_LENGTH,
} from '../auth/password.js';
import { OrganizationDataSchema } from '../accounts/register.js';
import {
  issueDocument,
  IssueRejected,
  IssueRequestSchema,
  SeriesExhausted,
} from '../documents/issue.js';
import { formToIssueRequest } from '../documents/form.js';
import { decideMandate } from '../accounts/mandates.js';
import { COMMON_UNITS, PAYMENT_MEANS, VAT_CATEGORIES } from '../einvoice/codes.js';
import { money } from '../http/view.js';
import { documentPdf } from '../documents/render.js';
import { kickOutbox } from '../mail/outbox.js';
import type { Response as ExpressResponse } from 'express';
import { softLimitState } from '../billing/plans.js';

const ID = /^[a-z0-9]{20,40}$/;

function param(req: Request, name: string): string {
  const value = req.params[name];
  if (typeof value !== 'string' || !ID.test(value)) throw new HttpError(404);
  return value;
}

/** Документите, издадени от фирмата през текущия месец — за мекия лимит на безплатния план. */
async function monthUsage(
  organizationId: string,
): Promise<{ issued: number; limit: number | null }> {
  const start = new Date();
  start.setUTCDate(1);
  start.setUTCHours(0, 0, 0, 0);
  const [issued, subscription] = await Promise.all([
    prisma.document.count({
      where: { organizationId, status: 'ISSUED', issuedAt: { gte: start } },
    }),
    prisma.subscription.findFirst({
      where: { organizationId, status: 'ACTIVE' },
      orderBy: { createdAt: 'desc' },
      include: { plan: { select: { monthlyDocumentSoftLimit: true } } },
    }),
  ]);
  return { issued, limit: subscription?.plan.monthlyDocumentSoftLimit ?? null };
}

const DOWNLOAD_SELECT = {
  number: true,
  input: true,
  ublXml: true,
  ciiXml: true,
  chainIndex: true,
  sha256: true,
  firm: { select: { legalName: true } },
  mandate: { select: { documentRef: true } },
} as const;

type DownloadSource = {
  number: string | null;
  input: Prisma.JsonValue;
  ublXml: string | null;
  ciiXml: string | null;
  chainIndex: bigint | null;
  sha256: string | null;
  firm: { legalName: string } | null;
  mandate: { documentRef: string } | null;
};

/** PDF (от същия вход като XML-а) или XML-ът, както е издаден. Само за изтегляне, без кеш. */
async function sendDocumentFile(
  res: ExpressResponse,
  document: DownloadSource,
  format: string,
): Promise<void> {
  const name = document.number ?? 'document';
  res.set('Cache-Control', 'private, no-store');
  if (format === 'pdf') {
    const pdf = await documentPdf(document);
    res
      .type('application/pdf')
      .set('Content-Disposition', `attachment; filename="${name}.pdf"`)
      .send(pdf);
    return;
  }
  const xml =
    format === 'ubl.xml' ? document.ublXml : format === 'cii.xml' ? document.ciiXml : null;
  if (!xml) throw new HttpError(404);
  res
    .type('application/xml')
    .set('Content-Disposition', `attachment; filename="${name}-${format}"`)
    .send(xml);
}

/** Записът в шкафчето САМО на тази фирма — чужд запис е 404, а получателят не вижда други документи на изпращача. */
async function inboxEntryFor(recipientOrgId: string, entryId: string) {
  const entry = await prisma.inboxEntry.findFirst({
    where: { id: entryId, recipientOrgId },
    include: {
      senderOrg: { select: { legalName: true, eik: true, vatNumber: true, verifiedAt: true } },
      decidedBy: { select: { name: true } },
      document: {
        select: {
          ...DOWNLOAD_SELECT,
          typeCode: true,
          issueDate: true,
          dueDate: true,
          currency: true,
          taxExclusiveCents: true,
          vatCents: true,
          payableCents: true,
          buyerName: true,
        },
      },
    },
  });
  if (!entry) throw new HttpError(404);
  return entry;
}

export function appRouter(): Router {
  const router = Router();
  router.use('/app', requireUser());

  router.get('/app', async (req, res) => {
    const user = req.principal!.user;
    const ownIds = user.memberships.map((m) => m.organizationId);
    const [own, mandates] = await Promise.all([
      prisma.organization.findMany({
        where: { id: { in: ownIds } },
        orderBy: { legalName: 'asc' },
      }),
      prisma.clientMandate.findMany({
        where: { firmId: { in: ownIds } },
        include: { client: true },
        orderBy: { client: { legalName: 'asc' } },
      }),
    ]);
    res.render('app/home', {
      own: own.map((org) => ({
        ...org,
        role: user.memberships.find((m) => m.organizationId === org.id)?.role ?? 'VIEWER',
      })),
      clients: mandates,
    });
  });

  // --- Сигурност: смяна на паролата и двуфакторен вход ----------------------------------------------
  router.get('/app/sigurnost', async (req, res) => {
    const user = req.principal!.user;
    const secret = generateTotpSecret();
    const url = otpauthUrl(BRAND.nameLatin, user.email, secret);
    res.render('app/security', {
      draft: encryptTotpDraft(secret, user.id),
      readable: readableSecret(secret),
      qr: user.totpEnabled
        ? null
        : await QRCode.toString(url, { type: 'svg', margin: 1, width: 200 }),
      ok: typeof req.query['ok'] === 'string' ? req.query['ok'] : null,
      err: typeof req.query['err'] === 'string' ? req.query['err'] : null,
    });
  });

  router.post('/app/sigurnost/parola', async (req, res) => {
    const principal = req.principal!;
    const body = z
      .object({
        current: z.string().max(PASSWORD_MAX_LENGTH),
        next: z.string().max(PASSWORD_MAX_LENGTH),
      })
      .safeParse(req.body);
    const user = await prisma.user.findUniqueOrThrow({ where: { id: principal.user.id } });
    const problem = body.success
      ? passwordProblem(body.data.next, [user.email, user.name])
      : 'tooShort';
    if (!body.success || !(await verifyPassword(body.data.current, user.passwordHash)) || problem) {
      return res.redirect(303, `/app/sigurnost?err=${problem ?? 'current'}`);
    }
    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: user.id },
        data: { passwordHash: await hashPassword(body.data.next), mustChangePassword: false },
      });
      await tx.session.deleteMany({ where: { userId: user.id, id: { not: principal.sessionId } } });
      await audit(tx, {
        actorId: user.id,
        action: 'auth.password.changed',
        targetType: 'User',
        targetId: user.id,
      });
    });
    res.redirect(303, '/app/sigurnost?ok=password');
  });

  router.post('/app/sigurnost/2fa', async (req, res) => {
    const principal = req.principal!;
    const body = z
      .object({ draft: z.string().max(400), code: z.string().max(20) })
      .safeParse(req.body);
    // Включената 2FA не се презаписва оттук: смяната е отделен поток с текущия код и паролата.
    if (principal.user.totpEnabled) throw new HttpError(409);
    if (!body.success) return res.redirect(303, '/app/sigurnost?err=code');
    // Черновата е вързана с този акаунт (AAD = userId) — чужда чернова не се дешифрира.
    const secret = decryptTotpDraft(body.data.draft, principal.user.id);
    if (!secret) return res.redirect(303, '/app/sigurnost?err=code');
    const step = verifyTotp(secret, body.data.code, null);
    if (step === null) return res.redirect(303, '/app/sigurnost?err=code');
    await prisma.$transaction(async (tx) => {
      const updated = await tx.user.updateMany({
        where: { id: principal.user.id, totpEnabledAt: null },
        data: {
          totpSecretEnc: encryptTotpSecret(secret, principal.user.id),
          totpEnabledAt: new Date(),
          totpLastStep: step,
        },
      });
      if (updated.count !== 1) throw new HttpError(409);
      await audit(tx, {
        actorId: principal.user.id,
        action: 'auth.2fa.enabled',
        targetType: 'User',
        targetId: principal.user.id,
      });
    });
    res.redirect(303, '/app/sigurnost?ok=2fa');
  });

  // --- Фирма: документи ----------------------------------------------------------------------------
  router.get('/app/o/:orgId', async (req, res) => {
    const access = await requireOrg(req, 'documents.read');
    const [org, documents, usage] = await Promise.all([
      prisma.organization.findUniqueOrThrow({ where: { id: access.organizationId } }),
      prisma.document.findMany({
        where: { organizationId: access.organizationId },
        orderBy: { createdAt: 'desc' },
        take: 100,
        select: {
          id: true,
          number: true,
          typeCode: true,
          status: true,
          issueDate: true,
          buyerName: true,
          payableCents: true,
          currency: true,
        },
      }),
      monthUsage(access.organizationId),
    ]);
    const [unread, pendingMandates] = await Promise.all([
      prisma.inboxEntry.count({ where: { recipientOrgId: access.organizationId, readAt: null } }),
      prisma.clientMandate.count({ where: { clientId: access.organizationId, status: 'PENDING' } }),
    ]);
    res.render('app/org', {
      org,
      access,
      documents,
      unread,
      pendingMandates,
      canManageMandates: roleCan(access.role, 'mandates.manage') && access.viaFirmId === null,
      usage: { ...usage, ...softLimitState(usage.limit, usage.issued) },
      canIssue: roleCan(access.role, 'documents.issue'),
      money: (cents: bigint, currency: string) => money(cents, currency, res.locals.lang),
    });
  });

  router.get('/app/o/:orgId/nov', async (req, res) => {
    const access = await requireOrg(req, 'documents.issue');
    await renderNewDocument(req, res, access.organizationId, null, {});
  });

  router.post('/app/o/:orgId/nov', async (req, res) => {
    const access = await requireOrg(req, 'documents.issue');
    const request = IssueRequestSchema.safeParse(formToIssueRequest(req.body));
    if (!request.success) {
      const issues = request.error.issues.map((issue) => ({
        rule: 'INPUT',
        path: issue.path.join('.'),
        message: { bg: issue.message, en: issue.message },
      }));
      return renderNewDocument(req, res, access.organizationId, issues, req.body, 400);
    }
    try {
      const result = await issueDocument(access, req.principal!.user.id, request.data);
      // Писмата към шкафчето на получателя тръгват веднага след транзакцията (и от опашката при грешка).
      if (result.delivery) kickOutbox();
      res.redirect(303, `/app/o/${access.organizationId}/d/${result.id}?issued=1`);
    } catch (error) {
      if (error instanceof IssueRejected) {
        return renderNewDocument(req, res, access.organizationId, error.issues, req.body, 400);
      }
      if (error instanceof SeriesExhausted) {
        return renderNewDocument(
          req,
          res,
          access.organizationId,
          [
            {
              rule: 'SERIES',
              path: 'seriesId',
              message: { bg: 'Серията е изчерпана.', en: 'The series is exhausted.' },
            },
          ],
          req.body,
          400,
        );
      }
      throw error;
    }
  });

  router.get('/app/o/:orgId/d/:docId', async (req, res) => {
    const access = await requireOrg(req, 'documents.read');
    const document = await prisma.document.findFirst({
      where: { id: param(req, 'docId'), organizationId: access.organizationId },
      include: {
        issuedBy: { select: { name: true } },
        firm: { select: { legalName: true } },
        mandate: true,
        inboxEntries: { include: { recipientOrg: { select: { legalName: true } } } },
      },
    });
    if (!document) throw new HttpError(404);
    res.render('app/document', {
      document,
      money: (cents: bigint) => money(cents, document.currency, res.locals.lang),
      issued: req.query['issued'] === '1',
    });
  });

  router.get('/app/o/:orgId/d/:docId/:format', async (req, res) => {
    const access = await requireOrg(req, 'documents.read');
    const document = await prisma.document.findFirst({
      where: {
        id: param(req, 'docId'),
        organizationId: access.organizationId,
        status: { not: 'DRAFT' },
      },
      select: DOWNLOAD_SELECT,
    });
    if (!document) throw new HttpError(404);
    await sendDocumentFile(res, document, String(req.params['format']));
  });

  // --- Шкафче: документи от други фирми във Фактурист --------------------------------------------------
  router.get('/app/o/:orgId/shkafche', async (req, res) => {
    const access = await requireOrg(req, 'documents.read');
    const [org, entries] = await Promise.all([
      prisma.organization.findUniqueOrThrow({ where: { id: access.organizationId } }),
      prisma.inboxEntry.findMany({
        where: { recipientOrgId: access.organizationId },
        orderBy: { deliveredAt: 'desc' },
        take: 200,
        include: {
          senderOrg: { select: { legalName: true, eik: true, verifiedAt: true } },
          document: {
            select: {
              number: true,
              typeCode: true,
              issueDate: true,
              payableCents: true,
              currency: true,
            },
          },
        },
      }),
    ]);
    res.render('app/inbox', {
      org,
      entries,
      money: (cents: bigint, currency: string) => money(cents, currency, res.locals.lang),
    });
  });

  router.get('/app/o/:orgId/shkafche/:entryId', async (req, res) => {
    const access = await requireOrg(req, 'documents.read');
    const entry = await inboxEntryFor(access.organizationId, param(req, 'entryId'));
    if (!entry.readAt) {
      await prisma.inboxEntry.updateMany({
        where: { id: entry.id, readAt: null },
        data: { readAt: new Date() },
      });
    }
    res.render('app/inbox-entry', {
      entry,
      document: entry.document,
      canDecide: roleCan(access.role, 'documents.issue'),
      money: (cents: bigint) => money(cents, entry.document.currency, res.locals.lang),
    });
  });

  router.get('/app/o/:orgId/shkafche/:entryId/:format', async (req, res) => {
    const access = await requireOrg(req, 'documents.read');
    const entry = await inboxEntryFor(access.organizationId, param(req, 'entryId'));
    await sendDocumentFile(res, entry.document, String(req.params['format']));
  });

  router.post('/app/o/:orgId/shkafche/:entryId/:decision', async (req, res) => {
    const access = await requireOrg(req, 'documents.issue');
    const entry = await inboxEntryFor(access.organizationId, param(req, 'entryId'));
    const decision = req.params['decision'];
    if (decision !== 'priemi' && decision !== 'otkazhi') throw new HttpError(404);
    const reason = z
      .string()
      .trim()
      .max(200)
      .safeParse((req.body as { reason?: unknown }).reason);
    await prisma.$transaction(async (tx) => {
      const updated = await tx.inboxEntry.updateMany({
        where: { id: entry.id, recipientOrgId: access.organizationId, status: 'RECEIVED' },
        data: {
          status: decision === 'priemi' ? 'ACCEPTED' : 'REJECTED',
          decidedAt: new Date(),
          decidedById: req.principal!.user.id,
          rejectReason: decision === 'otkazhi' && reason.success ? reason.data || null : null,
        },
      });
      if (updated.count !== 1) throw new HttpError(409);
      await audit(tx, {
        actorId: req.principal!.user.id,
        organizationId: access.organizationId,
        action: decision === 'priemi' ? 'inbox.accepted' : 'inbox.rejected',
        targetType: 'InboxEntry',
        targetId: entry.id,
      });
    });
    res.redirect(303, `/app/o/${access.organizationId}/shkafche/${entry.id}`);
  });

  // --- Фирма: пълномощни на кантори, които издават от нейно име --------------------------------------
  router.get('/app/o/:orgId/palnomoshtni', async (req, res) => {
    const access = await requireOrg(req, 'mandates.manage');
    const [org, mandates] = await Promise.all([
      prisma.organization.findUniqueOrThrow({ where: { id: access.organizationId } }),
      prisma.clientMandate.findMany({
        where: { clientId: access.organizationId },
        include: { firm: { select: { legalName: true, eik: true } } },
        orderBy: { createdAt: 'desc' },
      }),
    ]);
    res.render('app/mandates', { org, mandates });
  });

  router.post('/app/o/:orgId/palnomoshtni/:mandateId/:decision', async (req, res) => {
    const access = await requireOrg(req, 'mandates.manage');
    if (access.viaFirmId) throw new HttpError(404);
    const decision =
      req.params['decision'] === 'potvardi'
        ? 'approve'
        : req.params['decision'] === 'ottegli'
          ? 'revoke'
          : null;
    if (!decision) throw new HttpError(404);
    await decideMandate({
      mandateId: param(req, 'mandateId'),
      actorId: req.principal!.user.id,
      decision,
      clientOrgId: access.organizationId,
    });
    res.redirect(303, `/app/o/${access.organizationId}/palnomoshtni`);
  });

  // --- Кантора: фирми-клиенти по пълномощно ----------------------------------------------------------
  router.get('/app/o/:orgId/klienti/nov', async (req, res) => {
    const access = await requireOrg(req, 'mandates.manage');
    const firm = await prisma.organization.findUniqueOrThrow({
      where: { id: access.organizationId },
    });
    if (firm.kind !== 'ACCOUNTING_FIRM') throw new HttpError(404);
    res.render('app/client-new', { firm, errors: {}, values: {} });
  });

  router.post('/app/o/:orgId/klienti/nov', async (req, res) => {
    const access = await requireOrg(req, 'mandates.manage');
    const firm = await prisma.organization.findUniqueOrThrow({
      where: { id: access.organizationId },
    });
    if (firm.kind !== 'ACCOUNTING_FIRM') throw new HttpError(404);
    const parsed = OrganizationDataSchema.and(
      z.object({
        documentRef: z.string().trim().min(3).max(100),
        validFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      }),
    ).safeParse(req.body);
    if (!parsed.success) {
      const errors: Record<string, string> = {};
      for (const issue of parsed.error.issues)
        errors[String(issue.path[0] ?? 'form')] ??= issue.message;
      return res.status(400).render('app/client-new', { firm, errors, values: req.body });
    }
    const data = parsed.data;
    await prisma.$transaction(async (tx) => {
      const existing = await tx.organization.findUnique({ where: { eik: data.eik } });
      // Пълномощното винаги започва като PENDING: потвърждава го собственикът на фирмата (ако има профил)
      // или мастър акаунтът след проверка на писменото пълномощно — кантора не може сама да присвои ЕИК.
      const client =
        existing ??
        (await tx.organization.create({
          data: {
            kind: 'COMPANY',
            legalName: data.legalName,
            eik: data.eik,
            vatNumber: data.vatNumber ?? null,
            addressStreet: data.addressStreet,
            addressCity: data.addressCity,
            postalCode: data.postalCode,
            iban: data.iban || null,
            eAddressScheme: data.vatNumber ? '9926' : null,
            eAddressValue: data.vatNumber ?? null,
          },
        }));
      if (!existing) {
        await tx.documentSeries.create({
          data: {
            organizationId: client.id,
            name: 'Основна',
            rangeStart: 1n,
            rangeEnd: 9_999_999_999n,
            nextNumber: 1n,
            isDefault: true,
          },
        });
      }
      const mandate = await tx.clientMandate.upsert({
        where: { firmId_clientId: { firmId: firm.id, clientId: client.id } },
        create: {
          firmId: firm.id,
          clientId: client.id,
          status: 'PENDING',
          documentRef: data.documentRef,
          validFrom: new Date(`${data.validFrom}T00:00:00Z`),
          createdById: req.principal!.user.id,
        },
        update: {
          documentRef: data.documentRef,
          validFrom: new Date(`${data.validFrom}T00:00:00Z`),
        },
      });
      await audit(tx, {
        actorId: req.principal!.user.id,
        organizationId: client.id,
        action: 'mandate.requested',
        targetType: 'ClientMandate',
        targetId: mandate.id,
        details: { firmId: firm.id },
      });
    });
    res.redirect(303, '/app');
  });

  return router;
}

async function renderNewDocument(
  req: Request,
  res: Response,
  organizationId: string,
  issues: Array<{ rule: string; path: string; message: { bg: string; en: string } }> | null,
  values: unknown,
  status = 200,
): Promise<void> {
  const [org, series] = await Promise.all([
    prisma.organization.findUniqueOrThrow({ where: { id: organizationId } }),
    prisma.documentSeries.findMany({ where: { organizationId }, orderBy: { name: 'asc' } }),
  ]);
  const today = new Date().toISOString().slice(0, 10);
  res.status(status).render('app/document-new', {
    org,
    series,
    issues,
    values: typeof values === 'object' && values !== null ? values : {},
    today,
    units: COMMON_UNITS,
    categories: VAT_CATEGORIES,
    paymentMeans: PAYMENT_MEANS,
    lineCount: 6,
    canIssue: true,
    reqPath: req.path,
  });
}
