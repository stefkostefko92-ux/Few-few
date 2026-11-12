import { Router, type Request, type Response } from 'express';
import QRCode from 'qrcode';
import { z } from 'zod';
import { prisma } from '../db.js';
import { audit } from '../audit.js';
import { BRAND } from '../brand.js';
import { HttpError, requireOrg, requireUser } from '../auth/guards.js';
import { roleCan } from '../auth/roles.js';
import { encryptTotpSecret } from '../auth/keys.js';
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
import { COMMON_UNITS, PAYMENT_MEANS, VAT_CATEGORIES } from '../einvoice/codes.js';
import { money } from '../http/view.js';
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
      draft: encryptTotpSecret(secret),
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
    if (!body.success) return res.redirect(303, '/app/sigurnost?err=code');
    let secret: string;
    try {
      const { decryptTotpSecret } = await import('../auth/keys.js');
      secret = decryptTotpSecret(body.data.draft);
    } catch {
      return res.redirect(303, '/app/sigurnost?err=code');
    }
    if (verifyTotp(secret, body.data.code, null) === null)
      return res.redirect(303, '/app/sigurnost?err=code');
    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: principal.user.id },
        data: { totpSecretEnc: encryptTotpSecret(secret), totpEnabledAt: new Date() },
      });
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
    res.render('app/org', {
      org,
      access,
      documents,
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
    const format = req.params['format'];
    if (format !== 'ubl.xml' && format !== 'cii.xml') throw new HttpError(404);
    const document = await prisma.document.findFirst({
      where: {
        id: param(req, 'docId'),
        organizationId: access.organizationId,
        status: { not: 'DRAFT' },
      },
      select: { number: true, ublXml: true, ciiXml: true },
    });
    const xml = format === 'ubl.xml' ? document?.ublXml : document?.ciiXml;
    if (!document || !xml) throw new HttpError(404);
    res
      .type('application/xml')
      .set('Content-Disposition', `attachment; filename="${document.number}-${format}"`)
      .set('Cache-Control', 'private, no-store')
      .send(xml);
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
      // Регистрирана сама фирма: пълномощното чака потвърждение от собственика ѝ (PENDING).
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
          status: existing ? 'PENDING' : 'ACTIVE',
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
        action: existing ? 'mandate.requested' : 'mandate.created',
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
