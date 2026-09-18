import type { NextRequest } from "next/server";

// Simple in-memory rate limiting. Sufficient for this single-instance,
// self-hosted deployment; a multi-instance setup would need a shared store.

/**
 * Best-effort client IP.
 *
 * Prefer X-Real-IP: nginx sets it to $remote_addr (the real peer), and the app
 * container is bound to loopback, so nothing outside nginx can forge it.
 * X-Forwarded-For is $proxy_add_x_forwarded_for, whose FIRST element is
 * attacker-supplied — so fall back to the LAST hop, never the first.
 */
export function clientIp(req: NextRequest): string {
  return (
    req.headers.get("x-real-ip")?.trim() ||
    req.headers.get("x-forwarded-for")?.split(",").pop()?.trim() ||
    "unknown"
  );
}

type Bucket = { count: number; first: number };

export type RateLimit = {
  /** True when the key has already reached the limit inside the window. */
  isLimited: (key: string) => boolean;
  /** Count one event against the key. */
  record: (key: string) => void;
  /** Forget the key (e.g. after a successful login). */
  reset: (key: string) => void;
};

export function createRateLimit(opts: {
  windowMs: number;
  max: number;
  /** Sweep expired buckets once the map grows past this, so rotating keys
   *  cannot grow memory without bound. */
  maxKeys?: number;
}): RateLimit {
  const { windowMs, max, maxKeys = 1000 } = opts;
  const hits = new Map<string, Bucket>();

  const fresh = (b: Bucket, now: number) => now - b.first <= windowMs;

  return {
    isLimited(key) {
      const b = hits.get(key);
      if (!b) return false;
      if (!fresh(b, Date.now())) {
        hits.delete(key);
        return false;
      }
      return b.count >= max;
    },
    record(key) {
      const now = Date.now();
      if (hits.size > maxKeys) {
        for (const [k, v] of hits) if (!fresh(v, now)) hits.delete(k);
      }
      const b = hits.get(key);
      if (!b || !fresh(b, now)) hits.set(key, { count: 1, first: now });
      else b.count += 1;
    },
    reset(key) {
      hits.delete(key);
    },
  };
}
