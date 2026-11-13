import { prisma } from '../db.js';
import { DAY, HOUR, MINUTE } from '../time.js';

/**
 * Заключване след грешни пароли (SPEC 46). Опитът се ЗАЕМА атомарно преди бавната проверка на паролата
 * (условен UPDATE): паралелни заявки не получават повече от `MAX_FAILED` проверки. При пет грешни подред
 * профилът се заключва за 15 минути, после за час (таван — ревюто: по-дълго заключване е оръжие срещу
 * собственика); стъпката отшумява след ден без заключване. Доверено устройство (src/auth/device.ts) не
 * спира от заключването. Успешен вход и нова парола по връзка нулират.
 */
export const MAX_FAILED = 5;
export const LOCK_STEPS_MS = [15 * MINUTE, HOUR] as const;
/** След толкова без ново заключване стъпката започва отначало. */
export const LOCKOUT_DECAY_MS = DAY;
/** Несъществуващ id — за непознат имейл се изпълняват същите заявки (времето не издава профила). */
export const NO_USER = '-';

export function lockDuration(lockouts: number): number {
  return LOCK_STEPS_MS[Math.min(lockouts, LOCK_STEPS_MS.length - 1)] ?? HOUR;
}

/** true — опитът е зает и паролата може да се провери; false — профилът е заключен. */
export async function reserveAttempt(userId: string, now: Date = new Date()): Promise<boolean> {
  const updated = await prisma.$executeRaw`
    UPDATE "User" SET "failedLogins" = "failedLogins" + 1
    WHERE "id" = ${userId}
      AND ("lockedUntil" IS NULL OR "lockedUntil" <= ${now})
      AND "failedLogins" < ${MAX_FAILED}`;
  return updated === 1;
}

/** Вярна парола: броячите се нулират. */
export async function attemptSucceeded(userId: string): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: { failedLogins: 0, lockouts: 0, lockedUntil: null },
  });
}

/**
 * Грешна парола (опитът вече е зает). Петият подред заключва: `lockedUntil`, `lockouts + 1`, броячът
 * отначало. Връща края на заключването, ако тази грешка го е предизвикала.
 */
export async function attemptFailed(userId: string, now: Date = new Date()): Promise<Date | null> {
  return prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<
      Array<{ failedLogins: number; lockouts: number; lockedUntil: Date | null }>
    >`SELECT "failedLogins", "lockouts", "lockedUntil" FROM "User" WHERE "id" = ${userId} FOR UPDATE`;
    const row = rows[0];
    if (!row || row.failedLogins < MAX_FAILED) return null;
    const decayed =
      row.lockedUntil !== null && row.lockedUntil.getTime() < now.getTime() - LOCKOUT_DECAY_MS;
    const lockouts = decayed ? 0 : row.lockouts;
    const until = new Date(now.getTime() + lockDuration(lockouts));
    await tx.user.update({
      where: { id: userId },
      data: { failedLogins: 0, lockouts: lockouts + 1, lockedUntil: until },
    });
    return until;
  });
}
