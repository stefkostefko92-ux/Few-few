import { Router, type Request, type Response } from 'express';
import { prisma } from '../db.js';
import { HttpError, requireOrg, requireUser } from '../auth/guards.js';
import { roleCan } from '../auth/roles.js';
import {
  issueDocument,
  IssueRejected,
  IssueRequestSchema,
  SeriesExhausted,
} from '../documents/issue.js';
import { formToIssueRequest } from '../documents/form.js';
import { COMMON_UNITS, PAYMENT_MEANS, VAT_CATEGORIES } from '../einvoice/codes.js';
import { money } from '../http/view.js';
import { kickOutbox } from '../mail/outbox.js';
import { softLimitState } from '../billing/plans.js';
import { clientOwnerStatus } from '../accounts/transfer.js';
import { DOWNLOAD_SELECT, param, sendDocumentFile } from './app-shared.js';
import { appSecurityRouter } from './app-security.js';
import { appInboxRouter } from './app-inbox.js';
import { appClientsRouter } from './app-clients.js';
import { appSettingsRouter } from './app-settings.js';
import { appCatalogRouter } from './app-catalog.js';
import { appMembersRouter } from './app-members.js';
import { buyerFromParty, catalogForForm, saveBuyerAsParty } from '../catalog/document-prefill.js';

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
  router.use(appSecurityRouter());
  router.use(appCatalogRouter());
  router.use(appMembersRouter());
  router.use(appInboxRouter());
  router.use(appClientsRouter());
  router.use(appSettingsRouter());

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
    const firmIds = own.filter((org) => org.kind === 'ACCOUNTING_FIRM').map((org) => org.id);
    // Кантората вижда кой клиент има собственик и кани останалите (OWNER/ADMIN на кантората).
    const canInvite = user.memberships
      .filter((m) => firmIds.includes(m.organizationId) && roleCan(m.role, 'mandates.manage'))
      .map((m) => m.organizationId);
    // Имейлът от поканата е само за OWNER/ADMIN на кантората, която я е пратила.
    const owners = await clientOwnerStatus(
      canInvite,
      mandates.map((m) => m.clientId),
    );
    const flash = (key: string) => {
      const value = req.query[key];
      return typeof value === 'string' && /^[a-zA-Z]{1,20}$/.test(value) ? value : null;
    };
    res.render('app/home', {
      own: own.map((org) => ({
        ...org,
        role: user.memberships.find((m) => m.organizationId === org.id)?.role ?? 'VIEWER',
      })),
      clients: mandates.map((m) => ({ ...m, owner: owners.get(m.clientId) ?? null })),
      canInvite,
      invited: flash('pokana'),
      added: flash('klient'),
    });
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
      canSettings: roleCan(access.role, 'org.settings') && access.viaFirmId === null,
      canMembers: roleCan(access.role, 'members.manage') && access.viaFirmId === null,
      canParties: roleCan(access.role, 'parties.manage'),
      canItems: roleCan(access.role, 'items.manage'),
      canSeries: roleCan(access.role, 'series.manage') && access.viaFirmId === null,
      usage: { ...usage, ...softLimitState(usage.limit, usage.issued) },
      canIssue: roleCan(access.role, 'documents.issue'),
      money: (cents: bigint, currency: string) => money(cents, currency, res.locals.lang),
    });
  });

  router.get('/app/o/:orgId/nov', async (req, res) => {
    const access = await requireOrg(req, 'documents.issue');
    // „Документ към него“ от контрагентите: получателят идва попълнен.
    const buyer = await buyerFromParty(access.organizationId, req.query['party']);
    await renderNewDocument(req, res, access.organizationId, null, buyer ? { buyer } : {});
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
      if ((req.body as { saveBuyer?: unknown }).saveBuyer === 'on') {
        await saveBuyerAsParty({
          organizationId: access.organizationId,
          actorId: req.principal!.user.id,
          buyer: (req.body as { buyer?: unknown }).buyer,
        });
      }
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
  const [org, series, catalog] = await Promise.all([
    prisma.organization.findUniqueOrThrow({ where: { id: organizationId } }),
    prisma.documentSeries.findMany({ where: { organizationId }, orderBy: { name: 'asc' } }),
    catalogForForm(organizationId),
  ]);
  const today = new Date().toISOString().slice(0, 10);
  res.status(status).render('app/document-new', {
    org,
    series,
    parties: catalog.parties,
    items: catalog.items,
    scripts: ['document-form'],
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
