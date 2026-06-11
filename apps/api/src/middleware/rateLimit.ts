import rateLimit, { type Store } from "express-rate-limit";
import type { RequestHandler } from "express";
import { RedisStore } from "rate-limit-redis";
import { redis } from "../redis.js";
import { env } from "../env.js";

/**
 * Rate limiting backed by Redis so the window is shared across API instances
 * (S8.2 / S14). Each limiter gets its own RedisStore (distinct key prefix).
 *
 * In the test environment we use the default in-memory store so the suite (and
 * CI) needs no Redis. In dev/prod we use Redis but wrap the middleware to
 * fail OPEN: if the store errors (Redis blip), the request is allowed through
 * rather than 500-ing. Throttling is a guardrail, not a hard dependency.
 */
function store(prefix: string): Store | undefined {
  if (env.NODE_ENV === "test") return undefined; // MemoryStore, no Redis
  return new RedisStore({
    prefix,
    // ioredis: route store commands through the shared client.
    sendCommand: (...args: string[]) => redis.call(...(args as [string, ...string[]])) as Promise<never>,
  });
}

/** Swallow store errors (next(err)) so a Redis outage never 500s a request. */
function failOpen(mw: RequestHandler): RequestHandler {
  return (req, res, next) => {
    mw(req, res, () => next());
  };
}

export const globalLimiter: RequestHandler = failOpen(
  rateLimit({
    windowMs: 60_000,
    max: 300,
    standardHeaders: true,
    legacyHeaders: false,
    store: store("rl:global:"),
  }),
);

/**
 * Stricter limiter for auth endpoints (brute-force defence). Relaxed outside
 * production so local/dev/E2E (many logins from a single IP) isn't throttled.
 */
export const authLimiter: RequestHandler = failOpen(
  rateLimit({
    windowMs: 15 * 60_000,
    max: env.isProd ? 20 : 2000,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: { code: "rate_limited", message: "Too many attempts, try again later" } },
    store: store("rl:auth:"),
  }),
);
