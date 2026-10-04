import { TokenPurpose, type Prisma } from '@prisma/client';
import { prisma } from '../db.js';
import { randomToken, sha256Hex } from '../crypto.js';

export const HOUR = 60 * 60 * 1000;

export const TOKEN_TTL_MS: Record<TokenPurpose, number> = {
  VERIFY_EMAIL: 48 * HOUR,
  RESET_PASSWORD: 1 * HOUR,
  CHANGE_EMAIL: 24 * HOUR,
};

/** Срокът на връзката в часове — за текстовете („Връзката важи 48 часа“), не се пише на ръка. */
export function linkHours(purpose: TokenPurpose): number {
  return TOKEN_TTL_MS[purpose] / HOUR;
}

/** Таван срещу засипване на чужда поща: толкова писма с връзка на час за една цел на един акаунт. */
export const MAIL_CAP_PER_HOUR = 3;

/**
 * Нова еднократна връзка. Предишните неизползвани за същата цел се анулират. С `tx` — вътре в
 * транзакцията на действието (напр. заедно със записа в одита).
 */
export async function issueEmailToken(
  userId: string,
  purpose: TokenPurpose,
  newEmail?: string,
  tx?: Prisma.TransactionClient,
): Promise<string> {
  if (!tx) return prisma.$transaction((inner) => issueEmailToken(userId, purpose, newEmail, inner));
  const token = randomToken(32);
  await tx.emailToken.updateMany({
    where: { userId, purpose, usedAt: null },
    data: { usedAt: new Date() },
  });
  await tx.emailToken.create({
    data: {
      userId,
      purpose,
      tokenHash: sha256Hex(token),
      newEmail: newEmail ?? null,
      expiresAt: new Date(Date.now() + TOKEN_TTL_MS[purpose]),
    },
  });
  return token;
}

/**
 * Анулира чакащите връзки на акаунта. След смяна на парола или имейл връзка, пратена преди това (може
 * би на стар или чужд адрес), не бива да върши работа. `db` — като при `issueEmailToken`.
 */
export async function revokeEmailTokens(
  userId: string,
  purposes: TokenPurpose[] = Object.values(TokenPurpose),
  db: Prisma.TransactionClient = prisma,
): Promise<void> {
  await db.emailToken.updateMany({
    where: { userId, purpose: { in: purposes }, usedAt: null },
    data: { usedAt: new Date() },
  });
}

/** Колко връзки за целта са пратени скоро — за таван срещу засипване на чужда поща. */
export async function recentTokenCount(
  userId: string,
  purpose: TokenPurpose,
  windowMs: number,
): Promise<number> {
  return prisma.emailToken.count({
    where: { userId, purpose, createdAt: { gte: new Date(Date.now() - windowMs) } },
  });
}

/** Валиден ли е токенът (без да го изразходва) — за показване на формата за нова парола. */
export async function peekEmailToken(token: string, purpose: TokenPurpose) {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  const row = await prisma.emailToken.findUnique({ where: { tokenHash: sha256Hex(token) } });
  if (!row || row.purpose !== purpose || row.usedAt || row.expiresAt.getTime() <= Date.now())
    return null;
  return row;
}

/** Изразходва токена атомарно и връща записа, или null ако е невалиден, изтекъл или вече ползван. */
export async function consumeEmailToken(token: string, purpose: TokenPurpose) {
  const row = await peekEmailToken(token, purpose);
  if (!row) return null;
  const result = await prisma.emailToken.updateMany({
    where: { id: row.id, usedAt: null },
    data: { usedAt: new Date() },
  });
  return result.count === 1 ? row : null;
}
