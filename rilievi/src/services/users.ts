import type { Role } from '@prisma/client';
import { prisma } from '../db.js';
import { writeAudit } from '../audit.js';
import { outranks, ROLE_LEVEL } from '../auth/roles.js';
import { destroyAllSessions } from '../auth/sessions.js';
import { accountLocale } from '../i18n.js';
import { resetMail } from '../mail/templates.js';
import { sendMail, type MailResult } from '../mail/mailer.js';
import { HOUR } from '../time.js';
import type { SessionUser } from '../types.js';
import { ADMIN_RESET_HOURS } from './auth.js';
import { newToken, resetLink } from './tokens.js';

const USER_SELECT = {
  id: true,
  name: true,
  email: true,
  role: true,
  deactivatedAt: true,
  lastLoginAt: true,
  createdAt: true,
  invitedBy: { select: { name: true } },
} as const;

/** Всички акаунти: първо по ранг (MASTER горе), после по име. */
export async function listUsers() {
  const users = await prisma.user.findMany({ select: USER_SELECT });
  return users.sort(
    (a, b) => ROLE_LEVEL[a.role] - ROLE_LEVEL[b.role] || a.name.localeCompare(b.name),
  );
}

export function getUser(id: string) {
  if (!/^[a-z0-9]{20,40}$/.test(id)) return Promise.resolve(null);
  return prisma.user.findUnique({ where: { id }, select: USER_SELECT });
}

/**
 * Кой управлява кой акаунт е ЕДНА проверка: само по-висок ранг, никога себе си. Ново действие над
 * чужд акаунт минава оттук.
 */
export function canManage(actor: SessionUser, target: { id: string; role: Role }): boolean {
  return actor.id !== target.id && outranks(actor.role, target.role);
}

export async function changeRole(
  actor: SessionUser,
  targetId: string,
  role: Role,
): Promise<boolean> {
  const target = await prisma.user.findUnique({ where: { id: targetId } });
  if (!target || !canManage(actor, target) || !outranks(actor.role, role)) return false;
  if (target.role === role) return true;
  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id: target.id }, data: { role } });
    await writeAudit(
      {
        actorId: actor.id,
        action: 'USER_ROLE',
        targetType: 'user',
        targetId: target.id,
        meta: { from: target.role, to: role },
      },
      tx,
    );
  });
  return true;
}

/** Деактивиран акаунт не влиза, а сесиите му падат веднага. Данните (схемите) остават. */
export async function setActive(
  actor: SessionUser,
  targetId: string,
  active: boolean,
): Promise<boolean> {
  const target = await prisma.user.findUnique({ where: { id: targetId } });
  if (!target || !canManage(actor, target)) return false;
  if (active === (target.deactivatedAt === null)) return true;
  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: target.id },
      data: active
        ? { deactivatedAt: null, failedLogins: 0, lockedUntil: null }
        : { deactivatedAt: new Date() },
    });
    if (!active) await destroyAllSessions(target.id, undefined, tx);
    await writeAudit(
      {
        actorId: actor.id,
        action: active ? 'USER_REACTIVATE' : 'USER_DEACTIVATE',
        targetType: 'user',
        targetId: target.id,
      },
      tx,
    );
  });
  return true;
}

/**
 * Връзка за нова парола, дадена от по-висок ранг (работи и без поща — показва се на екрана). Старите
 * неизползвани връзки на човека се обезсилват.
 */
export async function createResetLink(
  actor: SessionUser,
  targetId: string,
): Promise<{ link: string; mail: MailResult } | null> {
  const target = await prisma.user.findUnique({ where: { id: targetId } });
  if (!target || !canManage(actor, target) || target.deactivatedAt) return null;
  const { token, hash } = newToken();
  await prisma.$transaction(async (tx) => {
    await tx.passwordReset.updateMany({
      where: { userId: target.id, usedAt: null },
      data: { usedAt: new Date() },
    });
    await tx.passwordReset.create({
      data: {
        userId: target.id,
        tokenHash: hash,
        createdById: actor.id,
        expiresAt: new Date(Date.now() + ADMIN_RESET_HOURS * HOUR),
      },
    });
    await writeAudit(
      { actorId: actor.id, action: 'PASSWORD_RESET_LINK', targetType: 'user', targetId: target.id },
      tx,
    );
  });
  const link = resetLink(token);
  const mail = await sendMail(
    resetMail(accountLocale(target), { to: target.email, link, hours: ADMIN_RESET_HOURS }),
  );
  return { link, mail };
}
