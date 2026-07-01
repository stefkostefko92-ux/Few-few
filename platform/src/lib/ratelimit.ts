// Прост лимитер в паметта (за вход). При няколко инстанции ползвайте Redis;
// тук е достатъчно за единичен процес зад reverse proxy.

type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

// Връща true, ако заявката е разрешена (под лимита).
export function rateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || now > b.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (b.count >= limit) return false;
  b.count += 1;
  return true;
}
