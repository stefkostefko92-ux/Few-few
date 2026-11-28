import { randomBytes } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { writeUserAudit } from '../audit.js';
import { canDeleteAccount } from '../auth/manage.js';
import { prisma } from '../db.js';
import type { SessionUser } from '../types.js';
import { loadTarget } from './users.js';

/** Името на изтрития акаунт — навсякъде, където е бил авторът (картите, регистъра). */
export const NOME_CANCELLATO = 'Utente cancellato';

/**
 * Изтриването на акаунт (Allegato A, A.9 на условията 2026-11-29; правният преглед, 28 ноември 2026 — до тогава
 * акаунт само се деактивираше). Може, който може да го деактивира (`canDeleteAccount`), и само деактивиран.
 * Редът остава, обезличен: името става „Utente cancellato“, имейлът — адрес, който не е ничий и не носи нищо от
 * стария; паролата, 2FA, сесиите, резервните кодове, връзките за парола, чакащите кодове за подпис, външните
 * самоличности и приетите покани (с имейла) се трият. Авторът на картите и редовете на регистъра остават —
 * обещани в A.9; имената в подписаните документи са техен текст. Регистрите по чл. 19 (приемания, изчисления)
 * са на доставчика като самостоятелен администратор и не се пипат. Една транзакция; редът е заключен.
 */
export async function cancellaAccount(
  actor: SessionUser,
  targetId: string,
): Promise<'ok' | 'no' | 'assente'> {
  const target = await loadTarget(targetId);
  if (!target) return 'assente';
  return prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<
      Array<{ deactivatedAt: Date | null; cancellatoAt: Date | null }>
    >`
      SELECT "deactivatedAt", "cancellatoAt" FROM "User" WHERE id = ${target.id} FOR UPDATE`;
    const row = rows[0];
    if (!row || row.cancellatoAt) return 'assente';
    // Членствата — пак, под заключения ред: фирма, добавена междувременно, също решава кой може.
    const memberships = await tx.membership.findMany({
      where: { userId: target.id },
      select: { aziendaId: true, role: true },
    });
    if (!canDeleteAccount(actor, { ...target, memberships }, row.deactivatedAt)) return 'no';
    const vecchiaEmail = target.email;
    await tx.user.update({
      where: { id: target.id },
      data: {
        name: NOME_CANCELLATO,
        // Уникален, без лични данни, в домейн, който не приема поща (RFC 2606).
        email: `cancellato-${randomBytes(12).toString('hex')}@account.invalid`,
        // Не е Argon2 хеш — никоя парола не съвпада; акаунтът е и деактивиран.
        passwordHash: '!',
        colori: Prisma.DbNull,
        theme: 'AUTO',
        totpSecretEnc: null,
        totpEnabledAt: null,
        totpLastStep: null,
        lastLoginAt: null,
        failedLogins: 0,
        lockedUntil: null,
        lockouts: 0,
        regoleVersione: null,
        invitedById: null,
        cancellatoAt: new Date(),
      },
    });
    await tx.session.deleteMany({ where: { userId: target.id } });
    await tx.recoveryCode.deleteMany({ where: { userId: target.id } });
    await tx.passwordReset.deleteMany({ where: { userId: target.id } });
    await tx.loginChallenge.deleteMany({ where: { userId: target.id } });
    await tx.firmaCondizioni.deleteMany({ where: { userId: target.id } });
    await tx.identitaEsterna.deleteMany({ where: { userId: target.id } });
    await tx.invite.deleteMany({
      where: {
        OR: [{ acceptedUserId: target.id }, { email: vecchiaEmail, acceptedAt: { not: null } }],
      },
    });
    // Само действието и кой го е направил — без името и имейла на изтрития.
    await writeUserAudit(
      { actorId: actor.id, action: 'USER_DELETE', targetType: 'user', targetId: target.id },
      target.id,
      tx,
    );
    return 'ok';
  });
}
