import type { User } from '@prisma/client';
import { audit, SYSTEM_ACTOR } from '../audit.js';
import { prisma } from '../db.js';
import { isLocked, LOCK_MS, MAX_FAILED_LOGINS } from '../auth/lock.js';
import type { RequestMeta } from '../http/meta.js';

/**
 * Броячът на грешните пароли и кодове — общ за входа (login.ts) и за повторното удостоверяване в отворена
 * сесия (reauth.ts). Опитът се заема атомно ПРЕДИ бавната проверка (Argon2id, TOTP): паралелни заявки
 * не получават повече от MAX_FAILED_LOGINS проверки на заключване, а заключен акаунт не се проверява.
 */

/** Опитът е зает; иначе — отказ, а `lockedNow` казва, че акаунтът го заключи точно тази заявка. */
export type Reservation = { reserved: true } | { reserved: false; lockedNow: boolean };

export interface FailureResult {
  count: number;
  locked: boolean;
  lockedNow: boolean;
}

/** Акаунтът не е заключен (или заключването е изтекло). */
const unlocked = (now: Date) => ({ OR: [{ lockedUntil: null }, { lockedUntil: { lte: now } }] });

/**
 * Заключва акаунт с изчерпани опити за LOCK_MS. Заключва го точно една от паралелните заявки — тя пише
 * и в одита и само за нея резултатът е true.
 */
async function lockExhausted(user: User, meta: RequestMeta): Promise<boolean> {
  const now = new Date();
  const lock = await prisma.user.updateMany({
    where: { id: user.id, failedLogins: { gte: MAX_FAILED_LOGINS }, ...unlocked(now) },
    data: { failedLogins: 0, lockedUntil: new Date(now.getTime() + LOCK_MS) },
  });
  if (lock.count !== 1) return false;
  // Заключва системата; грешните опити може да са на непознат — не се пишат като действие на човека.
  await audit(
    { ...SYSTEM_ACTOR, ip: meta.ip },
    { action: 'auth.locked', targetType: 'user', targetId: user.id },
  );
  return true;
}

/**
 * Заема опит ПРЕДИ проверката на паролата или кода. Отказ — акаунтът е заключен или всички опити са
 * заети: тогава паролата или кодът не се проверяват. Пълен брояч без заключване (още се проверяват или
 * заявка е прекъснала по средата) заключва акаунта сега, иначе би го държал затворен завинаги.
 */
export async function reserveAttempt(user: User, meta: RequestMeta): Promise<Reservation> {
  const taken = await prisma.user.updateMany({
    where: { id: user.id, failedLogins: { lt: MAX_FAILED_LOGINS }, ...unlocked(new Date()) },
    data: { failedLogins: { increment: 1 } },
  });
  if (taken.count === 1) return { reserved: true };
  return { reserved: false, lockedNow: await lockExhausted(user, meta) };
}

/** Заетият опит се оказа грешен. Той вече е преброен; на петия акаунтът се заключва за LOCK_MS. */
export async function attemptFailed(user: User, meta: RequestMeta): Promise<FailureResult> {
  if (await lockExhausted(user, meta))
    return { count: MAX_FAILED_LOGINS, locked: true, lockedNow: true };
  const row = await prisma.user.findUnique({
    where: { id: user.id },
    select: { failedLogins: true, lockedUntil: true },
  });
  if (!row) return { count: MAX_FAILED_LOGINS, locked: true, lockedNow: false };
  return { count: row.failedLogins, locked: isLocked(row), lockedNow: false };
}

/**
 * Заетият опит се оказа верен. `finished` — входът е завършен: броячът пада на нула, но само ако
 * междувременно паралелна заявка не е заключила акаунта (верният опит не отключва чужд). Иначе (чака се
 * вторият фактор, бан, непотвърден имейл, потвърждение в отворена сесия) се връща само този опит.
 */
export async function attemptSucceeded(userId: string, finished: boolean): Promise<void> {
  if (finished) {
    await prisma.user.updateMany({
      where: { id: userId, ...unlocked(new Date()) },
      data: { failedLogins: 0, lockedUntil: null },
    });
    return;
  }
  await prisma.user.updateMany({
    where: { id: userId, failedLogins: { gt: 0 } },
    data: { failedLogins: { decrement: 1 } },
  });
}
