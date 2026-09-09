import { Router } from 'express';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { audit } from '../audit.js';
import { prisma } from '../db.js';
import { requireCapability, requireCsrf, requireLogin } from '../auth/guards.js';
import { assetToLine, brandPlanSchema, parsePlan, planFromForm } from '../content/plan.js';
import { actorOf, optionalField, setFlash, stringField } from './helpers.js';

const brandSchema = z.object({
  slug: z.string().regex(/^[a-z0-9-]{2,40}$/, 'slug: малки латински букви, цифри и тире'),
  name: z.string().min(2).max(120),
  summary: z.string().min(10).max(2000),
  voice: z.string().min(5).max(2000),
  language: z.string().regex(/^[a-z]{2}(-[A-Z]{2})?$/, 'език по BCP-47, напр. bg'),
  websiteUrl: z.string().url().optional(),
});

function brandFromBody(body: unknown) {
  return brandSchema.safeParse({
    slug: stringField(body, 'slug').toLowerCase(),
    name: stringField(body, 'name'),
    summary: stringField(body, 'summary'),
    voice: stringField(body, 'voice'),
    language: stringField(body, 'language') || 'bg',
    websiteUrl: optionalField(body, 'websiteUrl'),
  });
}

/**
 * Секцията „Управление“: план за автопилота. Без план брандът може да е „под управление“
 * само ако формата го е валидирала — иначе автопилотът мълчаливо няма какво да прави.
 */
function planFromBody(body: unknown) {
  const managed = stringField(body, 'managed') === 'on';
  const record = (body ?? {}) as Record<string, unknown>;
  const parsed = brandPlanSchema.safeParse(planFromForm(record));
  return { managed, parsed };
}

/** Планът, разгънат за формата (текстови полета). */
export function planFormValues(raw: unknown): Record<string, string | string[]> {
  const plan = parsePlan(raw);
  if (!plan)
    return {
      postsPerWeek: '3',
      reelsShare: '0.5',
      postingTimes: '08:30, 20:00',
      crossPost: ['facebook'],
    };
  return {
    postsPerWeek: String(plan.postsPerWeek),
    reelsShare: String(plan.reelsShare),
    pillars: plan.pillars.join('\n'),
    postingTimes: plan.postingTimes.join(', '),
    hashtagSets: plan.hashtagSets.map((set) => set.join(' ')).join('\n'),
    cta: plan.cta,
    goals: plan.goals,
    keywords: plan.keywords.join(', '),
    avoid: plan.avoid,
    crossPost: plan.crossPost,
    assets: plan.assets.map(assetToLine).join('\n'),
  };
}

function planIssues(parsed: ReturnType<typeof brandPlanSchema.safeParse>): string[] {
  if (parsed.success) return [];
  return parsed.error.issues.map((issue) => `план.${issue.path.join('.')}: ${issue.message}`);
}

function asJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

export const brandRouter: Router = Router();
brandRouter.use('/admin/brands', requireLogin);

brandRouter.get('/admin/brands', requireCapability('brands:view'), async (_req, res) => {
  const brands = await prisma.brand.findMany({
    orderBy: { name: 'asc' },
    include: { _count: { select: { posts: true, accounts: true } } },
  });
  res.render('admin/brands', { title: 'Брандове', brands });
});

brandRouter.get('/admin/brands/new', requireCapability('brands:manage'), (_req, res) => {
  res.render('admin/brand-form', {
    title: 'Нов бранд',
    brand: null,
    plan: planFormValues(null),
    managed: false,
    errors: [],
  });
});

brandRouter.post(
  '/admin/brands',
  requireCapability('brands:manage'),
  requireCsrf,
  async (req, res) => {
    const input = brandFromBody(req.body);
    const { managed, parsed } = planFromBody(req.body);
    const errors = [...(input.success ? [] : input.error.issues.map((issue) => issue.message))];
    if (managed) errors.push(...planIssues(parsed));
    const back = (status: number, extra: string[]) =>
      res.status(status).render('admin/brand-form', {
        title: 'Нов бранд',
        brand: req.body,
        plan: req.body,
        managed,
        errors: [...errors, ...extra],
      });
    if (!input.success || errors.length) {
      back(400, []);
      return;
    }
    const exists = await prisma.brand.findUnique({ where: { slug: input.data.slug } });
    if (exists) {
      back(409, ['Този slug вече съществува.']);
      return;
    }
    const brand = await prisma.brand.create({
      data: {
        ...input.data,
        websiteUrl: input.data.websiteUrl ?? null,
        managed,
        plan: parsed.success ? asJson(parsed.data) : undefined,
      },
    });
    await audit(actorOf(req), {
      action: 'brand.create',
      targetType: 'Brand',
      targetId: brand.id,
      detail: { slug: brand.slug, managed },
    });
    setFlash(res, 'ok', `Брандът „${brand.name}“ е създаден.`);
    res.redirect('/admin/brands');
  },
);

brandRouter.get('/admin/brands/:id/edit', requireCapability('brands:manage'), async (req, res) => {
  const brand = await prisma.brand.findUnique({ where: { id: String(req.params.id) } });
  if (!brand) {
    res
      .status(404)
      .render('admin/error', { title: 'Няма такъв бранд', message: 'Брандът не е намерен.' });
    return;
  }
  res.render('admin/brand-form', {
    title: `Бранд: ${brand.name}`,
    brand,
    plan: planFormValues(brand.plan),
    managed: brand.managed,
    errors: [],
  });
});

brandRouter.post(
  '/admin/brands/:id',
  requireCapability('brands:manage'),
  requireCsrf,
  async (req, res) => {
    const id = String(req.params.id);
    const input = brandFromBody(req.body);
    const { managed, parsed } = planFromBody(req.body);
    const errors = [...(input.success ? [] : input.error.issues.map((issue) => issue.message))];
    if (managed) errors.push(...planIssues(parsed));
    const back = (status: number, extra: string[]) =>
      res.status(status).render('admin/brand-form', {
        title: 'Бранд',
        brand: { id, ...(req.body as object) },
        plan: req.body,
        managed,
        errors: [...errors, ...extra],
      });
    if (!input.success || errors.length) {
      back(400, []);
      return;
    }
    const clash = await prisma.brand.findFirst({ where: { slug: input.data.slug, NOT: { id } } });
    if (clash) {
      back(409, ['Този slug е зает от друг бранд.']);
      return;
    }
    const brand = await prisma.brand.update({
      where: { id },
      data: {
        ...input.data,
        websiteUrl: input.data.websiteUrl ?? null,
        managed,
        // Планът се пази и при спряно управление — за да не се губи при временно спиране.
        plan: parsed.success ? asJson(parsed.data) : undefined,
      },
    });
    await audit(actorOf(req), {
      action: 'brand.update',
      targetType: 'Brand',
      targetId: brand.id,
      detail: { slug: brand.slug, managed },
    });
    setFlash(res, 'ok', 'Брандът е обновен.');
    res.redirect('/admin/brands');
  },
);
