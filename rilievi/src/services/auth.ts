import type { Role } from '@prisma/client';
import { mailEnabled } from '../config.js';
import { prisma } from '../db.js';
import { writeAudit } from '../audit.js';
import { normalizeEmail } from '../auth/email.js';
import {
  clearFailures,
  ghostFailure,
  ghostLocked,
  isLocked,
  recordFailure,
} from '../auth/lockout.js';
import {
  dummyHash,
  hashPassword,
  needsRehash,
  passwordProblem,
  verifyPassword,
  type PasswordProblem,
} from '../auth/password.js';
import { destroyAllSessions } from '../auth/sessions.js';
import { resetMail } from '../mail/templates.js';
import { sendMail } from '../mail/mailer.js';
import { HOUR } from '../time.js';
import { newToken, resetLink, tokenHash } from './tokens.js';

export type LoginOutcome =
  | { kind: 'ok'; user: { id: string; role: Role; mustChangePassword: boolean } }
  | { kind: 'invalid' }
  | { kind: 'locked' }
  | { kind: 'deactivated' };

/**
 * Вход. Непознат имейл и грешна парола дават ЕДИН отговор и се броят еднакво (lockout.ts) — отговорът
 * не казва кой е в портала. Деактивиран акаунт се казва само след вярна парола.
 */
export async function login(emailRaw: string, password: string): Promise<LoginOutcome> {
  const email = normalizeEmail(emailRaw);
  const user = await prisma.user.findUnique({
    where: { email },
    include: { azienda: { select: { deactivatedAt: true } } },
  });
  if (!user) {
    await verifyPassword(password, await dummyHash());
    if (ghostLocked(email)) return { kind: 'locked' };
    ghostFailure(email);
    return ghostLocked(email) ? { kind: 'locked' } : { kind: 'invalid' };
  }
  if (isLocked(user)) {
    await verifyPassword(password, await dummyHash());
    return { kind: 'locked' };
  }
  if (!(await verifyPassword(password, user.passwordHash))) {
    if (await recordFailure(user.id)) {
      await writeAudit({
        actorId: null,
        action: 'LOGIN_LOCKED',
        aziendaId: user.aziendaId,
        targetType: 'user',
        targetId: user.id,
      });
      return { kind: 'locked' };
    }
    return { kind: 'invalid' };
  }
  // Деактивирана фирма спира всичките си хора, както деактивиран акаунт — себе си.
  if (user.deactivatedAt || user.azienda?.deactivatedAt) return { kind: 'deactivated' };
  await prisma.user.update({
    where: { id: user.id },
    data: {
      failedLogins: 0,
      lockedUntil: null,
      lastLoginAt: new Date(),
      ...(needsRehash(user.passwordHash) ? { passwordHash: await hashPassword(password) } : {}),
    },
  });
  await writeAudit({
    actorId: user.id,
    action: 'LOGIN',
    aziendaId: user.aziendaId,
    targetType: 'user',
    targetId: user.id,
  });
  return {
    kind: 'ok',
    user: { id: user.id, role: user.role, mustChangePassword: user.mustChangePassword },
  };
}

/** Самостоятелната връзка за нова парола живее час; дадената от администратор — 24 часа. */
export const SELF_RESET_HOURS = 1;
export const ADMIN_RESET_HOURS = 24;

/**
 * „Забравена парола“: само ако има поща. Отговорът е еднакъв за всеки имейл; писмо тръгва само до
 * активен акаунт. Предишните неизползвани връзки на човека се обезсилват.
 */
export async function requestReset(emailRaw: string): Promise<void> {
  if (!mailEnabled()) return;
  const user = await prisma.user.findUnique({
    where: { email: normalizeEmail(emailRaw) },
    include: { azienda: { select: { deactivatedAt: true } } },
  });
  if (!user || user.deactivatedAt || user.azienda?.deactivatedAt) return;
  const { token, hash } = newToken();
  await prisma.$transaction([
    prisma.passwordReset.updateMany({
      where: { userId: user.id, usedAt: null },
      data: { usedAt: new Date() },
    }),
    prisma.passwordReset.create({
      data: {
        userId: user.id,
        tokenHash: hash,
        expiresAt: new Date(Date.now() + SELF_RESET_HOURS * HOUR),
      },
    }),
  ]);
  await sendMail(
    resetMail({
      to: user.email,
      link: resetLink(token),
      hours: SELF_RESET_HOURS,
    }),
  );
}

/** Валидната (неизползвана, неизтекла) връзка за нова парола заедно с човека, или null. */
export async function findValidReset(token: unknown) {
  const hash = tokenHash(token);
  if (!hash) return null;
  const reset = await prisma.passwordReset.findUnique({
    where: { tokenHash: hash },
    include: {
      user: {
        select: {
          id: true,
          email: true,
          name: true,
          deactivatedAt: true,
          aziendaId: true,
          azienda: { select: { deactivatedAt: true } },
        },
      },
    },
  });
  if (!reset || reset.usedAt || reset.expiresAt.getTime() <= Date.now()) return null;
  if (reset.user.deactivatedAt || reset.user.azienda?.deactivatedAt) return null;
  return reset;
}

export type ResetOutcome = { ok: true } | { ok: false; error: 'invalid' | PasswordProblem };

/** Нова парола по връзка: връзката се изразходва, всички сесии падат, заключването се маха. */
export async function resetPassword(token: unknown, password: string): Promise<ResetOutcome> {
  const reset = await findValidReset(token);
  if (!reset) return { ok: false, error: 'invalid' };
  const problem = passwordProblem(password, [reset.user.email, reset.user.name]);
  if (problem) return { ok: false, error: problem };
  const passwordHash = await hashPassword(password);
  const used = await prisma.$transaction(async (tx) => {
    const claimed = await tx.passwordReset.updateMany({
      where: { id: reset.id, usedAt: null, expiresAt: { gt: new Date() } },
      data: { usedAt: new Date() },
    });
    if (claimed.count === 0) return false;
    await tx.user.update({
      where: { id: reset.userId },
      data: {
        passwordHash,
        passwordChangedAt: new Date(),
        mustChangePassword: false,
        failedLogins: 0,
        lockedUntil: null,
      },
    });
    await destroyAllSessions(reset.userId, undefined, tx);
    await writeAudit(
      {
        actorId: reset.userId,
        action: 'PASSWORD_RESET',
        aziendaId: reset.user.aziendaId,
        targetType: 'user',
        targetId: reset.userId,
      },
      tx,
    );
    return true;
  });
  return used ? { ok: true } : { ok: false, error: 'invalid' };
}

export type ChangeOutcome =
  { ok: true } | { ok: false; error: 'wrongCurrent' | 'same' | PasswordProblem };

/** Смяна от самия човек: старата парола е задължителна; другите му сесии падат, текущата остава. */
export async function changePassword(
  principal: { userId: string; sessionId: string },
  current: string,
  next: string,
): Promise<ChangeOutcome> {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: principal.userId } });
  if (!(await verifyPassword(current, user.passwordHash)))
    return { ok: false, error: 'wrongCurrent' };
  if (current === next) return { ok: false, error: 'same' };
  const problem = passwordProblem(next, [user.email, user.name]);
  if (problem) return { ok: false, error: problem };
  const passwordHash = await hashPassword(next);
  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: user.id },
      data: { passwordHash, passwordChangedAt: new Date(), mustChangePassword: false },
    });
    await destroyAllSessions(user.id, principal.sessionId, tx);
    await writeAudit(
      {
        actorId: user.id,
        action: 'PASSWORD_CHANGE',
        aziendaId: user.aziendaId,
        targetType: 'user',
        targetId: user.id,
      },
      tx,
    );
  });
  await clearFailures(user.id);
  return { ok: true };
}
