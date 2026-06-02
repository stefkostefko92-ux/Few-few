import rateLimit from "express-rate-limit";
import { env } from "../env.js";

/**
 * Rate limiting. For S0 this uses the in-process memory store so the API boots
 * and is testable without Redis. The Redis-backed sliding window (shared across
 * instances) is wired in S3 alongside the realtime server (S8.2 / S14).
 */
export const globalLimiter = rateLimit({
  windowMs: 60_000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
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
});
