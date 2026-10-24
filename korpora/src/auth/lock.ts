import type { User } from '@prisma/client';

/**
 * Заключването на входа — на едно място: по тези числа брои опитите `services/lockout.ts`, от тях идват
 * и числата в подсказката на входа и в писмата за заключване. Текстът не ги пише на ръка.
 */

/** Толкова грешни пароли или кодове подред заключват акаунта — за LOCK_MS. */
export const MAX_FAILED_LOGINS = 5;
export const LOCK_MS = 15 * 60 * 1000;
/** Заключването в минути — за текстовете („входът се заключва за 15 минути“). */
export const LOCK_MINUTES = LOCK_MS / (60 * 1000);

/** Заключен ли е акаунтът в момента. */
export function isLocked(user: Pick<User, 'lockedUntil'>, now: number = Date.now()): boolean {
  return user.lockedUntil !== null && user.lockedUntil.getTime() > now;
}
