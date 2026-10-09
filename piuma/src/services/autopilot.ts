import { Prisma, type Brand } from '@prisma/client';
import { audit } from '../audit.js';
import { config } from '../config.js';
import { prisma } from '../db.js';
import { logger } from '../logger.js';
import { createAnthropicClient, generateDrafts } from '../content/generate.js';
import { parsePlan, type BrandPlan } from '../content/plan.js';
import { draftsNeeded, kindMix, nextPillars, nextSlots, pickAssets } from '../content/schedule.js';
import { brandPostPerformance, performanceContext } from './insights.js';
import { createDraft, type Actor } from './posts.js';

export const AUTOPILOT_ACTOR: Actor = { type: 'SYSTEM', id: null, label: 'автопилот' };

export interface AutopilotOutcome {
  brandId: string;
  slug: string;
  created: number;
  /** Защо не е създал (нищо): без план, без материал, без ключ, нищо не липсва… */
  reason: string | null;
}

export class AutopilotError extends Error {}

function asJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

/** Кога за последно е ползван всеки материал — за честно редуване. */
async function assetUsage(brandId: string, urls: string[]): Promise<Map<string, Date>> {
  const rows = await prisma.post.groupBy({
    by: ['mediaUrl'],
    where: { brandId, mediaUrl: { in: urls } },
    _max: { createdAt: true },
  });
  const map = new Map<string, Date>();
  for (const row of rows) if (row._max.createdAt) map.set(row.mediaUrl, row._max.createdAt);
  return map;
}

/**
 * Един цикъл за един бранд. Инварианти:
 * - произвежда само ЧЕРНОВИ (човекът одобрява) и само от реални материали в библиотеката;
 * - не надхвърля плана: брои живите постове за седмицата и допълва до `postsPerWeek`;
 * - чете Insights и учи от тях, но не пише в Instagram.
 */
export async function runAutopilotForBrand(
  brandId: string,
  trigger: 'schedule' | 'manual' = 'schedule',
): Promise<AutopilotOutcome> {
  const cfg = config();
  const brand = await prisma.brand.findUnique({
    where: { id: brandId },
    include: { accounts: { where: { status: 'ACTIVE' }, take: 1 } },
  });
  if (!brand) throw new AutopilotError('Няма такъв бранд.');
  const outcome: AutopilotOutcome = {
    brandId: brand.id,
    slug: brand.slug,
    created: 0,
    reason: null,
  };

  const plan = parsePlan(brand.plan);
  if (!brand.managed || !plan)
    return { ...outcome, reason: 'Брандът не е под управление или няма план.' };
  if (!cfg.ANTHROPIC_API_KEY) return { ...outcome, reason: 'Липсва ANTHROPIC_API_KEY на сървъра.' };
  if (!plan.assets.length) return { ...outcome, reason: 'Библиотеката с материали е празна.' };
  const account = brand.accounts[0];
  if (!account) return { ...outcome, reason: 'Няма активен Instagram акаунт.' };

  const weekAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000);
  const [alive, scheduled] = await Promise.all([
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
    prisma.post.findMany({
      where: { brandId: brand.id, status: 'SCHEDULED', scheduledAt: { not: null } },
      select: { scheduledAt: true },
    }),
  ]);
  const needed = draftsNeeded(plan, alive);
  if (needed === 0) return { ...outcome, reason: 'Седмицата е покрита — нищо не липсва.' };

  const usage = await assetUsage(
    brand.id,
    plan.assets.map((asset) => asset.url),
  );
  const kinds = kindMix(needed, plan.reelsShare, {
    image: plan.assets.filter((asset) => asset.kind === 'IMAGE').length,
    reels: plan.assets.filter((asset) => asset.kind === 'REELS').length,
  });
  const assets = pickAssets(plan.assets, usage, kinds);
  if (!assets.length) return { ...outcome, reason: 'Няма материал за нужния вид публикации.' };

  const pillarOffset = await prisma.post.count({
    where: { brandId: brand.id, createdByLabel: AUTOPILOT_ACTOR.label },
  });
  const pillars = nextPillars(plan.pillars, pillarOffset, assets.length);
  const slots = nextSlots(
    plan.postingTimes,
    assets.length,
    new Date(),
    new Set(scheduled.map((row) => row.scheduledAt!.getTime())),
  );
  const performance = performanceContext(await brandPostPerformance(brand.id));
  const client = createAnthropicClient(cfg.ANTHROPIC_API_KEY);

  for (const [index, asset] of assets.entries()) {
    const topic = pillars[index] ?? plan.pillars[0]!;
    const drafts = await generateDrafts(client, {
      brand: {
        name: brand.name,
        summary: brand.summary,
        voice: brand.voice,
        language: brand.language,
        websiteUrl: brand.websiteUrl,
      },
      kind: asset.kind,
      topic,
      count: 1,
      mediaDescription: asset.description,
      plan,
      performance,
      crossPost: plan.crossPost,
    });
    const draft = drafts[0];
    if (!draft) continue;
    const suggestedAt = slots[index];
    const { post } = await createDraft(
      {
        brandId: brand.id,
        accountId: account.id,
        kind: asset.kind,
        caption: draft.caption,
        hashtags: draft.hashtags,
        altText: draft.altText,
        mediaUrl: asset.url,
        ...(asset.coverUrl ? { coverUrl: asset.coverUrl } : {}),
        aiAssisted: true,
        topic,
        variants: draft.variants,
        ...(suggestedAt ? { suggestedAt } : {}),
      },
      AUTOPILOT_ACTOR,
    );
    await audit(
      { ...AUTOPILOT_ACTOR, ip: null },
      {
        action: 'post.draft.autopilot',
        targetType: 'Post',
        targetId: post.id,
        detail: { brand: brand.slug, topic, trigger, rationale: draft.rationale },
      },
    );
    outcome.created += 1;
  }

  await prisma.brand.update({
    where: { id: brand.id },
    data: { lastAutopilotAt: new Date(), plan: asJson(plan) },
  });
  return outcome;
}

/** Седмичната задача — всеки управляван бранд поотделно; грешка в един не спира другите. */
export async function runAutopilot(): Promise<AutopilotOutcome[]> {
  const brands: Pick<Brand, 'id' | 'slug'>[] = await prisma.brand.findMany({
    where: { managed: true },
    select: { id: true, slug: true },
    orderBy: { name: 'asc' },
  });
  const outcomes: AutopilotOutcome[] = [];
  for (const brand of brands) {
    try {
      outcomes.push(await runAutopilotForBrand(brand.id));
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'неизвестна грешка';
      logger.error({ brandId: brand.id, err: reason }, 'автопилотът се провали за бранда');
      outcomes.push({ brandId: brand.id, slug: brand.slug, created: 0, reason });
    }
  }
  return outcomes;
}

export type { BrandPlan };
