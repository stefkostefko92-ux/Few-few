import { randomBytes, createHash, timingSafeEqual } from "node:crypto";
import { prisma, type AuthTokenType } from "@aso/db";

/**
 * Single-use, hashed tokens for email verification and password reset.
 *
 * The raw token is 32 bytes of CSPRNG entropy, base64url-encoded, and is the
 * only secret in the emailed link. We persist only its SHA-256 so a database
 * leak never yields a usable link (§14). Tokens are consumed on use and
 * expire; verifying always hashes the incoming value before lookup.
 */

const sha256 = (raw: string) => createHash("sha256").update(raw).digest("hex");

export interface IssuedToken {
  raw: string;
  expiresAt: Date;
}

/** Mint a fresh token of `type`, invalidating older unused ones of the same type. */
export async function issueAuthToken(
  userId: string,
  type: AuthTokenType,
  ttlSec: number,
): Promise<IssuedToken> {
  const raw = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + ttlSec * 1000);

  // One live token per (user, type): drop any prior unused ones so an old
  // link can't be reused after a reissue.
  await prisma.$transaction([
    prisma.authToken.deleteMany({ where: { userId, type, usedAt: null } }),
    prisma.authToken.create({ data: { userId, type, tokenHash: sha256(raw), expiresAt } }),
  ]);

  return { raw, expiresAt };
}

/**
 * Verify, consume, and return the owning userId for a raw token — or null when
 * it is unknown, already used, or expired. Consumption is atomic via the
 * `usedAt: null` guard on update.
 */
export async function consumeAuthToken(
  raw: string,
  type: AuthTokenType,
): Promise<string | null> {
  if (!raw) return null;
  const tokenHash = sha256(raw);

  const row = await prisma.authToken.findUnique({ where: { tokenHash } });
  if (!row || row.type !== type || row.usedAt || row.expiresAt.getTime() < Date.now()) {
    return null;
  }

  // Defence-in-depth: constant-time compare the stored hash before consuming.
  const a = Buffer.from(row.tokenHash);
  const b = Buffer.from(tokenHash);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  const consumed = await prisma.authToken.updateMany({
    where: { id: row.id, usedAt: null },
    data: { usedAt: new Date() },
  });
  if (consumed.count !== 1) return null; // lost a race — already consumed

  return row.userId;
}
