import { Router } from 'express';
import { prisma } from '../db.js';
import { PEPPOL_BILLING_URN } from '../einvoice/ubl.js';
import { peppolAllowed } from '../peppol/settings.js';
import { HttpError, requireOrg, requireUser } from '../auth/guards.js';
import { roleCan } from '../auth/roles.js';
import { money } from '../http/view.js';
import { softLimitState } from '../billing/plans.js';
import { clientOwnerStatus } from '../accounts/transfer.js';
import { DOWNLOAD_SELECT, param, sendDocumentFile } from './app-shared.js';
import { appSecurityRouter } from './app-security.js';
import { appInboxRouter } from './app-inbox.js';
import { appClientsRouter } from './app-clients.js';
import { appSettingsRouter } from './app-settings.js';
import { appPlanRouter } from './app-plan.js';
import { appRecurringRouter } from './app-recurring.js';
import { appDocPaymentsRouter } from './app-doc-payments.js';
import { appApiKeysRouter } from './app-api-keys.js';
import { appBankRouter } from './app-bank.js';
import { appPeppolRouter } from './app-peppol.js';
import { appProformaRouter } from './app-proforma.js';
import { appIncomingRouter } from './app-incoming.js';
import { PAYABLE_TYPES } from '../documents/payments.js';
import { sofiaToday } from '../time.js';
import {
  DOCUMENT_FILTER_PARAMS,
  isFiltered,
  listDocuments,
  LIST_PAYMENTS,
  LIST_STATUSES,
  LIST_TYPES,
  readDocumentFilter,
} from '../documents/list.js';
import { pagerLinks, readCursor } from '../http/pagination.js';
import { appCatalogRouter } from './app-catalog.js';
import { appSeriesRouter } from './app-series.js';
import { appMembersRouter } from './app-members.js';
import { appIssueRouter } from './app-issue.js';
import { appExportRouter } from './app-export.js';
import { appTerminationRouter, terminatedErrorPage } from './app-termination.js';
import { orgNavLocals } from './app-org-nav.js';
import { newsLocals } from '../news/popup.js';
import { newsReadRouter } from './news.js';
import { appJournalRouter } from './app-journal.js';
import { appSaftRouter } from './app-saft.js';

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
  // „Какво ново“ след обновяване (src/news/popup.ts) — на всяка цяла страница на приложението.
  router.use('/app', newsLocals);
  router.use(newsReadRouter());
  router.use('/app/o/:orgId', orgNavLocals());
  router.use(appSecurityRouter());
  router.use(appCatalogRouter());
  router.use(appSeriesRouter());
  router.use(appMembersRouter());
  router.use(appIssueRouter());
  router.use(appExportRouter());
  router.use(appInboxRouter());
  router.use(appClientsRouter());
  router.use(appSettingsRouter());
  router.use(appPlanRouter());
  router.use(appRecurringRouter());
  router.use(appDocPaymentsRouter());
  router.use(appApiKeysRouter());
  router.use(appBankRouter());
  router.use(appProformaRouter());
  router.use(appPeppolRouter());
  router.use(appIncomingRouter());
  router.use(appTerminationRouter());
  router.use(appJournalRouter());
  router.use(appSaftRouter());

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
    const filter = readDocumentFilter(req.query);
    const [org, list, usage] = await Promise.all([
      prisma.organization.findUniqueOrThrow({ where: { id: access.organizationId } }),
      listDocuments(access.organizationId, filter, readCursor(req.query['predi'])),
      monthUsage(access.organizationId),
    ]);
    // Разделите на фирмата (unread, пълномощни, права) са в `orgNav` — orgNavLocals по-долу.
    res.render('app/org', {
      org,
      access,
      documents: list.items,
      total: list.total,
      filter,
      filtered: isFiltered(filter),
      pager: pagerLinks(req, `/app/o/${org.id}`, 'predi', DOCUMENT_FILTER_PARAMS, list.next),
      lists: { types: LIST_TYPES, statuses: LIST_STATUSES, payments: LIST_PAYMENTS },
      usage: { ...usage, ...softLimitState(usage.limit, usage.issued) },
      // Прекратена фирма — само преглед (SPEC 66): без „Нов документ“.
      canIssue: roleCan(access.role, 'documents.issue') && !org.terminatedAt,
      money: (cents: bigint, currency: string) => money(cents, currency, res.locals.lang),
    });
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
        replacedBy: { select: { id: true, number: true } },
        replaces: { select: { id: true, number: true } },
        _count: { select: { followers: { where: { status: 'ISSUED' } } } },
        payments: {
          orderBy: { paidOn: 'asc' },
          select: { id: true, amountCents: true, paidOn: true, source: true, note: true },
        },
        recurring: { select: { id: true, name: true } },
        proforma: { select: { id: true, number: true } },
        peppolTransmission: {
          select: { status: true, receiverPartyId: true, sentAt: true, lastError: true },
        },
      },
    });
    if (!document) throw new HttpError(404);
    const canIssue = roleCan(access.role, 'documents.issue');
    const payable =
      document.status === 'ISSUED' &&
      (PAYABLE_TYPES as readonly string[]).includes(document.typeCode) &&
      document.payableCents > 0n;
    res.render('app/document', {
      document,
      // Плащането (SPEC 52) и „Повтаряй“ (SPEC 51).
      payable,
      canPay: canIssue && payable,
      canRecur: canIssue && document.status === 'ISSUED' && document.typeCode === '380',
      paymentResult:
        typeof req.query['plashtane'] === 'string' &&
        /^[a-zA-Z]{2,20}$/.test(req.query['plashtane'])
          ? req.query['plashtane']
          : '',
      today: sofiaToday(),
      money: (cents: bigint) => money(cents, document.currency, res.locals.lang),
      eur: (cents: bigint) => money(cents, 'EUR', res.locals.lang),
      issued: req.query['issued'] === '1',
      peppolResult:
        typeof req.query['peppol'] === 'string' && /^[a-zA-Z]{2,20}$/.test(req.query['peppol'])
          ? req.query['peppol']
          : '',
      canPeppol:
        canIssue &&
        (await peppolAllowed(access.organizationId, { viaFirmId: access.viaFirmId })) &&
        document.status === 'ISSUED' &&
        !document.peppolTransmission &&
        (document.ublXml ?? '').includes(PEPPOL_BILLING_URN),
      // „Анулирай и издай нов“ — издаден документ без известия към него (SPEC 47).
      canAnnul:
        roleCan(access.role, 'documents.cancel') &&
        roleCan(access.role, 'documents.issue') &&
        document.status === 'ISSUED' &&
        document._count.followers === 0,
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

  router.use(terminatedErrorPage);
  return router;
}
