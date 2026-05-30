import { Redis } from "ioredis";
import { env } from "./env.js";
import { logger } from "./logger.js";

/**
 * Shared Redis client. Lazy connect so the API can boot and serve /health even
 * if Redis is briefly unavailable. The offline queue is enabled so commands
 * issued before the connection is ready (e.g. the first daily-claim / quest
 * read) buffer instead of throwing. Used for progression, presence, rate limit.
 */
export const redis = new Redis(env.REDIS_URL, {
  lazyConnect: true,
  maxRetriesPerRequest: 3,
  enableOfflineQueue: true,
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
