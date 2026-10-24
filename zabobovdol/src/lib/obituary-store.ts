import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  OBITUARY_PUBLIC_SELECT,
  PAGE_SIZE,
  contactPurgeCutoff,
  publishedObituaryWhere,
  shouldRunPurge,
  type ObituaryKind,
} from "@/lib/obituary";

// Некролози и помени — достъп до базата. Публичните заявки четат САМО
// публикуваните записи и САМО публичните полета: contactName, contactPhone и
// consent никога не излизат от сървъра към публична страница. Условието и
// полетата са в @/lib/obituary (чисто — тестват се).

const PUBLIC_SELECT = OBITUARY_PUBLIC_SELECT;

export type PublicObituary = Prisma.ObituaryGetPayload<{ select: typeof PUBLIC_SELECT }>;

/** Публикуваните, най-новите първо; по желание само един вид. */
export async function listPublishedObituaries(opts: {
  kind: ObituaryKind | null;
  page: number;
}): Promise<{ items: PublicObituary[]; hasMore: boolean }> {
  const rows = await prisma.obituary.findMany({
    where: publishedObituaryWhere({ kind: opts.kind }),
    orderBy: { createdAt: "desc" },
    skip: (opts.page - 1) * PAGE_SIZE,
    take: PAGE_SIZE + 1,
    select: PUBLIC_SELECT,
  });
  return { items: rows.slice(0, PAGE_SIZE), hasMore: rows.length > PAGE_SIZE };
}

export async function getPublishedObituary(slug: string): Promise<PublicObituary | null> {
  return prisma.obituary.findFirst({ where: publishedObituaryWhere({ slug }), select: PUBLIC_SELECT });
}

/** Заетите slug-ове със същото начало — само тях, не цялата таблица. */
export async function takenObituarySlugs(base: string): Promise<Set<string>> {
  const rows = await prisma.obituary.findMany({
    where: { slug: { startsWith: base } },
    select: { slug: true },
  });
  return new Set(rows.map((r) => r.slug));
}

// „Мързеливо“ чистене на данните на подателя: при посещение на /pomeni, но
// най-много веднъж на PURGE_INTERVAL_MS за процес. Трие името и телефона на
// подателя 30 дни след последната промяна на записа (публикуван или не) —
// дотогава модерацията е приключила, а самата обява остава.
let lastPurgeMs = 0;

export async function purgeExpiredObituaryContacts(now: Date = new Date()): Promise<void> {
  if (!shouldRunPurge(lastPurgeMs, now.getTime())) return;
  lastPurgeMs = now.getTime();
  try {
    await prisma.obituary.updateMany({
      where: {
        updatedAt: { lt: contactPurgeCutoff(now) },
        OR: [{ contactName: { not: "" } }, { contactPhone: { not: "" } }],
      },
      data: { contactName: "", contactPhone: "" },
    });
  } catch (err) {
    // Страницата не бива да пада заради чистенето; следващият опит е след интервала.
    console.error("Чистенето на контактите към некролозите не успя:", err);
  }
}
