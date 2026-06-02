import rateLimit, { type Store } from "express-rate-limit";
import { RedisStore } from "rate-limit-redis";
import { redis } from "../redis.js";
import { env } from "../env.js";
import { logger } from "../logger.js";

/**
 * Rate limiting backed by Redis so the window is shared across API instances
 * (S8.2 / S14). Each limiter gets its own RedisStore (distinct key prefix). If
 * Redis is unavailable the library still functions — commands buffer on the
 * shared client's offline queue — and we fall back to the in-memory store only
 * when constructing the store throws.
 */
function store(prefix: string): Store | undefined {
  try {
    return new RedisStore({
      prefix,
      // ioredis: route store commands through the shared client.
      sendCommand: (...args: string[]) => redis.call(...(args as [string, ...string[]])) as Promise<never>,
    });
  } catch (err) {
    logger.warn({ err, prefix }, "redis rate-limit store unavailable; using memory");
    return undefined; // express-rate-limit defaults to MemoryStore
  }
}

export const globalLimiter = rateLimit({
  windowMs: 60_000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  store: store("rl:global:"),
});

/**
 * Stricter limiter for auth endpoints (brute-force defence). Relaxed outside
 * production so local/dev/E2E (many logins from a single IP) isn't throttled.
 */
export const authLimiter = rateLimit({
  windowMs: 15 * 60_000,
  max: env.isProd ? 20 : 2000,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { code: "rate_limited", message: "Too many attempts, try again later" } },
  store: store("rl:auth:"),
});
