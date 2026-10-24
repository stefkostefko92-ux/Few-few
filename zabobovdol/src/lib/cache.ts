import "server-only";
import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/prisma";
import { CACHE_TAGS, REVALIDATE, dayKey, reviveDates } from "@/lib/cache-core";

// Кеширани заявки за началната страница. Страниците остават force-dynamic
// (CI билдва с фиктивна база) — кешираме САМО данните, не страницата.
// Таговете се чистят от админа в src/lib/admin/actions.ts (revalidateTag).
//
// Броячите не се пипат: Faq.views се увеличава с отделна заявка в
// /kak-da/[slug]; тук само четем реда за подредба и той може да е до
// REVALIDATE.content секунди стар.
//
// unstable_cache връща JSON при попадение и суровия резултат от Prisma при
// пропуск — reviveDates прави датите Date и в двата случая.

function cached<A extends unknown[], R>(
  name: string,
  fn: (...args: A) => Promise<R>,
  tags: string[],
  revalidate: number,
): (...args: A) => Promise<R> {
  const inner = unstable_cache(fn, ["zbd", name], { tags, revalidate });
  return async (...args: A) => reviveDates(await inner(...args));
}

export const getTopFaqs = cached(
  "top-faqs",
  () =>
    prisma.faq.findMany({
      where: { published: true },
      orderBy: [{ order: "asc" }, { views: "desc" }],
      take: 6,
    }),
  [CACHE_TAGS.faq],
  REVALIDATE.content,
);

export const getEmergencyServices = cached(
  "emergency-services",
  () =>
    prisma.service.findMany({
      where: { published: true, isEmergency: true },
      orderBy: { order: "asc" },
      take: 6,
    }),
  [CACHE_TAGS.service],
  REVALIDATE.content,
);

export const getUpcomingEvents = cached(
  "upcoming-events",
  () =>
    prisma.event.findMany({
      where: { published: true, startAt: { gte: new Date() } },
      orderBy: { startAt: "asc" },
      take: 3,
    }),
  [CACHE_TAGS.event],
  REVALIDATE.content,
);

export const getLatestListings = cached(
  "latest-listings",
  () =>
    prisma.listing.findMany({
      where: {
        published: true,
        OR: [{ expiresAt: null }, { expiresAt: { gte: new Date() } }],
      },
      orderBy: { createdAt: "desc" },
      take: 4,
    }),
  [CACHE_TAGS.listing],
  REVALIDATE.content,
);

export const getFeaturedBusinesses = cached(
  "featured-businesses",
  () =>
    prisma.business.findMany({
      where: { published: true, featured: true },
      orderBy: { order: "asc" },
      take: 4,
    }),
  [CACHE_TAGS.business],
  REVALIDATE.content,
);

export const getBanners = cached(
  "banners",
  () =>
    prisma.banner.findMany({
      where: { published: true },
      orderBy: { order: "asc" },
      take: 4,
    }),
  [CACHE_TAGS.banner],
  REVALIDATE.content,
);

// Закачената измама за лентата (ScamBanner).
export const getPinnedScam = cached(
  "pinned-scam",
  () =>
    prisma.scamAlert.findFirst({
      where: { published: true, pinned: true },
      orderBy: [{ order: "asc" }, { createdAt: "desc" }],
      select: { title: true, summary: true },
    }),
  [CACHE_TAGS.scam],
  REVALIDATE.urgent,
);

// Активни (публикувани) предупреждения за измами, най-важните първо.
export const getActiveScams = cached(
  "active-scams",
  () =>
    prisma.scamAlert.findMany({
      where: { published: true },
      orderBy: [{ pinned: "desc" }, { order: "asc" }, { createdAt: "desc" }],
      take: 5,
    }),
  [CACHE_TAGS.scam],
  REVALIDATE.urgent,
);

// Дежурна аптека за ден `day` (YYYY-MM-DD по София). Денят е част от ключа,
// така че след полунощ не се показва вчерашното.
const dutyForDay = cached(
  "duty-day",
  (day: string) =>
    prisma.dutyRoster.findMany({
      where: { published: true, date: new Date(`${day}T00:00:00.000Z`) },
      orderBy: { createdAt: "asc" },
    }),
  [CACHE_TAGS.duty],
  REVALIDATE.urgent,
);

export function getDutyToday() {
  return dutyForDay(dayKey());
}

// Прекъсвания, които засягат днес или утре. Границите са щедри (±3 ч), за да
// не зависят от лятно/зимно часово време; страницата може да ги филтрира.
const outagesWindow = cached(
  "outages-window",
  (today: string, tomorrow: string) =>
    prisma.outage.findMany({
      where: {
        published: true,
        AND: [
          { OR: [{ startAt: null }, { startAt: { lte: new Date(`${tomorrow}T23:59:59.999Z`) } }] },
          {
            OR: [
              { endAt: null },
              { endAt: { gte: new Date(new Date(`${today}T00:00:00.000Z`).getTime() - 3 * 3_600_000) } },
            ],
          },
        ],
      },
      orderBy: [{ startAt: "asc" }, { createdAt: "desc" }],
      take: 10,
    }),
  [CACHE_TAGS.outage],
  REVALIDATE.urgent,
);

export function getOutagesTodayTomorrow() {
  return outagesWindow(dayKey(), dayKey(new Date(), 1));
}

export const getLatestPosts = cached(
  "latest-posts",
  () =>
    prisma.post.findMany({
      where: { published: true },
      orderBy: [{ publishedAt: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }],
      take: 3,
    }),
  [CACHE_TAGS.post],
  REVALIDATE.content,
);
