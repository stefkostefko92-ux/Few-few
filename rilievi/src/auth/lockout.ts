import type { User } from '@prisma/client';
import { prisma } from '../db.js';
import { sha256Hex } from '../crypto.js';
import { HOUR, MINUTE } from '../time.js';

/**
 * Заключването на входа — на едно място (по тези числа се броят опитите и от тях идват числата в
 * текстовете). Броят се грешните пароли И грешните кодове на 2FA, при вход и при потвърждение в отворена
 * сесия. Опитът се ЗАЕМА атомарно преди бавната проверка (Argon2id, TOTP): паралелни заявки не получават
 * повече от MAX_FAILED_LOGINS проверки до заключването, а заключен акаунт не се проверява изобщо. Всяко
 * следващо заключване без успешен вход между тях е по-дълго (LOCK_STEPS_MS): 5 опита на 15 минути, после
 * на час, на 4 часа, на денонощие — налучкването става безнадеждно, а човекът се отключва сам (или с
 * връзка за нова парола).
 */
export const MAX_FAILED_LOGINS = 5;
export const LOCK_STEPS_MS = [15 * MINUTE, HOUR, 4 * HOUR, 24 * HOUR] as const;
/** Първото заключване — числото в текстовете („се заключва за 15 минути“). */
export const LOCK_MINUTES = LOCK_STEPS_MS[0] / MINUTE;

/** Колко трае заключването след `lockouts` предишни заключвания. */
export function lockMsFor(lockouts: number): number {
  return LOCK_STEPS_MS[Math.min(Math.max(lockouts, 0), LOCK_STEPS_MS.length - 1)]!;
}

export function isLocked(user: Pick<User, 'lockedUntil'>, now: number = Date.now()): boolean {
  return user.lockedUntil !== null && user.lockedUntil.getTime() > now;
}

/** Акаунтът не е заключен (или заключването е изтекло). */
const unlocked = (now: Date) => ({ OR: [{ lockedUntil: null }, { lockedUntil: { lte: now } }] });

/** Опитът е зает; иначе — отказ, а `lockedNow` казва, че акаунтът го заключи точно тази заявка. */
export type Reservation = { reserved: true } | { reserved: false; lockedNow: boolean };

export interface FailureResult {
  count: number;
  locked: boolean;
  lockedNow: boolean;
}

/**
 * Заключва акаунт с изчерпани опити — за срока на поредното заключване. Заключва го точно една от
 * паралелните заявки (условието е и по броя на заключванията): само за нея резултатът е true.
 */
async function lockExhausted(userId: string): Promise<boolean> {
  const now = new Date();
  const row = await prisma.user.findUnique({ where: { id: userId }, select: { lockouts: true } });
  if (!row) return false;
  const lock = await prisma.user.updateMany({
    where: {
      id: userId,
      lockouts: row.lockouts,
      failedLogins: { gte: MAX_FAILED_LOGINS },
      ...unlocked(now),
    },
    data: {
      failedLogins: 0,
      lockouts: { increment: 1 },
      lockedUntil: new Date(now.getTime() + lockMsFor(row.lockouts)),
    },
  });
  return lock.count === 1;
}

/**
 * Заема опит ПРЕДИ проверката на паролата или кода. Отказ — акаунтът е заключен или всички опити са
 * заети: тогава нищо не се проверява. Пълен брояч без заключване (заявка, прекъсната по средата)
 * заключва акаунта сега — иначе би го държал затворен завинаги.
 */
export async function reserveAttempt(userId: string): Promise<Reservation> {
  const taken = await prisma.user.updateMany({
    where: { id: userId, failedLogins: { lt: MAX_FAILED_LOGINS }, ...unlocked(new Date()) },
    data: { failedLogins: { increment: 1 } },
  });
  if (taken.count === 1) return { reserved: true };
  return { reserved: false, lockedNow: await lockExhausted(userId) };
}

/** Заетият опит се оказа грешен. Той вече е преброен; на петия акаунтът се заключва. */
export async function attemptFailed(userId: string): Promise<FailureResult> {
  if (await lockExhausted(userId))
    return { count: MAX_FAILED_LOGINS, locked: true, lockedNow: true };
  const row = await prisma.user.findUnique({
    where: { id: userId },
    select: { failedLogins: true, lockedUntil: true },
  });
  if (!row) return { count: MAX_FAILED_LOGINS, locked: true, lockedNow: false };
  return { count: row.failedLogins, locked: isLocked(row), lockedNow: false };
}

/**
 * Заетият опит се оказа верен. `finished` — входът е завършен (и вторият фактор, ако го има): броячът и
 * поредните заключвания падат на нула, но само ако междувременно паралелна заявка не е заключила
 * акаунта (верният опит не отключва чужд). Иначе (чака се кодът, потвърждение в отворена сесия) се
 * връща само този опит: самата парола не изчиства опитите с кодове.
 */
export async function attemptSucceeded(userId: string, finished: boolean): Promise<void> {
  if (finished) {
    await prisma.user.updateMany({
      where: { id: userId, ...unlocked(new Date()) },
      data: { failedLogins: 0, lockouts: 0, lockedUntil: null },
    });
    return;
  }
  await prisma.user.updateMany({
    where: { id: userId, failedLogins: { gt: 0 } },
    data: { failedLogins: { decrement: 1 } },
  });
}

/** Минути до края на заключването (поне 1) — за текста „опитай след …“. */
export function minutesLeft(until: Date | number, now: number = Date.now()): number {
  const end = typeof until === 'number' ? until : until.getTime();
  return Math.max(1, Math.ceil((end - now) / MINUTE));
}

/**
 * Непознатите имейли се броят като истинските — със същите поредни заключвания (в паметта, по хеш):
 * иначе „заключено“ и сроковете му биха се появявали само за съществуващи акаунти и щяха да издават
 * кой е в портала.
 */
interface Ghost {
  count: number;
  until: number;
  lockouts: number;
}
const ghosts = new Map<string, Ghost>();
const MAX_GHOSTS = 10_000;

/** Краят на заключването на непознатия имейл или null. */
export function ghostLockedUntil(email: string, now: number = Date.now()): number | null {
  const ghost = ghosts.get(sha256Hex(email));
  return ghost !== undefined && ghost.until > now ? ghost.until : null;
}

export function ghostFailure(email: string, now: number = Date.now()): void {
  const id = sha256Hex(email);
  const ghost = ghosts.get(id) ?? { count: 0, until: 0, lockouts: 0 };
  ghost.count += 1;
  if (ghost.count >= MAX_FAILED_LOGINS) {
    ghost.count = 0;
    ghost.until = now + lockMsFor(ghost.lockouts);
    ghost.lockouts += 1;
  }
  ghosts.delete(id);
  ghosts.set(id, ghost);
  // Map пази реда на вмъкване — най-старият запис е първият.
  if (ghosts.size > MAX_GHOSTS) ghosts.delete(ghosts.keys().next().value!);
}
