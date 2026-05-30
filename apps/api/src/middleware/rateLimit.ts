import rateLimit from "express-rate-limit";

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

/** Stricter limiter for auth endpoints (brute-force defence). */
export const authLimiter = rateLimit({
  windowMs: 15 * 60_000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { code: "rate_limited", message: "Too many attempts, try again later" } },
});
