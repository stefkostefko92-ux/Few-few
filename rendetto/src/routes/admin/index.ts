import { Router } from 'express';
import type { Plan } from '@prisma/client';
import { requireCsrf, requireStaff, requireUser } from '../../auth/guards.js';
import { can, isStaff } from '../../auth/rbac.js';
import { prisma } from '../../db.js';
import { verifyAuditChain } from '../../audit.js';
import { geoIpReady } from '../../auth/geoip.js';
import {
  dashboardCounts,
  listAccounts,
  recentSecurityEvents,
  SORTS,
  STATUS_FILTERS,
  type AccountQuery,
  type SortKey,
  type StatusFilter,
} from '../../services/admin-accounts.js';
import { catalogInfo } from '../../services/engine.js';
import { accountAdminRouter } from './account.js';
import { manageRouter } from './manage.js';

export const adminRouter: Router = Router();

adminRouter.use(
  '/admin',
  requireUser,
  requireCsrf,
  requireStaff('admin:access'),
  (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    const role = req.principal?.user.role;
    res.locals.can = (capability: Parameters<typeof can>[1]) =>
      role && isStaff(role) ? can(role, capability) : false;
    res.locals.adminNav = req.path;
    next();
  },
);

adminRouter.get('/admin', async (req, res) => {
  // неуспешните входове носят IP — само за роля, която вижда входовете
  const seesLogins = can(req.principal!.user.role, 'logins:view');
  const [counts, events, chain] = await Promise.all([
    dashboardCounts(),
    seesLogins ? recentSecurityEvents() : Promise.resolve([]),
    verifyAuditChain(),
  ]);
  const recent = await prisma.user.findMany({
    orderBy: { createdAt: 'desc' },
    take: 8,
    select: {
      id: true,
      email: true,
      name: true,
      plan: true,
      planExpiresAt: true,
      emailVerifiedAt: true,
      createdAt: true,
      signupCountry: true,
    },
  });
  res.render('admin/dashboard', {
    counts,
    events,
    chain,
    recent,
    catalogMode: catalogInfo().mode,
    geoip: geoIpReady(),
  });
});

function pick<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : fallback;
}

adminRouter.get('/admin/accounts', async (req, res) => {
  const query: AccountQuery = {
    q: typeof req.query.q === 'string' ? req.query.q.slice(0, 120) : '',
    plan: pick<Plan | 'all'>(req.query.plan, ['all', 'TRIAL', 'PREMIUM', 'LIFETIME'], 'all'),
    status: pick<StatusFilter>(req.query.status, STATUS_FILTERS, 'all'),
    sort: pick<SortKey>(req.query.sort, SORTS, 'created'),
    dir: pick<'asc' | 'desc'>(req.query.dir, ['asc', 'desc'], 'desc'),
    page: Math.max(1, Math.min(10_000, Number.parseInt(String(req.query.page ?? '1'), 10) || 1)),
  };
  const result = await listAccounts(query, can(req.principal!.user.role, 'logins:view'));
  res.render('admin/accounts', {
    query,
    ...result,
    statuses: STATUS_FILTERS,
    sorts: SORTS,
    now: new Date(),
  });
});

adminRouter.use(accountAdminRouter);
adminRouter.use(manageRouter);
