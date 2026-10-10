// Чиста логика на лимитера (без next/headers) — тества се отделно.
// В паметта на процеса; виж rate-limit.ts за употребата и ограниченията.

interface Bucket {
  hits: number[];
  /** Прозорецът, с който последно е ползвана кофата — за правилно чистене. */
  windowMs: number;
}

const buckets = new Map<string, Bucket>();
const MAX_KEYS = 10_000;

/** Само за тестове. */
export function resetRateLimits(): void {
  buckets.clear();
}

/** Само за тестове: брой кофи в паметта. */
export function rateLimitKeyCount(): number {
  return buckets.size;
}

/** true = заявката е позволена (и се брои); false = над лимита. */
export function rateLimit(
  key: string,
  max: number,
  windowMs: number,
  now: number = Date.now(),
): boolean {
  const bucket = buckets.get(key) ?? { hits: [], windowMs };
  bucket.windowMs = windowMs;
  bucket.hits = bucket.hits.filter((t) => now - t < windowMs);
  if (bucket.hits.length >= max) {
    buckets.set(key, bucket);
    return false;
  }
  bucket.hits.push(now);
  buckets.set(key, bucket);
  if (buckets.size > MAX_KEYS) prune(now);
  return true;
}

// Чистим според ПРОЗОРЕЦА НА САМАТА КОФА — иначе 10-минутна заявка би
// изтрила 1-часовите кофи на анкетите и би нулирала броячите им точно при
// атака (одит: Качествения т. 4).
function prune(now: number): void {
  for (const [k, b] of buckets) {
    const last = b.hits[b.hits.length - 1];
    if (last === undefined || now - last >= b.windowMs) buckets.delete(k);
  }
  // Крайна защита: при атака с безкрайно нови ключове изхвърляме най-старите.
  if (buckets.size > MAX_KEYS) {
    for (const k of buckets.keys()) {
      buckets.delete(k);
      if (buckets.size <= MAX_KEYS / 2) break;
    }
  }
}
