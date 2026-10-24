import { ACCESS_TOKEN_TTL_SEC } from "@aso/shared";
import { redis } from "../redis.js";
import { logger } from "../logger.js";

/**
 * Access-token revocation denylist (§14). Access tokens are stateless JWTs, so
 * a ban/erasure/role change would otherwise stay valid until the token expires
 * (~15 min). We store the revocation MOMENT (unix sec) in Redis with a TTL equal
 * to the access-token lifetime — after that every older token is expired anyway
 * and the key self-cleans.
 *
 * Отмяната е по време, не по потребител: отхвърлят се само токени, издадени
 * ДО отмяната (`iat <= revokedAt`). Така след смяна на роля/изтекъл бан новият
 * токен (от refresh/вход) минава веднага, вместо потребителят да е заключен
 * 15 мин. Стара стойност „1“ (преди тази промяна) = „всички токени“.
 *
 * Fails open: if Redis is unreachable we don't lock legitimate users out (the
 * worst case degrades to the pre-existing ~15-min window).
 */

const key = (userId: string) => `revoked:${userId}`;

export async function revokeUser(userId: string, ttlSec = ACCESS_TOKEN_TTL_SEC): Promise<void> {
  try {
    await redis.set(key(userId), String(Math.floor(Date.now() / 1000)), "EX", ttlSec);
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

/** Чисто решение: отменен ли е токен с дадено `iat` при съхранена стойност. */
export function revokedAt(stored: string | null, issuedAt: number | undefined): boolean {
  if (stored === null) return false;
  const at = Number(stored);
  // Легаси „1“ / нечислово → отменя всичко; токен без iat → отменен (fail closed).
  if (!Number.isFinite(at) || at < 1_000_000_000) return true;
  if (typeof issuedAt !== "number") return true;
  return issuedAt <= at;
}

/**
 * Returns true iff a token issued at `issuedAt` (JWT `iat`, sec) is revoked.
 * Without `issuedAt` any active revocation counts. Propagates store errors so
 * each caller can choose its failure mode: `requireAuth` (the sole
 * currency-of-authorization check, with no DB backstop) fails CLOSED in
 * production; the realtime handshake has a DB `banned` backstop and may fail
 * open on a transient Redis hiccup.
 */
export async function isRevoked(userId: string, issuedAt?: number): Promise<boolean> {
  return revokedAt(await redis.get(key(userId)), issuedAt);
}
