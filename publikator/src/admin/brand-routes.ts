import { Router } from 'express';
import { z } from 'zod';
import { audit } from '../audit.js';
import { prisma } from '../db.js';
import { requireCapability, requireCsrf, requireLogin } from '../auth/guards.js';
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
  res.render('admin/brand-form', { title: 'Нов бранд', brand: null, errors: [] });
});

brandRouter.post(
  '/admin/brands',
  requireCapability('brands:manage'),
  requireCsrf,
  async (req, res) => {
    const input = brandFromBody(req.body);
    if (!input.success) {
      res.status(400).render('admin/brand-form', {
        title: 'Нов бранд',
        brand: req.body,
        errors: input.error.issues.map((issue) => issue.message),
      });
      return;
    }
    const exists = await prisma.brand.findUnique({ where: { slug: input.data.slug } });
    if (exists) {
      res.status(409).render('admin/brand-form', {
        title: 'Нов бранд',
        brand: req.body,
        errors: ['Този slug вече съществува.'],
      });
      return;
    }
    const brand = await prisma.brand.create({
      data: { ...input.data, websiteUrl: input.data.websiteUrl ?? null },
    });
    await audit(actorOf(req), {
      action: 'brand.create',
      targetType: 'Brand',
      targetId: brand.id,
      detail: { slug: brand.slug },
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
  res.render('admin/brand-form', { title: `Бранд: ${brand.name}`, brand, errors: [] });
});

brandRouter.post(
  '/admin/brands/:id',
  requireCapability('brands:manage'),
  requireCsrf,
  async (req, res) => {
    const id = String(req.params.id);
    const input = brandFromBody(req.body);
    if (!input.success) {
      res.status(400).render('admin/brand-form', {
        title: 'Бранд',
        brand: { id, ...(req.body as object) },
        errors: input.error.issues.map((issue) => issue.message),
      });
      return;
    }
    const clash = await prisma.brand.findFirst({ where: { slug: input.data.slug, NOT: { id } } });
    if (clash) {
      res.status(409).render('admin/brand-form', {
        title: 'Бранд',
        brand: { id, ...(req.body as object) },
        errors: ['Този slug е зает от друг бранд.'],
      });
      return;
    }
    const brand = await prisma.brand.update({
      where: { id },
      data: { ...input.data, websiteUrl: input.data.websiteUrl ?? null },
    });
    await audit(actorOf(req), {
      action: 'brand.update',
      targetType: 'Brand',
      targetId: brand.id,
      detail: { slug: brand.slug },
    });
    setFlash(res, 'ok', 'Брандът е обновен.');
    res.redirect('/admin/brands');
  },
);
