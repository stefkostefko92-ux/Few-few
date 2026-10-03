import type { User } from '@prisma/client';
import { audit } from '../audit.js';
import { prisma } from '../db.js';
import { destroyAllSessions } from '../auth/sessions.js';
import type { RequestMeta } from '../http/meta.js';
import { isLocale } from '../i18n.js';
import { greetingName, mailCodeFailures } from '../mail/templates.js';
import { customerActor } from './auth-common.js';

export const MAX_FAILED_LOGINS = 5;
export const LOCK_MS = 15 * 60 * 1000;

/**
 * Грешна парола или грешен код. Броячът расте атомно в базата — паралелни опити не могат да прочетат
 * една и съща стойност и да го заобиколят. На петия неуспех акаунтът се заключва за 15 минути; заключва
 * го точно една от заявките, тя пише и в одита.
 */
export async function countFailure(
  user: User,
  meta: RequestMeta,
): Promise<{ count: number; locked: boolean; lockedNow: boolean }> {
  const { failedLogins } = await prisma.user.update({
    where: { id: user.id },
    data: { failedLogins: { increment: 1 } },
    select: { failedLogins: true },
  });
  if (failedLogins < MAX_FAILED_LOGINS)
    return { count: failedLogins, locked: false, lockedNow: false };
  const lock = await prisma.user.updateMany({
    where: { id: user.id, failedLogins: { gte: MAX_FAILED_LOGINS } },
    data: { failedLogins: 0, lockedUntil: new Date(Date.now() + LOCK_MS) },
  });
  if (lock.count === 1)
    await audit(customerActor(user, meta), {
      action: 'auth.locked',
      targetType: 'user',
      targetId: user.id,
    });
  return { count: failedLogins, locked: true, lockedNow: lock.count === 1 };
}

/**
 * Грешна парола или код при потвърждение на чувствително действие (смяна на парола или имейл, 2FA,
 * изтриване) — броят се към същия брояч като входа. Отворена сесия не дава безкрайни опити: на петия
 * акаунтът се заключва, всички сесии падат и собственикът получава писмо.
 */
export async function reauthFailed(user: User, meta: RequestMeta): Promise<void> {
  const result = await countFailure(user, meta);
  if (!result.lockedNow) return;
  await destroyAllSessions(user.id);
  void mailCodeFailures(user.email, isLocale(user.locale) ? user.locale : 'bg', greetingName(user));
}
