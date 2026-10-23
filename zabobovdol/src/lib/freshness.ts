import "server-only";
import { prisma } from "@/lib/prisma";
import { sofiaDay } from "@/lib/stats-core";
import {
  DEFAULT_NEWS_LINK_PATTERN,
  MUNICIPALITY_SOURCE,
  isNewsLink,
  resolveLinkPattern,
} from "@/lib/ingest-news-parse";
import {
  FRESHNESS_THRESHOLDS,
  daysAgo,
  evaluateFreshness,
  monthsAgo,
  type FreshnessInput,
  type FreshnessResult,
  type FreshnessThresholds,
} from "@/lib/freshness-core";

export { freshnessText } from "@/lib/freshness-core";
export type { FreshnessResult } from "@/lib/freshness-core";

function newsPattern(): RegExp {
  try {
    return resolveLinkPattern(process.env.MUNICIPALITY_NEWS_LINK_PATTERN);
  } catch {
    // Невалидният шаблон спира самия внос (и той го докладва); тук само броим.
    return resolveLinkPattern(DEFAULT_NEWS_LINK_PATTERN);
  }
}

// Събира броевете от базата и ги оценява по праговете. Само четене; нищо лично.
export async function collectFreshness(
  now: Date = new Date(),
  t: FreshnessThresholds = FRESHNESS_THRESHOLDS,
): Promise<FreshnessInput> {
  const since = daysAgo(now, t.newsDays);
  const verifiedLimit = monthsAgo(now, t.serviceMonths);
  const pattern = newsPattern();

  const [
    imported,
    lastImported,
    published,
    lastPublished,
    drafts,
    pharmacyToday,
    lastDuty,
    scams,
    outages,
    servicesTotal,
    unverified,
  ] = await Promise.all([
    prisma.post.count({ where: { source: MUNICIPALITY_SOURCE, createdAt: { gte: since } } }),
    prisma.post.findFirst({
      where: { source: MUNICIPALITY_SOURCE },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    }),
    prisma.post.count({ where: { published: true, publishedAt: { gte: since } } }),
    prisma.post.findFirst({
      where: { published: true },
      orderBy: { publishedAt: "desc" },
      select: { publishedAt: true },
    }),
    prisma.post.findMany({
      where: { published: false, source: MUNICIPALITY_SOURCE },
      select: { sourceUrl: true, createdAt: true },
    }),
    prisma.dutyRoster.count({ where: { published: true, date: sofiaDay(now) } }),
    prisma.dutyRoster.findFirst({
      where: { published: true },
      orderBy: { date: "desc" },
      select: { date: true },
    }),
    prisma.scamAlert.aggregate({ _count: { _all: true }, _max: { updatedAt: true } }),
    prisma.outage.aggregate({ _count: { _all: true }, _max: { updatedAt: true } }),
    prisma.service.count({ where: { published: true } }),
    prisma.service.findMany({
      where: {
        published: true,
        OR: [{ verifiedAt: null }, { verifiedAt: { lt: verifiedLimit } }],
      },
      select: { name: true, verifiedAt: true },
      orderBy: [{ order: "asc" }, { name: "asc" }],
    }),
  ]);

  // Само истинските новини (адрес по шаблона) — старите страници от менюто не
  // чакат одобрение, те са скрити нарочно.
  const pending = drafts.filter((d) => isNewsLink(d.sourceUrl, pattern));
  const oldestPendingAt = pending.length
    ? new Date(Math.min(...pending.map((d) => d.createdAt.getTime())))
    : null;

  return {
    now,
    news: {
      imported,
      published,
      lastImportedAt: lastImported?.createdAt ?? null,
      lastPublishedAt: lastPublished?.publishedAt ?? null,
      pending: pending.length,
      oldestPendingAt,
    },
    pharmacy: { today: pharmacyToday, lastDate: lastDuty?.date ?? null },
    scams: { total: scams._count._all, lastChangeAt: scams._max.updatedAt ?? null },
    outages: { total: outages._count._all, lastChangeAt: outages._max.updatedAt ?? null },
    services: {
      total: servicesTotal,
      neverVerified: unverified.filter((s) => !s.verifiedAt).length,
      stale: unverified.filter((s) => s.verifiedAt).length,
      examples: unverified.slice(0, 10).map((s) => s.name),
    },
  };
}

export async function checkFreshness(now: Date = new Date()): Promise<{
  result: FreshnessResult;
  input: FreshnessInput;
}> {
  const input = await collectFreshness(now);
  return { result: evaluateFreshness(input), input };
}
