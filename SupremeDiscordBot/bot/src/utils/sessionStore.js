// bot/src/utils/sessionStore.js
// Redis-backed session store for active form sessions.
// Falls back to in-memory Map if Redis is not configured.
// This allows the bot to survive restarts mid-form (with Redis)
// and to scale across multiple processes without losing sessions.

import Redis from "ioredis";

const REDIS_URL = process.env.REDIS_URL;
const SESSION_TTL = 15 * 60; // 15 minutes in seconds

let redis = null;

if (REDIS_URL) {
  redis = new Redis(REDIS_URL, {
    maxRetriesPerRequest: 3,
    enableReadyCheck: true,
    lazyConnect: false,
  });

  redis.on("connect", () => console.log("✅ Redis connected — form sessions are persistent"));
  redis.on("error", (err) => console.error("Redis error:", err.message));
} else {
  console.warn("⚠️  REDIS_URL not set — form sessions use in-memory Map (lost on bot restart)");
}

// Fallback in-memory store
const memStore = new Map();

export const sessionStore = {
  async get(key) {
    if (redis) {
      const raw = await redis.get(`session:${key}`);
      return raw ? JSON.parse(raw) : null;
    }
    return memStore.get(key) ?? null;
  },

  async set(key, value) {
    if (redis) {
      await redis.set(`session:${key}`, JSON.stringify(value), "EX", SESSION_TTL);
    } else {
      memStore.set(key, value);
    }
  },

  async delete(key) {
    if (redis) {
      await redis.del(`session:${key}`);
    } else {
      memStore.delete(key);
    }
  },

  async has(key) {
    if (redis) {
      return (await redis.exists(`session:${key}`)) === 1;
    }
    return memStore.has(key);
  },
};
