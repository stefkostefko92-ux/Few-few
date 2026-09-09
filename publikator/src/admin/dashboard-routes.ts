import { Router } from 'express';
import { prisma } from '../db.js';
import { requireCapability, requireLogin } from '../auth/guards.js';

export const dashboardRouter: Router = Router();

dashboardRouter.get(
  '/admin',
  requireLogin,
  requireCapability('dashboard:view'),
  async (_req, res) => {
    const weekAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000);
    const tokenHorizon = new Date(Date.now() + 10 * 24 * 3600 * 1000);

    const [
      byStatus,
      publishedWeek,
      upcoming,
      failed,
      expiringAccounts,
      accounts,
      recentDrafts,
      managed,
    ] = await Promise.all([
      prisma.post.groupBy({ by: ['status'], _count: { _all: true } }),
      prisma.post.count({ where: { status: 'PUBLISHED', publishedAt: { gte: weekAgo } } }),
      prisma.post.findMany({
        where: { status: 'SCHEDULED' },
        orderBy: { scheduledAt: 'asc' },
        take: 8,
        include: {
          brand: { select: { name: true, slug: true } },
          account: { select: { username: true } },
        },
      }),
      prisma.post.findMany({
        where: { status: 'FAILED' },
        orderBy: { updatedAt: 'desc' },
        take: 8,
        include: { brand: { select: { name: true, slug: true } } },
      }),
      prisma.instagramAccount.findMany({
        where: {
          OR: [
            { status: 'TOKEN_EXPIRED' },
            { status: 'ACTIVE', tokenExpiresAt: { lte: tokenHorizon } },
          ],
        },
        include: { brand: { select: { name: true } } },
      }),
      prisma.instagramAccount.findMany({
        where: { status: 'ACTIVE' },
        include: { brand: { select: { name: true } } },
        orderBy: { username: 'asc' },
      }),
      prisma.post.findMany({
        where: { status: 'DRAFT' },
        orderBy: { createdAt: 'desc' },
        take: 8,
        include: { brand: { select: { name: true } } },
      }),
      prisma.brand.findMany({
        where: { managed: true },
        orderBy: { name: 'asc' },
        select: {
          id: true,
          name: true,
          slug: true,
          lastAutopilotAt: true,
          plan: true,
          _count: { select: { posts: { where: { status: 'DRAFT' } } } },
        },
      }),
    ]);

    const counts: Record<string, number> = {};
    for (const row of byStatus) counts[row.status] = row._count._all;

    res.render('admin/dashboard', {
      title: 'Табло',
      counts,
      publishedWeek,
      upcoming,
      failed,
      expiringAccounts,
      accounts,
      recentDrafts,
      managed,
    });
  },
);
