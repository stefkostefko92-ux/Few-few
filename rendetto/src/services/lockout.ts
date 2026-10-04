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
 * Заключва акаунта, ако грешките са стигнали тавана. Заключва го точно една от паралелните заявки —
 * тя пише и в одита и само за нея резултатът е true.
 */
async function lockAccount(user: User, meta: RequestMeta): Promise<boolean> {
  const lock = await prisma.user.updateMany({
    where: { id: user.id, failedLogins: { gte: MAX_FAILED_LOGINS } },
    data: { failedLogins: 0, lockedUntil: new Date(Date.now() + LOCK_MS) },
  });
  if (lock.count !== 1) return false;
  await audit(customerActor(user, meta), {
    action: 'auth.locked',
    targetType: 'user',
    targetId: user.id,
  });
  return true;
}

/**
 * Грешна парола или грешен код. Броячът расте атомно в базата — паралелни опити не могат да прочетат
 * една и съща стойност и да го заобиколят. На петия неуспех акаунтът се заключва за 15 минути.
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
  return { count: failedLogins, locked: true, lockedNow: await lockAccount(user, meta) };
}

/**
 * Неуспешно повторно удостоверяване, вече отчетено в брояча (опитът се заема преди проверката —
 * reauth.ts). Отворена сесия не дава безкрайни опити: на петия акаунтът се заключва, всички сесии
 * падат и собственикът получава писмо.
 */
export async function lockOnReauthFailure(user: User, meta: RequestMeta): Promise<void> {
  if (!(await lockAccount(user, meta))) return;
  await destroyAllSessions(user.id);
  void mailCodeFailures(user.email, isLocale(user.locale) ? user.locale : 'bg', greetingName(user));
}
