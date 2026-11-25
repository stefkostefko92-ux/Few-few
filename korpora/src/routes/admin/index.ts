import { Router } from 'express';
import { principalOf, requireCsrf, requireStaff, requireUser } from '../../auth/guards.js';
import { can } from '../../auth/rbac.js';
import { prisma } from '../../db.js';
import { verifyAuditChain } from '../../audit.js';
import { geoIpReady } from '../../auth/geoip.js';
import { planView } from '../../plans/plan.js';
import {
  dashboardCounts,
  listAccounts,
  NEW_ACCOUNT_DAYS,
  PLAN_FILTERS,
  recentSecurityEvents,
  SORTS,
  STATUS_FILTERS,
  type AccountQuery,
  type PlanFilter,
  type SortKey,
  type StatusFilter,
} from '../../services/admin-accounts.js';
import { ADMIN_LIMITS } from '../../services/admin-limits.js';
import { catalogInfo } from '../../services/engine.js';
import { withoutUnsafeChars } from '../../services/names.js';
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
    const role = principalOf(req).user.role;
    res.locals.can = (capability: Parameters<typeof can>[1]) => can(role, capability);
    res.locals.limits = ADMIN_LIMITS;
    next();
  },
);

adminRouter.get('/admin', async (req, res) => {
  // неуспешните входове носят IP — само за роля, която вижда входовете
  const seesLogins = can(principalOf(req).user.role, 'logins:view');
  const [counts, events, chain, recent] = await Promise.all([
    dashboardCounts(),
    seesLogins ? recentSecurityEvents() : Promise.resolve([]),
    verifyAuditChain(),
    prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
      take: 8,
      select: {
        id: true,
        email: true,
        name: true,
        plan: true,
        emailVerifiedAt: true,
        createdAt: true,
        signupCountry: true,
      },
    }),
  ]);
  res.render('admin/dashboard', {
    counts,
    events,
    chain,
    recent,
    catalogMode: catalogInfo().mode,
    geoip: geoIpReady(),
    newDays: NEW_ACCOUNT_DAYS,
  });
});

/** Адресът на списъка със същите условия — за страниците и за подредбата по колона. */
function accountsQuery(query: AccountQuery): string {
  return new URLSearchParams({
    q: query.q,
    plan: query.plan,
    status: query.status,
    sort: query.sort,
    dir: query.dir,
    page: String(query.page),
  }).toString();
}

function pick<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : fallback;
}

adminRouter.get('/admin/accounts', async (req, res) => {
  const query: AccountQuery = {
    q: typeof req.query.q === 'string' ? withoutUnsafeChars(req.query.q.slice(0, 120)) : '',
    plan: pick<PlanFilter>(req.query.plan, PLAN_FILTERS, 'all'),
    status: pick<StatusFilter>(req.query.status, STATUS_FILTERS, 'all'),
    sort: pick<SortKey>(req.query.sort, SORTS, 'created'),
    dir: pick<'asc' | 'desc'>(req.query.dir, ['asc', 'desc'], 'desc'),
    page: Math.max(1, Math.min(10_000, Number.parseInt(String(req.query.page ?? '1'), 10) || 1)),
  };
  const now = new Date();
  const result = await listAccounts(query, can(principalOf(req).user.role, 'logins:view'), now);
  // страница след последната (стара връзка, изтрити акаунти) води към последната, не към празна таблица
  if (query.page > result.pages) {
    res.redirect(`/admin/accounts?${accountsQuery({ ...query, page: result.pages })}`);
    return;
  }
  res.render('admin/accounts', {
    query,
    ...result,
    // състоянието на плана — по същото правило като страницата на акаунта (plan-chip)
    rows: result.rows.map((u) => ({ ...u, planState: planView(u, now) })),
    plans: PLAN_FILTERS,
    statuses: STATUS_FILTERS,
    sorts: SORTS,
    now,
  });
});

adminRouter.use(accountAdminRouter);
adminRouter.use(manageRouter);
