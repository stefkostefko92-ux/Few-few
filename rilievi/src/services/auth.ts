import { mailEnabled } from '../config.js';
import { prisma } from '../db.js';
import { writeUserAudit } from '../audit.js';
import { normalizeEmail } from '../auth/email.js';
import { hashPassword, passwordProblem, type PasswordProblem } from '../auth/password.js';
import { activeMemberships, MEMBERSHIP_SELECT } from '../auth/memberships.js';
import { destroyAllSessions } from '../auth/sessions.js';
import { resetMail } from '../mail/templates.js';
import { sendMail } from '../mail/mailer.js';
import { HOUR } from '../time.js';
import { reauthPassword } from './reauth.js';
import { newToken, resetLink, tokenHash } from './tokens.js';

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
    include: { memberships: { select: MEMBERSHIP_SELECT } },
  });
  if (!user || user.deactivatedAt) return;
  if (!user.master && activeMemberships(user.memberships).length === 0) return;
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
          master: true,
          deactivatedAt: true,
          memberships: { select: MEMBERSHIP_SELECT },
        },
      },
    },
  });
  if (!reset || reset.usedAt || reset.expiresAt.getTime() <= Date.now()) return null;
  if (reset.user.deactivatedAt) return null;
  if (!reset.user.master && activeMemberships(reset.user.memberships).length === 0) return null;
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
        lockouts: 0,
      },
    });
    await destroyAllSessions(reset.userId, undefined, tx);
    await writeUserAudit(
      {
        actorId: reset.userId,
        action: 'PASSWORD_RESET',
        targetType: 'user',
        targetId: reset.userId,
      },
      reset.userId,
      tx,
    );
    return true;
  });
  return used ? { ok: true } : { ok: false, error: 'invalid' };
}

export type ChangeOutcome =
  { ok: true } | { ok: false; error: 'wrongCurrent' | 'same' | 'locked' | PasswordProblem };

/**
 * Смяна от самия човек: старата парола е задължителна; другите му сесии падат, текущата остава.
 * Старата парола се брои в заключването като при входа (reauth.ts): откраднатата сесия не я налучква.
 */
export async function changePassword(
  principal: { userId: string; sessionId: string },
  current: string,
  next: string,
): Promise<ChangeOutcome> {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: principal.userId } });
  const denied = await reauthPassword(user, current);
  if (denied) return { ok: false, error: denied === 'locked' ? 'locked' : 'wrongCurrent' };
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
    await writeUserAudit(
      { actorId: user.id, action: 'PASSWORD_CHANGE', targetType: 'user', targetId: user.id },
      user.id,
      tx,
    );
  });
  return { ok: true };
}
