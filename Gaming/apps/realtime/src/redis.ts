import { Redis } from "ioredis";
import { env } from "./env.js";

/** General client for matchmaking ZSETs + presence. */
export const redis = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });

/** Pub/sub pair for the Socket.IO Redis adapter (multi-instance broadcast). */
export const pubClient = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
export const subClient = pubClient.duplicate();
