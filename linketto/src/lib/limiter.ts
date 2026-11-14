// Чиста логика на лимитера (без next/headers) — тества се отделно.
// В паметта на процеса; виж rate-limit.ts за употребата и ограниченията.

interface Bucket {
  hits: number[];
  /** Прозорецът, с който последно е ползвана кофата — за правилно чистене. */
  windowMs: number;
}

const buckets = new Map<string, Bucket>();
const MAX_KEYS = 10_000;
// Изтеклите кофи (с IP в ключа) се чистят поне веднъж в минута — политиката
// обещава, че IP-то за лимита стои в паметта само докато трае прозорецът.
const PRUNE_EVERY_MS = 60_000;
let lastPrune = 0;

/** Само за тестове. */
export function resetRateLimits(): void {
  buckets.clear();
  lastPrune = 0;
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
  if (buckets.size > MAX_KEYS || now - lastPrune >= PRUNE_EVERY_MS) prune(now);
  return true;
}

/** Над лимита ли е ключът — БЕЗ да брои удар (за „броим само неуспехите“). */
export function isRateLimited(
  key: string,
  max: number,
  windowMs: number,
  now: number = Date.now(),
): boolean {
  const bucket = buckets.get(key);
  if (!bucket) return false;
  return bucket.hits.filter((t) => now - t < windowMs).length >= max;
}

// Чистим според ПРОЗОРЕЦА НА САМАТА КОФА — иначе 10-минутна заявка би
// изтрила 1-часовите кофи на анкетите и би нулирала броячите им точно при
// атака (одит: Качествения т. 4).
function prune(now: number): void {
  lastPrune = now;
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

/**
 * IP на клиента по хедърите (чисто — тества се). Моделът на деплоя (DEPLOY.md):
 * Cloudflare отпред, а сървърът приема САМО заявки от Cloudflare → първо
 * `CF-Connecting-IP` (Cloudflare винаги го презаписва). Без Cloudflare —
 * `X-Real-IP`, който Nginx презаписва; накрая ПОСЛЕДНИЯТ елемент на XFF
 * (добавен от нашия proxy; първият е подправим).
 */
export function pickClientIp(get: (name: string) => string | null | undefined): string {
  const cf = get('cf-connecting-ip')?.trim();
  if (cf) return cf;
  const real = get('x-real-ip')?.trim();
  if (real) return real;
  const parts = (get('x-forwarded-for') ?? '')
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);
  return parts.length > 0 ? parts[parts.length - 1]! : 'unknown';
}
