import { writeUserAudit } from '../audit.js';
import { normalizeEmail } from '../auth/email.js';
import {
  attemptFailed,
  attemptSucceeded,
  ghostFailure,
  ghostLockedUntil,
  LOCK_MINUTES,
  minutesLeft,
  reserveAttempt,
} from '../auth/lockout.js';
import { activeMemberships, MEMBERSHIP_SELECT } from '../auth/memberships.js';
import { dummyHash, hashPassword, needsRehash, verifyPassword } from '../auth/password.js';
import { registraErrore, reteBloccata } from '../auth/rete.js';
import { privilegedAccess } from '../auth/scope.js';
import { prisma } from '../db.js';

/**
 * Вход с имейл и парола. Пазачите, в този ред: таванът на грешките от мрежата (rete.ts) → опитът се
 * заема в брояча на акаунта ПРЕДИ проверката (lockout.ts) → паролата. Непознат имейл и грешна парола
 * дават ЕДИН отговор и се броят еднакво, със същите заключвания — отговорът не казва кой е в портала.
 * Деактивиран акаунт се казва само след вярна парола. С включена 2FA вярната парола не дава сесия, а
 * предизвикателство за кода (login-2fa.ts).
 */

export interface LoggedUser {
  id: string;
  privileged: boolean;
  mustChangePassword: boolean;
}

export type LoginOutcome =
  | { kind: 'ok'; user: LoggedUser }
  | { kind: 'mfa'; userId: string }
  | { kind: 'invalid' }
  | { kind: 'locked'; minutes: number }
  | { kind: 'throttled' }
  | { kind: 'deactivated' };

/** Колко минути остават на заключването на акаунта (поне 1). */
export async function minutiBlocco(userId: string): Promise<number> {
  const row = await prisma.user.findUnique({
    where: { id: userId },
    select: { lockedUntil: true },
  });
  return row?.lockedUntil ? minutesLeft(row.lockedUntil) : LOCK_MINUTES;
}

export async function auditBlocco(userId: string): Promise<void> {
  await writeUserAudit(
    { actorId: null, action: 'LOGIN_LOCKED', targetType: 'user', targetId: userId },
    userId,
  );
}

/** Човекът може ли да влезе: не е деактивиран и (извън MASTER) има поне една активна фирма. */
export async function accessoAttivo(userId: string): Promise<LoggedUser | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { memberships: { select: MEMBERSHIP_SELECT } },
  });
  if (!user || user.deactivatedAt) return null;
  const access = { master: user.master, memberships: activeMemberships(user.memberships) };
  if (!access.master && access.memberships.length === 0) return null;
  return {
    id: user.id,
    privileged: privilegedAccess(access),
    mustChangePassword: user.mustChangePassword,
  };
}

/** Входът е завършен (паролата и, ако има, кодът): броячите падат, последният вход, одит. */
export async function completaAccesso(
  userId: string,
  via: 'password' | 'totp' | 'recupero',
): Promise<void> {
  await attemptSucceeded(userId, true);
  await prisma.user.update({ where: { id: userId }, data: { lastLoginAt: new Date() } });
  await writeUserAudit(
    {
      actorId: userId,
      action: 'LOGIN',
      targetType: 'user',
      targetId: userId,
      ...(via === 'password' ? {} : { meta: { secondoFattore: via } }),
    },
    userId,
  );
}

export async function login(
  emailRaw: string,
  password: string,
  ip: string | null | undefined,
): Promise<LoginOutcome> {
  if (await reteBloccata(ip)) {
    await verifyPassword(password, await dummyHash());
    return { kind: 'throttled' };
  }
  const email = normalizeEmail(emailRaw);
  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, passwordHash: true, totpEnabledAt: true },
  });
  if (!user) {
    await verifyPassword(password, await dummyHash());
    const already = ghostLockedUntil(email);
    if (already) return { kind: 'locked', minutes: minutesLeft(already) };
    ghostFailure(email);
    await registraErrore(ip);
    const now = ghostLockedUntil(email);
    return now ? { kind: 'locked', minutes: minutesLeft(now) } : { kind: 'invalid' };
  }
  const attempt = await reserveAttempt(user.id);
  if (!attempt.reserved) {
    await verifyPassword(password, await dummyHash());
    if (attempt.lockedNow) await auditBlocco(user.id);
    return { kind: 'locked', minutes: await minutiBlocco(user.id) };
  }
  if (!(await verifyPassword(password, user.passwordHash))) {
    await registraErrore(ip);
    const failure = await attemptFailed(user.id);
    if (!failure.locked) return { kind: 'invalid' };
    if (failure.lockedNow) await auditBlocco(user.id);
    return { kind: 'locked', minutes: await minutiBlocco(user.id) };
  }
  const allowed = await accessoAttivo(user.id);
  if (!allowed) {
    await attemptSucceeded(user.id, false);
    return { kind: 'deactivated' };
  }
  if (needsRehash(user.passwordHash)) {
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: await hashPassword(password) },
    });
  }
  if (user.totpEnabledAt) {
    // Заетият опит се връща, но броячът не пада: изчиства го едва верният код.
    await attemptSucceeded(user.id, false);
    return { kind: 'mfa', userId: user.id };
  }
  await completaAccesso(user.id, 'password');
  return { kind: 'ok', user: allowed };
}
