import { z } from 'zod';
import { audited } from '../audit.js';
import { sha256Hex } from '../crypto.js';
import { destroyAllSessions } from '../auth/sessions.js';
import { issueEmailToken } from '../auth/tokens.js';
import { greetingName, mailResetPassword, mailTwoFactor } from '../mail/templates.js';
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
  const now = new Date();
  const banned = await audited(
    actor,
    async (tx) => {
      // Условието „още няма бан“ е в самия запис, не в реда, прочетен преди транзакцията: два
      // паралелни бана (двоен клик) не пишат два активни бана и два реда в одита.
      const claimed = await tx.user.updateMany({
        where: { id, bannedAt: null },
        data: { bannedAt: now, banReason: parsed.data.reason },
      });
      if (claimed.count !== 1) return false;
      await tx.accountBan.create({
        data: {
          userId: id,
          reason: parsed.data.reason,
          bannedById: actor.id,
          bannedByLabel: actor.label,
        },
      });
      await tx.session.deleteMany({ where: { userId: id } });
      return true;
    },
    (ok) =>
      ok
        ? {
            action: 'admin.account.banned',
            targetType: 'user',
            targetId: id,
            detail: { reason: parsed.data.reason },
          }
        : null,
  );
  if (!banned) return fail('admin.errors.alreadyBanned');
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
  await audited(
    actor,
    async (tx) => {
      await tx.user.update({ where: { id }, data: { bannedAt: null, banReason: null } });
      await tx.accountBan.updateMany({
        where: { userId: id, liftedAt: null },
        data: {
          liftedAt: now,
          liftedById: actor.id,
          liftedByLabel: actor.label,
          liftNote: note.success ? note.data.note || null : null,
        },
      });
    },
    { action: 'admin.account.unbanned', targetType: 'user', targetId: id },
  );
  return { ok: true };
}

/* ------------------------------------ сигурност ------------------------------------ */

export async function resetTwoFactor(actor: StaffActor, id: string): Promise<ActionResult> {
  const target = await targetFor(actor, id, 'accounts:security');
  if (isResult(target)) return target;
  await audited(
    actor,
    async (tx) => {
      await tx.user.update({
        where: { id },
        data: { totpSecretEnc: null, totpEnabledAt: null, totpLastStep: null },
      });
      await tx.recoveryCode.deleteMany({ where: { userId: id } });
      await tx.session.deleteMany({ where: { userId: id } });
    },
    { action: 'admin.totp.reset', targetType: 'user', targetId: id },
  );
  void mailTwoFactor(target.email, localeOf(target), greetingName(target), false);
  return { ok: true };
}

export async function revokeSessions(actor: StaffActor, id: string): Promise<ActionResult> {
  const target = await targetFor(actor, id, 'accounts:security');
  if (isResult(target)) return target;
  await audited(
    actor,
    (tx) => destroyAllSessions(id, undefined, tx),
    (count) => ({
      action: 'admin.sessions.revoked',
      targetType: 'user',
      targetId: id,
      detail: { count },
    }),
  );
  return { ok: true };
}

export async function unlockAccount(actor: StaffActor, id: string): Promise<ActionResult> {
  const target = await targetFor(actor, id, 'accounts:security');
  if (isResult(target)) return target;
  await audited(
    actor,
    (tx) => tx.user.update({ where: { id }, data: { lockedUntil: null, failedLogins: 0 } }),
    { action: 'admin.account.unlocked', targetType: 'user', targetId: id },
  );
  return { ok: true };
}

export async function sendPasswordReset(actor: StaffActor, id: string): Promise<ActionResult> {
  const target = await targetFor(actor, id, 'accounts:security');
  if (isResult(target)) return target;
  const token = await audited(actor, (tx) => issueEmailToken(id, 'RESET_PASSWORD', undefined, tx), {
    action: 'admin.reset.sent',
    targetType: 'user',
    targetId: id,
  });
  void mailResetPassword(target.email, localeOf(target), greetingName(target), token);
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
  // В одита не остава имейл — само хеш, за да може да се провери при нужда.
  await audited(actor, (tx) => tx.user.delete({ where: { id } }), {
    action: 'admin.account.deleted',
    targetType: 'user',
    targetId: id,
    detail: { emailSha256: sha256Hex(target.email) },
  });
  return { ok: true };
}
