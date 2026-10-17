import type { User } from '@prisma/client';
import { prisma } from '../db.js';
import { sha256Hex } from '../crypto.js';
import { MINUTE } from '../time.js';

/**
 * Заключването на входа — на едно място: по тези числа се броят опитите и от тях идват числата в
 * текстовете („входът се заключва за 15 минути“). Текстът не ги пише на ръка.
 */
export const MAX_FAILED_LOGINS = 5;
export const LOCK_MS = 15 * MINUTE;
export const LOCK_MINUTES = LOCK_MS / MINUTE;

export function isLocked(user: Pick<User, 'lockedUntil'>, now: number = Date.now()): boolean {
  return user.lockedUntil !== null && user.lockedUntil.getTime() > now;
}

/** Грешна парола за съществуващ акаунт; true — акаунтът току-що се заключи. */
export async function recordFailure(userId: string): Promise<boolean> {
  const updated = await prisma.user.update({
    where: { id: userId },
    data: { failedLogins: { increment: 1 } },
    select: { failedLogins: true },
  });
  if (updated.failedLogins < MAX_FAILED_LOGINS) return false;
  await prisma.user.update({
    where: { id: userId },
    data: { failedLogins: 0, lockedUntil: new Date(Date.now() + LOCK_MS) },
  });
  return true;
}

export async function clearFailures(userId: string): Promise<void> {
  await prisma.user.update({ where: { id: userId }, data: { failedLogins: 0, lockedUntil: null } });
}

/**
 * Непознатите имейли се броят като истинските (в паметта, по хеш): иначе „заключено“ би се появявало
 * само за съществуващи акаунти и щеше да издава кой е в портала.
 */
interface Ghost {
  count: number;
  until: number;
}
const ghosts = new Map<string, Ghost>();
const MAX_GHOSTS = 10_000;

export function ghostLocked(email: string, now: number = Date.now()): boolean {
  const ghost = ghosts.get(sha256Hex(email));
  return ghost !== undefined && ghost.until > now;
}

export function ghostFailure(email: string, now: number = Date.now()): void {
  const id = sha256Hex(email);
  const ghost = ghosts.get(id) ?? { count: 0, until: 0 };
  ghost.count += 1;
  if (ghost.count >= MAX_FAILED_LOGINS) {
    ghost.count = 0;
    ghost.until = now + LOCK_MS;
  }
  ghosts.delete(id);
  ghosts.set(id, ghost);
  // Map пази реда на вмъкване — най-старият запис е първият.
  if (ghosts.size > MAX_GHOSTS) ghosts.delete(ghosts.keys().next().value!);
}
