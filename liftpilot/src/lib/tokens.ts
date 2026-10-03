import 'server-only';
import { randomBytes } from 'node:crypto';
import type { AuthTokenKind, Prisma } from '@prisma/client';
import { prisma } from './db';
import { hashToken } from './token-hash';
import { TOKEN_TTL_MS, tokenShapeOk } from './token-shape';

// The links sent by e-mail. The token (32 random bytes) travels only in the link's fragment, which browsers never
// send to a server; the database keeps its SHA-256. A new link of a kind ends the earlier ones of the user.

export { TOKEN_TTL_MS, tokenShapeOk };

/** A link's token and what the database keeps of it. */
export function newToken(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString('base64url');
  return { token, tokenHash: hashToken(token) };
}

/** A new token for the user, valid for its kind's time; the earlier ones of the same kind stop working. */
export async function issueToken(userId: string, kind: AuthTokenKind): Promise<string> {
  const { token, tokenHash } = newToken();
  await prisma.$transaction([
    prisma.authToken.deleteMany({ where: { userId, kind } }),
    prisma.authToken.create({ data: { userId, kind, tokenHash, expiresAt: new Date(Date.now() + TOKEN_TTL_MS[kind]) } }),
  ]);
  return token;
}

/** The user of a token that is still good (right kind, unused, not expired), without using it. */
export async function tokenUser(token: string, kind: AuthTokenKind): Promise<string | null> {
  if (!tokenShapeOk(token)) return null;
  const row = await prisma.authToken.findUnique({ where: { tokenHash: hashToken(token) } });
  return row && row.kind === kind && !row.usedAt && row.expiresAt > new Date() ? row.userId : null;
}

/** Uses the token once, inside the caller's transaction: the user's id, or null when it was not good. Two requests
 *  with the same token cannot both pass (the update is conditional on it being unused). */
export async function consumeToken(tx: Prisma.TransactionClient, token: string, kind: AuthTokenKind): Promise<string | null> {
  if (!tokenShapeOk(token)) return null;
  const now = new Date();
  const row = await tx.authToken.findUnique({ where: { tokenHash: hashToken(token) } });
  if (!row || row.kind !== kind || row.usedAt || row.expiresAt <= now) return null;
  const used = await tx.authToken.updateMany({ where: { id: row.id, usedAt: null }, data: { usedAt: now } });
  return used.count === 1 ? row.userId : null;
}
