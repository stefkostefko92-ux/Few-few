import 'server-only';
import { createHash, randomBytes } from 'node:crypto';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/db';

// Passwordless вход на купувача (magic-link) за достъп до заключено
// съдържание (курсове/членства). Аналог на User сесията, но за имейл-само
// идентичност: суровият токен е в cookie, в БД пазим само sha256.

const BUYER_COOKIE = 'linketto_buyer';
const BUYER_SESSION_DAYS = 30;
const MAGIC_TTL_MINUTES = 30;

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Създава еднократен magic-link токен за имейл (валиден 30 мин). */
export async function createBuyerMagicToken(email: string): Promise<string> {
  const token = randomBytes(24).toString('hex');
  await prisma.buyerToken.create({
    data: {
      email,
      token,
      expiresAt: new Date(Date.now() + MAGIC_TTL_MINUTES * 60 * 1000),
    },
  });
  return token;
}

/**
 * Консумира magic-link токен и създава сесия на купувача (cookie). Връща
 * имейла при успех или null (изтекъл/ползван/непознат).
 */
export async function consumeBuyerMagicToken(
  token: string,
): Promise<string | null> {
  const record = await prisma.buyerToken.findUnique({ where: { token } });
  if (!record || record.consumedAt || record.expiresAt < new Date()) {
    return null;
  }
  await prisma.buyerToken.update({
    where: { id: record.id },
    data: { consumedAt: new Date() },
  });
  const sessionToken = randomBytes(32).toString('hex');
  const expiresAt = new Date(
    Date.now() + BUYER_SESSION_DAYS * 24 * 60 * 60 * 1000,
  );
  await prisma.buyerSession.create({
    data: { tokenHash: hashToken(sessionToken), email: record.email, expiresAt },
  });
  const cookieStore = await cookies();
  cookieStore.set(BUYER_COOKIE, sessionToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    expires: expiresAt,
  });
  return record.email;
}

/** Имейлът на текущия влязъл купувач (или null). */
export async function getBuyerEmail(): Promise<string | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(BUYER_COOKIE)?.value;
  if (!token) return null;
  const session = await prisma.buyerSession.findUnique({
    where: { tokenHash: hashToken(token) },
  });
  if (!session || session.expiresAt < new Date()) return null;
  return session.email;
}

export async function logoutBuyer(): Promise<void> {
  const cookieStore = await cookies();
  const token = cookieStore.get(BUYER_COOKIE)?.value;
  if (token) {
    await prisma.buyerSession
      .delete({ where: { tokenHash: hashToken(token) } })
      .catch(() => undefined);
  }
  cookieStore.delete(BUYER_COOKIE);
}

/** Има ли купувачът активно право на достъп до продукта. */
export async function hasActiveEntitlement(
  email: string,
  productId: string,
): Promise<boolean> {
  const ent = await prisma.entitlement.findUnique({
    where: { productId_email: { productId, email } },
    select: { active: true, expiresAt: true },
  });
  if (!ent || !ent.active) return false;
  if (ent.expiresAt && ent.expiresAt < new Date()) return false;
  return true;
}
