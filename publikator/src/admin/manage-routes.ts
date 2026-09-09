import { Router } from 'express';
import { audit } from '../audit.js';
import { config } from '../config.js';
import { prisma } from '../db.js';
import { requireCapability, requireCsrf, requireLogin } from '../auth/guards.js';
import { parsePlan } from '../content/plan.js';
import { enqueueAutopilot, enqueueInsightsSync } from '../queue/publish-queue.js';
import {
  accountTrend,
  brandPostPerformance,
  hasInsightsScope,
  syncPostInsights,
} from '../services/insights.js';
import { actorOf, setFlash } from './helpers.js';

/**
 * „Управление“ на страниците: представяне (Insights), автопилот, ръчно опресняване.
 * Всичко тук ЧЕТЕ от Instagram и пише само чернови през опашката — публикуване няма.
 */
export const manageRouter: Router = Router();
manageRouter.use('/admin/brands', requireLogin);
manageRouter.use('/admin/insights', requireLogin);
manageRouter.use('/admin/posts', requireLogin);

manageRouter.get(
  '/admin/brands/:id/performance',
  requireCapability('insights:view'),
  async (req, res) => {
    const brand = await prisma.brand.findUnique({
      where: { id: String(req.params.id) },
      include: { accounts: { orderBy: { username: 'asc' } } },
    });
    if (!brand) {
      res
        .status(404)
        .render('admin/error', { title: 'Няма такъв бранд', message: 'Брандът не е намерен.' });
      return;
    }
    const weekAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000);
    const [performance, trends, pendingDrafts, weekAlive] = await Promise.all([
      brandPostPerformance(brand.id),
      Promise.all(
        brand.accounts.map(async (account) => ({
          account,
          insightsScope: hasInsightsScope(account),
          rows: await accountTrend(account.id),
        })),
      ),
      prisma.post.count({ where: { brandId: brand.id, status: 'DRAFT' } }),
      prisma.post.count({
        where: {
          brandId: brand.id,
          OR: [
            { status: { in: ['DRAFT', 'APPROVED'] }, createdAt: { gte: weekAgo } },
            { status: { in: ['SCHEDULED', 'PUBLISHING'] } },
            { status: 'PUBLISHED', publishedAt: { gte: weekAgo } },
          ],
        },
      }),
    ]);
    const plan = parsePlan(brand.plan);
    const latest = trends.map(({ account, rows, insightsScope }) => {
      const last = rows[rows.length - 1] ?? null;
      const first = rows[0] ?? null;
      return {
        account,
        insightsScope,
        rows,
        last,
        followerDelta:
          last?.followerCount != null && first?.followerCount != null
            ? last.followerCount - first.followerCount
            : null,
        reach30: rows.reduce((sum, row) => sum + (row.reach ?? 0), 0),
        views30: rows.reduce((sum, row) => sum + (row.views ?? 0), 0),
      };
    });
    res.render('admin/performance', {
      title: `Представяне · ${brand.name}`,
      brand,
      plan,
      performance,
      accounts: latest,
      pendingDrafts,
      weekAlive,
      generation: Boolean(config().ANTHROPIC_API_KEY),
    });
  },
);

manageRouter.post(
  '/admin/brands/:id/autopilot',
  requireCapability('autopilot:run'),
  requireCsrf,
  async (req, res) => {
    const id = String(req.params.id);
    const brand = await prisma.brand.findUnique({ where: { id } });
    if (!brand) {
      setFlash(res, 'error', 'Няма такъв бранд.');
      res.redirect('/admin/brands');
      return;
    }
    if (!brand.managed || !parsePlan(brand.plan)) {
      setFlash(res, 'error', 'Брандът не е под управление или планът е непълен — редактирай го.');
      res.redirect(`/admin/brands/${id}/performance`);
      return;
    }
    await enqueueAutopilot(id);
    await audit(actorOf(req), { action: 'brand.autopilot.run', targetType: 'Brand', targetId: id });
    setFlash(res, 'ok', 'Автопилотът е пуснат към работника — черновите ще се появят след минута.');
    res.redirect(`/admin/brands/${id}/performance`);
  },
);

manageRouter.post(
  '/admin/insights/sync',
  requireCapability('autopilot:run'),
  requireCsrf,
  async (req, res) => {
    await enqueueInsightsSync();
    await audit(actorOf(req), { action: 'insights.sync', targetType: 'System' });
    setFlash(res, 'ok', 'Синхронизацията на Insights е пусната към работника.');
    // Само вътрешен път — Referer от чужд произход не води никъде.
    const back = String(req.get('referer') ?? '');
    const path = back.startsWith(`${config().PUBLIC_BASE_URL}/admin`)
      ? back.slice(config().PUBLIC_BASE_URL.length)
      : '/admin';
    res.redirect(path);
  },
);

/** Опресняване на един пост — синхронно, защото е една заявка и човекът чака резултата. */
manageRouter.post(
  '/admin/posts/:id/insights',
  requireCapability('insights:view'),
  requireCsrf,
  async (req, res) => {
    const id = String(req.params.id);
    try {
      await syncPostInsights(id);
      setFlash(res, 'ok', 'Метриките са опреснени.');
    } catch (error) {
      setFlash(res, 'error', error instanceof Error ? error.message : 'Неизвестна грешка.');
    }
    res.redirect(`/admin/posts/${id}`);
  },
);
