import { z } from 'zod';
import { audit } from '../audit.js';
import { sha256Hex } from '../crypto.js';
import { prisma } from '../db.js';
import { can } from '../auth/rbac.js';
import { destroyAllSessions } from '../auth/sessions.js';
import { issueEmailToken } from '../auth/tokens.js';
import { mailResetPassword, mailTwoFactor } from '../mail/templates.js';
import {
  fail,
  isResult,
  localeOf,
  targetFor,
  type ActionResult,
  type StaffActor,
} from './admin-common.js';

/* -------------------------------------- бан -------------------------------------- */

export const banSchema = z.object({ reason: z.string().trim().min(3).max(500) });

/** Бан с причина: всички сесии падат веднага, причината се показва на човека при опит за вход. */
export async function banAccount(
  actor: StaffActor,
  id: string,
  raw: unknown,
): Promise<ActionResult> {
  const target = await targetFor(actor, id, 'accounts:ban');
  if (isResult(target)) return target;
  const parsed = banSchema.safeParse(raw);
  if (!parsed.success) return fail('admin.errors.banReason');
  if (target.bannedAt) return fail('admin.errors.alreadyBanned');
  const now = new Date();
  await prisma.$transaction([
    prisma.user.update({ where: { id }, data: { bannedAt: now, banReason: parsed.data.reason } }),
    prisma.accountBan.create({
      data: {
        userId: id,
        reason: parsed.data.reason,
        bannedById: actor.id,
        bannedByLabel: actor.label,
      },
    }),
    prisma.session.deleteMany({ where: { userId: id } }),
  ]);
  await audit(actor, {
    action: 'admin.account.banned',
    targetType: 'user',
    targetId: id,
    detail: { reason: parsed.data.reason },
  });
  return { ok: true };
}

export async function unbanAccount(
  actor: StaffActor,
  id: string,
  raw: unknown,
): Promise<ActionResult> {
  const target = await targetFor(actor, id, 'accounts:ban');
  if (isResult(target)) return target;
  if (!target.bannedAt) return fail('admin.errors.notBanned');
  const note = z.object({ note: z.string().trim().max(500).default('') }).safeParse(raw);
  const now = new Date();
  await prisma.$transaction([
    prisma.user.update({ where: { id }, data: { bannedAt: null, banReason: null } }),
    prisma.accountBan.updateMany({
      where: { userId: id, liftedAt: null },
      data: {
        liftedAt: now,
        liftedById: actor.id,
        liftedByLabel: actor.label,
        liftNote: note.success ? note.data.note || null : null,
      },
    }),
  ]);
  await audit(actor, { action: 'admin.account.unbanned', targetType: 'user', targetId: id });
  return { ok: true };
}

/* ------------------------------------ сигурност ------------------------------------ */

export async function resetTwoFactor(actor: StaffActor, id: string): Promise<ActionResult> {
  const target = await targetFor(actor, id, 'accounts:security');
  if (isResult(target)) return target;
  await prisma.$transaction([
    prisma.user.update({
      where: { id },
      data: { totpSecretEnc: null, totpEnabledAt: null, totpLastStep: null },
    }),
    prisma.recoveryCode.deleteMany({ where: { userId: id } }),
    prisma.session.deleteMany({ where: { userId: id } }),
  ]);
  await audit(actor, { action: 'admin.totp.reset', targetType: 'user', targetId: id });
  void mailTwoFactor(target.email, localeOf(target), target.name, false);
  return { ok: true };
}

export async function revokeSessions(actor: StaffActor, id: string): Promise<ActionResult> {
  const target = await targetFor(actor, id, 'accounts:security');
  if (isResult(target)) return target;
  const count = await destroyAllSessions(id);
  await audit(actor, {
    action: 'admin.sessions.revoked',
    targetType: 'user',
    targetId: id,
    detail: { count },
  });
  return { ok: true };
}

export async function unlockAccount(actor: StaffActor, id: string): Promise<ActionResult> {
  const target = await targetFor(actor, id, 'accounts:security');
  if (isResult(target)) return target;
  await prisma.user.update({ where: { id }, data: { lockedUntil: null, failedLogins: 0 } });
  await audit(actor, { action: 'admin.account.unlocked', targetType: 'user', targetId: id });
  return { ok: true };
}

export async function sendPasswordReset(actor: StaffActor, id: string): Promise<ActionResult> {
  const target = await targetFor(actor, id, 'accounts:security');
  if (isResult(target)) return target;
  const token = await issueEmailToken(id, 'RESET_PASSWORD');
  void mailResetPassword(target.email, localeOf(target), target.name, token);
  await audit(actor, { action: 'admin.reset.sent', targetType: 'user', targetId: id });
  return { ok: true };
}

/* ------------------------------------ изтриване ------------------------------------ */

/** Изтриване завинаги (с проектите). Потвърждава се с изписване на имейла на акаунта. */
export async function deleteAccount(
  actor: StaffActor,
  id: string,
  confirmEmail: string,
): Promise<ActionResult> {
  const target = await targetFor(actor, id, 'accounts:delete');
  if (isResult(target)) return target;
  if (confirmEmail.trim().toLowerCase() !== target.email) return fail('admin.errors.confirmEmail');
  await prisma.user.delete({ where: { id } });
  // В одита не остава имейл — само хеш, за да може да се провери при нужда.
  await audit(actor, {
    action: 'admin.account.deleted',
    targetType: 'user',
    targetId: id,
    detail: { emailSha256: sha256Hex(target.email) },
  });
  return { ok: true };
}

/* ------------------------------- заявки за план ------------------------------- */

export async function closeRequest(
  actor: StaffActor,
  requestId: string,
  status: 'DONE' | 'REJECTED',
): Promise<ActionResult> {
  if (!can(actor.role, 'requests:handle')) return fail('error.noCapability');
  const result = await prisma.upgradeRequest.updateMany({
    where: { id: requestId, status: 'OPEN' },
    data: { status, handledById: actor.id, handledByLabel: actor.label, handledAt: new Date() },
  });
  if (result.count !== 1) return fail('admin.errors.notFound');
  await audit(actor, {
    action: `admin.request.${status.toLowerCase()}`,
    targetType: 'request',
    targetId: requestId,
  });
  return { ok: true };
}
