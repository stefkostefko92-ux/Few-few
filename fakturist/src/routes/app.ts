import { Router, type NextFunction, type Request, type Response } from 'express';
import { prisma } from '../db.js';
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
import { appCatalogRouter } from './app-catalog.js';
import { appMembersRouter } from './app-members.js';
import { appIssueRouter } from './app-issue.js';
import { appExportRouter } from './app-export.js';

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

/** Първият сегмент след /app/o/<id>/ на страниците с менюто на фирмата (HTML; файловете — не). */
const ORG_NAV_SECTIONS = new Set([
  'peppol',
  'shkafche',
  'vhodyashti',
  'proformi',
  'kontragenti',
  'artikuli',
  'serii',
  'banka',
  'plan',
  'povtaryashti',
  'api',
  'chlenove',
  'palnomoshtni',
  'nastroyki',
]);

/**
 * Менюто на фирмата (views/app/_org-nav.ejs) на началото ѝ и на разделите ѝ: условията кой линк се вижда са
 * същите като досега. Достъп няма — няма меню; самата страница си връща 404/403 както преди.
 */
function orgNavLocals() {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const segment = req.path.split('/')[1] ?? '';
      if (segment !== '' && !ORG_NAV_SECTIONS.has(segment)) {
        next();
        return;
      }
      const access = await requireOrg(req, 'documents.read').catch(() => null);
      if (!access) {
        next();
        return;
      }
      const direct = access.viaFirmId === null;
      const [org, unread, pendingMandates] = await Promise.all([
        prisma.organization.findUniqueOrThrow({
          where: { id: access.organizationId },
          select: { id: true, kind: true },
        }),
        prisma.inboxEntry.count({ where: { recipientOrgId: access.organizationId, readAt: null } }),
        prisma.clientMandate.count({
          where: { clientId: access.organizationId, status: 'PENDING' },
        }),
      ]);
      res.locals.orgNav = {
        org,
        unread,
        pendingMandates,
        // На началото на фирмата менюто е отворено и на телефон; в разделите се свива до текущия.
        open: segment === '',
        can: {
          mandates: roleCan(access.role, 'mandates.manage') && direct,
          settings: roleCan(access.role, 'org.settings') && direct,
          members: roleCan(access.role, 'members.manage') && direct,
          billing: roleCan(access.role, 'billing.manage') && direct,
          parties: roleCan(access.role, 'parties.manage'),
          items: roleCan(access.role, 'items.manage'),
          series: roleCan(access.role, 'series.manage') && direct,
        },
      };
      next();
    } catch (error) {
      next(error);
    }
  };
}

export function appRouter(): Router {
  const router = Router();
  router.use('/app', requireUser());
  router.use('/app/o/:orgId', orgNavLocals());
  router.use(appSecurityRouter());
  router.use(appCatalogRouter());
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
    // Разделите на фирмата (unread, пълномощни, права) са в `orgNav` — orgNavLocals по-долу.
    res.render('app/org', {
      org,
      access,
      documents,
      usage: { ...usage, ...softLimitState(usage.limit, usage.issued) },
      canIssue: roleCan(access.role, 'documents.issue'),
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
        (document.ublXml ?? '').includes('urn:fdc:peppol.eu:2017:poacc:billing:3.0'),
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

  return router;
}
