import type { InstagramAccount, PostKind } from '@prisma/client';
import { config } from '../config.js';
import { prisma } from '../db.js';
import { logger } from '../logger.js';
import { fetchAccountInsights, fetchMediaInsights } from '../instagram/insights.js';
import type { PublishDeps } from '../instagram/publish.js';
import type { PerformanceContext } from '../content/prompt.js';
import { accountToken } from './accounts.js';

export const INSIGHTS_SCOPE = 'instagram_business_manage_insights';
/** Публикации по-стари от това не се опресняват — Meta спира да мени числата им. */
const MEDIA_WINDOW_DAYS = 90;

export function hasInsightsScope(account: Pick<InstagramAccount, 'scopes'>): boolean {
  return account.scopes
    .split(',')
    .map((s) => s.trim())
    .includes(INSIGHTS_SCOPE);
}

function depsFor(account: InstagramAccount): PublishDeps {
  return { cfg: config(), igUserId: account.igUserId, accessToken: accountToken(account) };
}

function startOfUtcDay(date = new Date()): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

/** Дърпа метриките на един публикуван пост и ги записва като нова моментна снимка. */
export async function syncPostInsights(postId: string): Promise<void> {
  const post = await prisma.post.findUnique({ where: { id: postId }, include: { account: true } });
  if (!post?.igMediaId || !post.account) throw new Error('Постът не е публикуван през Публикатор.');
  if (post.account.status !== 'ACTIVE') throw new Error('Акаунтът не е активен.');
  if (!hasInsightsScope(post.account)) {
    throw new Error(`Токенът няма ${INSIGHTS_SCOPE} — свържи акаунта отново.`);
  }
  const metrics = await fetchMediaInsights(depsFor(post.account), post.igMediaId);
  await prisma.mediaInsight.create({ data: { postId: post.id, ...metrics } });
}

/** Дневната снимка на акаунта — една на ден (upsert), за тренд на последователи/обхват. */
export async function syncAccountInsights(accountId: string): Promise<void> {
  const account = await prisma.instagramAccount.findUniqueOrThrow({ where: { id: accountId } });
  if (account.status !== 'ACTIVE') throw new Error('Акаунтът не е активен.');
  if (!hasInsightsScope(account)) {
    throw new Error(`Токенът няма ${INSIGHTS_SCOPE} — свържи акаунта отново.`);
  }
  const metrics = await fetchAccountInsights(depsFor(account));
  const day = startOfUtcDay();
  await prisma.accountInsight.upsert({
    where: { accountId_day: { accountId: account.id, day } },
    create: { accountId: account.id, day, ...metrics },
    update: { ...metrics, fetchedAt: new Date() },
  });
}

export interface SyncSummary {
  accounts: number;
  posts: number;
  skipped: number;
  errors: number;
}

/**
 * Пълна синхронизация — дневна задача. Грешка на един акаунт/пост не спира другите;
 * всяка се логва без токен и без caption.
 */
export async function syncAllInsights(): Promise<SyncSummary> {
  const summary: SyncSummary = { accounts: 0, posts: 0, skipped: 0, errors: 0 };
  const accounts = await prisma.instagramAccount.findMany({ where: { status: 'ACTIVE' } });
  const since = new Date(Date.now() - MEDIA_WINDOW_DAYS * 24 * 3600 * 1000);

  for (const account of accounts) {
    if (!hasInsightsScope(account)) {
      summary.skipped += 1;
      continue;
    }
    try {
      await syncAccountInsights(account.id);
      summary.accounts += 1;
    } catch (error) {
      summary.errors += 1;
      logger.warn(
        { accountId: account.id, err: error instanceof Error ? error.message : 'неизвестна' },
        'insights на акаунта не се синхронизираха',
      );
    }
    const posts = await prisma.post.findMany({
      where: {
        accountId: account.id,
        status: 'PUBLISHED',
        igMediaId: { not: null },
        publishedAt: { gte: since },
      },
      select: { id: true },
    });
    for (const post of posts) {
      try {
        await syncPostInsights(post.id);
        summary.posts += 1;
      } catch (error) {
        summary.errors += 1;
        logger.warn(
          { postId: post.id, err: error instanceof Error ? error.message : 'неизвестна' },
          'insights на поста не се синхронизираха',
        );
      }
    }
  }
  return summary;
}

export interface PostPerformance {
  id: string;
  kind: PostKind;
  caption: string;
  permalink: string | null;
  publishedAt: Date | null;
  reach: number;
  views: number;
  interactions: number;
  /** взаимодействия / обхват, в проценти; 0 при липсващ обхват. */
  engagementRate: number;
  fetchedAt: Date;
}

/** Последната снимка на всеки публикуван пост на бранда, подредена по ангажираност. */
export async function brandPostPerformance(brandId: string, take = 50): Promise<PostPerformance[]> {
  const posts = await prisma.post.findMany({
    where: { brandId, status: 'PUBLISHED' },
    orderBy: { publishedAt: 'desc' },
    take,
    include: { insights: { orderBy: { fetchedAt: 'desc' }, take: 1 } },
  });
  return posts
    .flatMap((post) => {
      const snapshot = post.insights[0];
      if (!snapshot) return [];
      const reach = snapshot.reach ?? 0;
      const interactions =
        snapshot.totalInteractions ??
        (snapshot.likes ?? 0) +
          (snapshot.comments ?? 0) +
          (snapshot.saved ?? 0) +
          (snapshot.shares ?? 0);
      return [
        {
          id: post.id,
          kind: post.kind,
          caption: post.caption,
          permalink: post.permalink,
          publishedAt: post.publishedAt,
          reach,
          views: snapshot.views ?? 0,
          interactions,
          engagementRate: reach > 0 ? Math.round((interactions / reach) * 1000) / 10 : 0,
          fetchedAt: snapshot.fetchedAt,
        },
      ];
    })
    .sort((a, b) => b.engagementRate - a.engagementRate || b.reach - a.reach);
}

/** Контекст за модела — най-силните и най-слабите, плюс форматът с повече обхват. */
export function performanceContext(rows: PostPerformance[], top = 3, weak = 2): PerformanceContext {
  const pick = (row: PostPerformance) => ({
    caption: row.caption,
    kind: row.kind,
    reach: row.reach,
    interactions: row.interactions,
  });
  const avg = (kind: PostKind): number | null => {
    const subset = rows.filter((row) => row.kind === kind && row.reach > 0);
    if (!subset.length) return null;
    return subset.reduce((sum, row) => sum + row.reach, 0) / subset.length;
  };
  const image = avg('IMAGE');
  const reels = avg('REELS');
  let bestKind: PerformanceContext['bestKind'] = null;
  if (image !== null && reels !== null) bestKind = reels > image ? 'REELS' : 'IMAGE';
  return {
    top: rows.slice(0, top).map(pick),
    weak: rows.length > top ? rows.slice(-weak).map(pick) : [],
    bestKind,
  };
}

export interface AccountTrend {
  day: Date;
  reach: number | null;
  views: number | null;
  followerCount: number | null;
  engaged: number | null;
}

export async function accountTrend(accountId: string, days = 30): Promise<AccountTrend[]> {
  const since = startOfUtcDay(new Date(Date.now() - days * 24 * 3600 * 1000));
  const rows = await prisma.accountInsight.findMany({
    where: { accountId, day: { gte: since } },
    orderBy: { day: 'asc' },
    select: { day: true, reach: true, views: true, followerCount: true, engaged: true },
  });
  return rows;
}
