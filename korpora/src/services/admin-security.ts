import { z } from 'zod';
import { audited } from '../audit.js';
import { sha256Hex } from '../crypto.js';
import { destroyAllSessions } from '../auth/sessions.js';
import { issueEmailToken } from '../auth/tokens.js';
import { LABEL } from '../labels.js';
import { extendedAfterMistake } from '../plans/ban.js';
import { accountLocale } from '../i18n.js';
import { greetingName, mailBanned, mailResetPassword, mailTwoFactor } from '../mail/templates.js';
import { fail, isResult, targetFor, type ActionResult, type StaffActor } from './admin-common.js';
import { ADMIN_LIMITS } from './admin-limits.js';
import { hasUnsafeChars, hasUnsafeTextChars } from './names.js';
import { keepOrdersAsContracts, notifyStaffOfDeletedOrders } from './order-retention.js';

/* -------------------------------------- бан -------------------------------------- */

const banSchema = z.object({
  reason: z
    .string()
    .trim()
    .min(ADMIN_LIMITS.banReason.min)
    .max(ADMIN_LIMITS.banReason.max)
    .refine((value) => !hasUnsafeTextChars(value)),
});

/**
 * Бан с причина: всички сесии падат веднага, причината се показва на човека при опит за вход и тръгва
 * по имейл с правилото и пътя за възражение. Писмо — само до потвърден адрес: непотвърденият може да е
 * чужд и не бива да научава причината.
 */
export async function banAccount(
  actor: StaffActor,
  id: string,
  raw: unknown,
): Promise<ActionResult> {
  const target = await targetFor(actor, id, 'accounts:ban');
  if (isResult(target)) return target;
  const parsed = banSchema.safeParse(raw);
  if (!parsed.success) {
    // дължината има свой текст; управляващ знак в причината — общият „грешно поле“
    const unsafe = parsed.error.issues.some((issue) => issue.code === 'custom');
    return unsafe
      ? fail('admin.errors.input')
      : fail('admin.errors.banReason', ADMIN_LIMITS.banReason);
  }
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
          // същият момент като bannedAt: времето на блокирането се смята и от двете (plans/ban.ts)
          createdAt: now,
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
  if (target.emailVerifiedAt) {
    void mailBanned(target.email, accountLocale(target), greetingName(target), parsed.data.reason);
  }
  return { ok: true };
}

const unbanSchema = z.object({
  note: z
    .string()
    .trim()
    .max(ADMIN_LIMITS.noteMax)
    .refine((value) => !hasUnsafeChars(value))
    .default(''),
  /** „Блокирането беше грешка“: планът се удължава с времето на блокирането (plans/ban.ts). */
  mistake: z.boolean().default(false),
});

/**
 * Вдигане на бана. С отметката „Блокирането беше грешка“ тестовият или платеният период се удължава точно с
 * времето на блокирането — така обещават общите условия („Блокиране“); за Lifetime отметката в историята на
 * блокиранията е основата за удължаването на първите му месеци. Удължаването влиза и в историята на плана.
 */
export async function unbanAccount(
  actor: StaffActor,
  id: string,
  raw: unknown,
): Promise<ActionResult> {
  const target = await targetFor(actor, id, 'accounts:ban');
  if (isResult(target)) return target;
  if (!target.bannedAt) return fail('admin.errors.notBanned');
  const parsed = unbanSchema.safeParse(raw);
  if (!parsed.success) return fail('admin.errors.input');
  const { note, mistake } = parsed.data;
  const now = new Date();
  const lifted = await audited(
    actor,
    async (tx) => {
      // Банът се чете наново под ключа, не от прочетеното преди транзакцията: две паралелни вдигания
      // (двоен клик, стар раздел) не удължават плана два пъти и не пишат два реда в одита.
      await tx.$executeRaw`SELECT 1 FROM "User" WHERE "id" = ${id} FOR UPDATE`;
      const user = await tx.user.findUniqueOrThrow({ where: { id } });
      if (!user.bannedAt) return null;
      const until = mistake ? extendedAfterMistake(user, user.bannedAt, now) : null;
      await tx.user.update({
        where: { id },
        data: { bannedAt: null, banReason: null, ...(until ? { planExpiresAt: until } : {}) },
      });
      await tx.accountBan.updateMany({
        where: { userId: id, liftedAt: null },
        data: {
          liftedAt: now,
          liftedById: actor.id,
          liftedByLabel: actor.label,
          liftNote: note || null,
          mistake,
        },
      });
      if (until) {
        await tx.planChange.create({
          data: {
            userId: id,
            actorId: actor.id,
            actorLabel: actor.label,
            fromPlan: user.plan,
            toPlan: user.plan,
            fromExpiresAt: user.planExpiresAt,
            toExpiresAt: until,
            note: LABEL.banMistake,
          },
        });
      }
      return { mistake, from: until ? user.planExpiresAt : null, until };
    },
    (done) =>
      done
        ? {
            action: 'admin.account.unbanned',
            targetType: 'user',
            targetId: id,
            detail:
              done.until && done.from
                ? {
                    mistake: true,
                    from: done.from.toISOString(),
                    until: done.until.toISOString(),
                  }
                : { mistake: done.mistake },
          }
        : null,
  );
  if (!lifted) return fail('admin.errors.notBanned');
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
  void mailTwoFactor(target.email, accountLocale(target), greetingName(target), false);
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
  void mailResetPassword(target.email, accountLocale(target), greetingName(target), token);
  return { ok: true };
}

/* ------------------------------------ изтриване ------------------------------------ */

/**
 * Изтриване завинаги (с проектите). Потвърждава се с изписване на имейла на акаунта. Поръчките остават само
 * с данните на договора — както при изтриване от самия човек (services/order-retention.ts).
 */
export async function deleteAccount(
  actor: StaffActor,
  id: string,
  confirmEmail: string,
): Promise<ActionResult> {
  const target = await targetFor(actor, id, 'accounts:delete');
  if (isResult(target)) return target;
  if (confirmEmail.trim().toLowerCase() !== target.email) return fail('admin.errors.confirmEmail');
  // В одита не остава имейл — само хеш, за да може да се провери при нужда.
  const kept = await audited(
    actor,
    async (tx) => {
      const orders = await keepOrdersAsContracts(tx, target, new Date());
      await tx.user.delete({ where: { id } });
      return orders;
    },
    (orders) => ({
      action: 'admin.account.deleted',
      targetType: 'user',
      targetId: id,
      detail: {
        emailSha256: sha256Hex(target.email),
        ordersKept: orders.count,
        ordersCancelled: orders.cancelled,
      },
    }),
  );
  notifyStaffOfDeletedOrders(target.email, kept);
  return { ok: true };
}
