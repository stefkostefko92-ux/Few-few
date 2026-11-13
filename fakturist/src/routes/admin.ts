import { sofiaToday } from '../time.js';
import { Router } from 'express';
import { prisma } from '../db.js';
import { audit } from '../audit.js';
import { HttpError, requireMaster, requireUser } from '../auth/guards.js';
import {
  ADMIN_RESOURCES,
  countResource,
  getResource,
  listResource,
  PAGE_SIZE,
  resourceBySlug,
} from '../admin/registry.js';
import { FEATURES, FEATURE_GROUPS } from '../features.js';
import { invalidatePublicPlans } from '../billing/public-plans.js';
import { money } from '../http/view.js';
import { transferStatus } from '../accounts/transfer.js';
import { ownershipReviewQueue } from '../accounts/ownership.js';
import { adminSettingsRouter } from './admin-settings.js';
import { adminActionsRouter } from './admin-actions.js';
import { adminMastersRouter } from './admin-masters.js';
import { PlanForm } from '../admin/plan-form.js';

/**
 * Регистърът по групи за менюто на панела (views/admin/_nav.ejs). „Планове“ са отделна връзка в главните,
 * затова не се повтарят в групата „Плащания“.
 */
const ADMIN_NAV = (['accounts', 'documents', 'billing', 'platform'] as const).map((id) => ({
  id,
  items: ADMIN_RESOURCES.filter((r) => r.group === id && r.slug !== 'plans').map((r) => ({
    slug: r.slug,
    label: r.label,
  })),
}));

export function adminRouter(): Router {
  const router = Router();
  router.use('/admin', requireUser(), requireMaster());
  router.use('/admin', (_req, res, next) => {
    res.locals.adminNav = ADMIN_NAV;
    next();
  });
  router.use(adminSettingsRouter());
  router.use(adminActionsRouter());
  router.use(adminMastersRouter());

  router.get('/admin', async (_req, res) => {
    const monthStart = new Date();
    monthStart.setUTCDate(1);
    monthStart.setUTCHours(0, 0, 0, 0);
    const [counts, issuedThisMonth, firms, companies, revenue, recent] = await Promise.all([
      Promise.all(
        ADMIN_RESOURCES.map(async (r) => ({ resource: r, count: await countResource(r) })),
      ),
      prisma.document.count({ where: { status: 'ISSUED', issuedAt: { gte: monthStart } } }),
      prisma.organization.count({ where: { kind: 'ACCOUNTING_FIRM', deletedAt: null } }),
      prisma.organization.count({ where: { kind: 'COMPANY', deletedAt: null } }),
      prisma.payment.aggregate({
        where: { status: 'COMPLETED', paidAt: { gte: monthStart } },
        _sum: { amountCents: true },
      }),
      prisma.auditLog.findMany({ orderBy: { id: 'desc' }, take: 15 }),
    ]);
    const review = await ownershipReviewQueue();
    res.render('admin/dashboard', {
      counts,
      issuedThisMonth,
      firms,
      companies,
      revenue: money(revenue._sum.amountCents ?? 0, 'EUR', res.locals.lang),
      recent,
      review,
    });
  });

  router.get('/admin/r/:slug', async (req, res) => {
    const resource = resourceBySlug(String(req.params['slug']));
    if (!resource) throw new HttpError(404);
    const q = typeof req.query['q'] === 'string' ? req.query['q'].slice(0, 100) : '';
    const page = Math.max(1, Number(req.query['p']) || 1);
    const { rows, total } = await listResource(resource, q, page);
    res.render('admin/list', {
      resource,
      rows,
      total,
      q,
      page,
      pages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
    });
  });

  router.get('/admin/r/:slug/:id', async (req, res) => {
    const resource = resourceBySlug(String(req.params['slug']));
    if (!resource) throw new HttpError(404);
    const row = await getResource(resource, String(req.params['id']).slice(0, 100));
    if (!row) throw new HttpError(404);
    // Фирма без собственик (добавена от кантора) — картата показва прехвърлянето.
    const transfer =
      resource.model === 'Organization' ? await transferStatus(String(row['id'])) : null;
    const error = typeof req.query['greshka'] === 'string' ? req.query['greshka'] : null;
    res.render('admin/record', {
      today: sofiaToday(),
      resource,
      row,
      transfer,
      revoked: req.query['otneta'] === '1',
      error: error && /^[a-zA-Z.]{1,40}$/.test(error) ? error : null,
      check:
        typeof req.query['proverka'] === 'string' && /^[a-zA-Z-]{1,40}$/.test(req.query['proverka'])
          ? req.query['proverka']
          : null,
    });
  });

  // --- Функции (глобално включване) ------------------------------------------------------------------
  router.get('/admin/funktsii', async (req, res) => {
    const flags = await prisma.featureFlag.findMany();
    const enabled = new Map(flags.map((flag) => [flag.code, flag.enabled]));
    res.render('admin/features', {
      features: FEATURES,
      groups: FEATURE_GROUPS,
      enabled,
      saved: req.query['ok'] === '1',
    });
  });

  router.post('/admin/funktsii', async (req, res) => {
    const body = req.body as Record<string, unknown>;
    const actorId = req.principal!.user.id;
    await prisma.$transaction(async (tx) => {
      for (const feature of FEATURES) {
        const enabled = body[`f_${feature.code}`] === 'on';
        await tx.featureFlag.upsert({
          where: { code: feature.code },
          create: { code: feature.code, enabled, updatedById: actorId },
          update: { enabled, updatedById: actorId },
        });
      }
      await audit(tx, { actorId, action: 'admin.features.saved' });
    });
    res.redirect(303, '/admin/funktsii?ok=1');
  });

  // --- Планове и цени --------------------------------------------------------------------------------
  router.get('/admin/planove/:code', async (req, res) => {
    const plan = await prisma.plan.findUnique({ where: { code: String(req.params['code']) } });
    if (!plan) throw new HttpError(404);
    res.render('admin/plan', {
      plan,
      features: FEATURES,
      errors: {},
      saved: req.query['ok'] === '1',
    });
  });

  router.post('/admin/planove/:code', async (req, res) => {
    const plan = await prisma.plan.findUnique({ where: { code: String(req.params['code']) } });
    if (!plan) throw new HttpError(404);
    const parsed = PlanForm.safeParse(req.body);
    if (!parsed.success) {
      const errors: Record<string, string> = {};
      for (const issue of parsed.error.issues)
        errors[String(issue.path[0] ?? 'form')] ??= issue.message;
      return res
        .status(400)
        .render('admin/plan', { plan, features: FEATURES, errors, saved: false });
    }
    const data = parsed.data;
    await prisma.$transaction(async (tx) => {
      await tx.plan.update({
        where: { id: plan.id },
        data: {
          nameBg: data.nameBg,
          nameEn: data.nameEn,
          priceMonthlyCents: data.priceMonthly,
          priceYearlyCents: data.priceYearly,
          perClientCompanyCents: data.perClientCompany,
          includedClientCompanies: data.includedClientCompanies,
          maxUsers: data.maxUsers,
          maxCompanies: data.maxCompanies,
          monthlyDocumentSoftLimit: data.monthlyDocumentSoftLimit,
          sortOrder: data.sortOrder,
          highlighted: data.highlighted,
          isPublic: data.isPublic,
          isActive: data.isActive,
          features: data.features,
        },
      });
      await audit(tx, {
        actorId: req.principal!.user.id,
        action: 'admin.plan.saved',
        targetType: 'Plan',
        targetId: plan.code,
        details: { priceMonthlyCents: data.priceMonthly, priceYearlyCents: data.priceYearly },
      });
    });
    invalidatePublicPlans();
    res.redirect(303, `/admin/planove/${plan.code}?ok=1`);
  });

  return router;
}
