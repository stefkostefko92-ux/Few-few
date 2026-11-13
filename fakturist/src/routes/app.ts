import { Router } from 'express';
import { prisma } from '../db.js';
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

export function appRouter(): Router {
  const router = Router();
  router.use('/app', requireUser());
  router.use(appSecurityRouter());
  router.use(appCatalogRouter());
  router.use(appMembersRouter());
  router.use(appIssueRouter());
  router.use(appExportRouter());
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
      },
    });
    if (!document) throw new HttpError(404);
    res.render('app/document', {
      document,
      money: (cents: bigint) => money(cents, document.currency, res.locals.lang),
      issued: req.query['issued'] === '1',
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
