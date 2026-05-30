import { Redis } from "ioredis";
import { env } from "./env.js";
import { logger } from "./logger.js";

/**
 * Shared Redis client. Lazy connect so the API can boot and serve /health even
 * if Redis is briefly unavailable. Used for presence / rate-limit / matchmaking
 * (the Redis-backed sliding-window limiter lands with realtime in S3).
 */
export const redis = new Redis(env.REDIS_URL, {
  lazyConnect: true,
  maxRetriesPerRequest: 2,
  enableOfflineQueue: false,
});

redis.on("error", (err) => {
  logger.warn({ err: err.message }, "redis error");
});

export async function pingRedis(): Promise<boolean> {
  try {
    if (redis.status === "wait" || redis.status === "end") {
      await redis.connect();
    }
    const res = await redis.ping();
    return res === "PONG";
  } catch {
    return false;
  }
}
