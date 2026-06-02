import { ACCESS_TOKEN_TTL_SEC } from "@aso/shared";
import { redis } from "../redis.js";
import { logger } from "../logger.js";

/**
 * Access-token revocation denylist (§14). Access tokens are stateless JWTs, so
 * a ban/erasure would otherwise stay valid until the token expires (~15 min).
 * We mark the user revoked in Redis with a TTL equal to the access-token
 * lifetime — after that the token is expired anyway and the key self-cleans.
 * requireAuth consults this on every authenticated request.
 *
 * Fails open: if Redis is unreachable we don't lock legitimate users out (the
 * worst case degrades to the pre-existing ~15-min window).
 */

const key = (userId: string) => `revoked:${userId}`;

export async function revokeUser(userId: string, ttlSec = ACCESS_TOKEN_TTL_SEC): Promise<void> {
  try {
    await redis.set(key(userId), "1", "EX", ttlSec);
  } catch (err) {
    logger.warn({ err, userId }, "revokeUser failed");
  }
}

export async function unrevokeUser(userId: string): Promise<void> {
  try {
    await redis.del(key(userId));
  } catch (err) {
    logger.warn({ err, userId }, "unrevokeUser failed");
  }
}

export async function isRevoked(userId: string): Promise<boolean> {
  try {
    return (await redis.exists(key(userId))) === 1;
  } catch {
    return false; // fail open
  }
}
