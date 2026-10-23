// Чиста логика на кеша (без server-only/Prisma) — тества се с node:test.

// Таг на кеша за всеки Prisma модел, който началната чете.
export const CACHE_TAGS = {
  faq: "c:faq",
  service: "c:service",
  event: "c:event",
  listing: "c:listing",
  business: "c:business",
  banner: "c:banner",
  scam: "c:scam",
  duty: "c:duty",
  outage: "c:outage",
  post: "c:post",
} as const;

export type CacheTag = (typeof CACHE_TAGS)[keyof typeof CACHE_TAGS];

const MODEL_TAGS: Record<string, CacheTag[]> = {
  faq: [CACHE_TAGS.faq],
  service: [CACHE_TAGS.service],
  event: [CACHE_TAGS.event],
  listing: [CACHE_TAGS.listing],
  business: [CACHE_TAGS.business],
  banner: [CACHE_TAGS.banner],
  scamAlert: [CACHE_TAGS.scam],
  dutyRoster: [CACHE_TAGS.duty],
  outage: [CACHE_TAGS.outage],
  post: [CACHE_TAGS.post],
};

// Кои тагове да се изчистят, когато админът пипне записи от даден модел.
export function tagsForModel(model: string): CacheTag[] {
  return MODEL_TAGS[model] ?? [];
}

// Сигурност при изтичане: най-много 5 минути за всичко; прекъсвания и измами
// са по-чувствителни (час/ден се променя бързо) — 60 s.
export const REVALIDATE = {
  content: 300,
  urgent: 60,
} as const;

// unstable_cache сериализира в JSON — датите се връщат като ISO низове.
// Връщаме ги в Date, за да остане формата същият като от Prisma.
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;

export function reviveDates<T>(value: T): T {
  return walk(value) as T;
}

function walk(v: unknown): unknown {
  if (typeof v === "string") return ISO.test(v) ? new Date(v) : v;
  if (Array.isArray(v)) return v.map(walk);
  if (v && typeof v === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v)) out[k] = walk(x);
    return out;
  }
  return v;
}

// Ключ на деня по Европа/София (YYYY-MM-DD) — част от ключа на кеша за
// „днес/утре“, за да не се показва вчерашно след полунощ.
export function dayKey(d: Date = new Date(), plusDays = 0): string {
  const t = new Date(d.getTime() + plusDays * 86_400_000);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Sofia",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(t);
}
