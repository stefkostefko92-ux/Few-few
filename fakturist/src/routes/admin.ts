import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { audit } from '../audit.js';
import { HttpError, requireMaster, requireUser } from '../auth/guards.js';
import { sealHmac } from '../auth/keys.js';
import {
  ADMIN_RESOURCES,
  countResource,
  getResource,
  listResource,
  PAGE_SIZE,
  resourceBySlug,
} from '../admin/registry.js';
import { invalidateSettings, SETTINGS, setting, type SettingKey } from '../admin/settings.js';
import { FEATURES, FEATURE_GROUPS, isFeatureCode } from '../features.js';
import { invalidatePublicPlans } from '../billing/public-plans.js';
import {
  CHAIN_START,
  sha256,
  verifyChainFrom,
  type ChainProblem,
  type ChainState,
} from '../ledger/chain.js';
import { money } from '../http/view.js';
import { decideMandate } from '../accounts/mandates.js';

/** Цена от формата на панела: „9,00“ → 900 цента; празно → null („по договор“). */
const centsField = z
  .string()
  .trim()
  .transform((value) => value.replace(',', '.'))
  .refine((value) => value === '' || /^\d{1,7}(\.\d{1,2})?$/.test(value), 'invalidAmount')
  .transform((value) => (value === '' ? null : Math.round(Number(value) * 100)));
const intField = z
  .string()
  .trim()
  .refine((value) => value === '' || /^\d{1,7}$/.test(value), 'invalidNumber')
  .transform((value) => (value === '' ? null : Number(value)));
const checkbox = z.union([z.literal('on'), z.undefined()]).transform((value) => value === 'on');

const PlanForm = z.object({
  nameBg: z.string().trim().min(1).max(60),
  nameEn: z.string().trim().min(1).max(60),
  priceMonthly: centsField,
  priceYearly: centsField,
  perClientCompany: centsField,
  includedClientCompanies: intField,
  maxUsers: intField,
  maxCompanies: intField,
  monthlyDocumentSoftLimit: intField,
  sortOrder: z.coerce.number().int().min(0).max(1000),
  highlighted: checkbox,
  isPublic: checkbox,
  isActive: checkbox,
  features: z
    .union([z.string(), z.array(z.string())])
    .optional()
    .transform((value) => (value === undefined ? [] : Array.isArray(value) ? value : [value]))
    .refine((codes) => codes.every(isFeatureCode), 'unknownFeature'),
});

export function adminRouter(): Router {
  const router = Router();
  router.use('/admin', requireUser(), requireMaster());

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
    res.render('admin/dashboard', {
      counts,
      issuedThisMonth,
      firms,
      companies,
      revenue: money(revenue._sum.amountCents ?? 0, 'EUR', res.locals.lang),
      recent,
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
    res.render('admin/record', { resource, row });
  });

  // --- Настройки -------------------------------------------------------------------------------------
  router.get('/admin/nastroyki', async (_req, res) => {
    const values: Record<string, unknown> = {};
    for (const key of Object.keys(SETTINGS) as SettingKey[]) values[key] = await setting(key);
    res.render('admin/settings', { settings: SETTINGS, values, saved: _req.query['ok'] === '1' });
  });

  router.post('/admin/nastroyki', async (req, res) => {
    const body = req.body as Record<string, unknown>;
    const actorId = req.principal!.user.id;
    await prisma.$transaction(async (tx) => {
      for (const [key, definition] of Object.entries(SETTINGS)) {
        const raw = body[key];
        let value: unknown;
        if (typeof definition.default === 'boolean') value = raw === 'on';
        else if (typeof definition.default === 'number') value = Number(raw);
        else value = typeof raw === 'string' ? raw.trim() : definition.default;
        const parsed = definition.schema.safeParse(value);
        if (!parsed.success) throw new HttpError(400, `Невалидна стойност за ${key}`);
        await tx.setting.upsert({
          where: { key },
          create: { key, value: parsed.data, updatedById: actorId },
          update: { value: parsed.data, updatedById: actorId },
        });
      }
      await audit(tx, { actorId, action: 'admin.settings.saved' });
    });
    invalidateSettings();
    res.redirect(303, '/admin/nastroyki?ok=1');
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

  // --- Проверка на веригата на документите на фирма --------------------------------------------------
  router.get('/admin/veriga/:orgId', async (req, res) => {
    const organizationId = String(req.params['orgId']);
    const org = await prisma.organization.findUnique({ where: { id: organizationId } });
    if (!org) throw new HttpError(404);
    // На страници по 500 — голяма фирма не зарежда всичките си XML-и наведнъж.
    let state: ChainState = CHAIN_START;
    let problem: ChainProblem | null = null;
    let count = 0;
    for (;;) {
      const docs = await prisma.document.findMany({
        where: { organizationId, chainIndex: { gte: state.nextIndex } },
        orderBy: { chainIndex: 'asc' },
        take: 500,
        select: {
          organizationId: true,
          chainIndex: true,
          number: true,
          typeCode: true,
          issueDate: true,
          payableCents: true,
          vatCents: true,
          ublXml: true,
          ciiXml: true,
          prevHash: true,
          sha256: true,
          seal: true,
        },
      });
      if (docs.length === 0) break;
      const result = verifyChainFrom(
        docs.map((d) => ({
          organizationId: d.organizationId,
          chainIndex: d.chainIndex!,
          number: d.number ?? '',
          typeCode: d.typeCode,
          status: 'ISSUED' as const,
          issueDate: d.issueDate.toISOString().slice(0, 10),
          payableCents: d.payableCents,
          vatCents: d.vatCents,
          ublSha256: sha256(d.ublXml ?? ''),
          ciiSha256: sha256(d.ciiXml ?? ''),
          prevHash: d.prevHash ?? '',
          sha256: d.sha256 ?? '',
          seal: d.seal ?? '',
        })),
        sealHmac,
        state,
      );
      count += docs.length;
      if (result.problem) {
        problem = result.problem;
        break;
      }
      state = result.state;
      if (docs.length < 500) break;
    }
    res.render('admin/chain', { org, count, problem });
  });

  // --- Ръчно потвърждение на плащане (банков превод към Revolut Business) -----------------------------
  router.post('/admin/plashtaniya/:id/potvardi', async (req, res) => {
    const payment = await prisma.payment.findUnique({ where: { id: String(req.params['id']) } });
    if (!payment) throw new HttpError(404);
    await prisma.$transaction(async (tx) => {
      // Условен запис: две едновременни потвърждения (или потвърждение + webhook) не минават двете.
      const updated = await tx.payment.updateMany({
        where: { id: payment.id, status: 'PENDING' },
        data: { status: 'COMPLETED', paidAt: new Date() },
      });
      if (updated.count !== 1) throw new HttpError(409);
      await audit(tx, {
        actorId: req.principal!.user.id,
        organizationId: payment.organizationId,
        action: 'billing.payment.confirmed',
        targetType: 'Payment',
        targetId: payment.id,
        details: { amountCents: payment.amountCents },
      });
    });
    res.redirect(303, `/admin/r/payments/${payment.id}`);
  });

  // --- Пълномощни и потвърждаване на фирми ----------------------------------------------------------
  router.post('/admin/palnomoshtni/:id/:decision', async (req, res) => {
    const decision =
      req.params['decision'] === 'potvardi'
        ? 'approve'
        : req.params['decision'] === 'ottegli'
          ? 'revoke'
          : null;
    if (!decision) throw new HttpError(404);
    const mandateId = String(req.params['id']);
    await decideMandate({
      mandateId,
      actorId: req.principal!.user.id,
      decision,
      clientOrgId: null,
    });
    res.redirect(303, `/admin/r/mandates/${mandateId}`);
  });

  router.post('/admin/firmi/:id/potvardi', async (req, res) => {
    const id = String(req.params['id']);
    await prisma.$transaction(async (tx) => {
      const updated = await tx.organization.updateMany({
        where: { id, verifiedAt: null },
        data: { verifiedAt: new Date() },
      });
      if (updated.count !== 1) throw new HttpError(409);
      await audit(tx, {
        actorId: req.principal!.user.id,
        organizationId: id,
        action: 'organization.verified',
        targetType: 'Organization',
        targetId: id,
      });
    });
    res.redirect(303, `/admin/r/organizations/${id}`);
  });

  return router;
}
