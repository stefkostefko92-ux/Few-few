import { Role } from '@prisma/client';
import { z } from 'zod';
import { audited } from '../audit.js';
import { prisma } from '../db.js';
import { outranks } from '../auth/rbac.js';
import { destroyAllSessions } from '../auth/sessions.js';
import { revokeEmailTokens } from '../auth/tokens.js';
import { accountLocale, isLocale } from '../i18n.js';
import { greetingName, mailEmailChangedByStaff } from '../mail/templates.js';
import { trialStart } from '../plans/plan.js';
import { emailSchema, nameSchema } from './auth-common.js';
import {
  fail,
  isResult,
  isUniqueViolation,
  targetFor,
  type ActionResult,
  type StaffActor,
} from './admin-common.js';

/* ----------------------------------- редакция ----------------------------------- */

/** Ролите, които панелът приема от формата — същите като в схемата на базата. */
export const roleSchema = z.nativeEnum(Role);

export const editSchema = z.object({
  name: nameSchema,
  email: emailSchema,
  locale: z.string().refine(isLocale),
  emailVerified: z.boolean(),
});

export async function editAccount(
  actor: StaffActor,
  id: string,
  raw: unknown,
): Promise<ActionResult> {
  const target = await targetFor(actor, id, 'accounts:edit');
  if (isResult(target)) return target;
  const parsed = editSchema.safeParse(raw);
  if (!parsed.success) return fail('admin.errors.input');
  const input = parsed.data;
  const emailChanged = input.email !== target.email;
  if (emailChanged && (await prisma.user.findUnique({ where: { email: input.email } }))) {
    return fail('admin.errors.emailTaken');
  }
  const now = new Date();
  const verifyNow = input.emailVerified && !target.emailVerifiedAt;
  // Потвърждаване от панела пуска теста по същото правило като връзката от писмото — с ред в историята.
  const trial = verifyNow ? trialStart(target, now, { id: actor.id, label: actor.label }) : null;
  const saved = await audited(
    actor,
    async (tx) => {
      await tx.user.update({
        where: { id },
        data: {
          name: input.name,
          email: input.email,
          locale: input.locale,
          // Веднъж потвърден имейл не става пак непотвърден: поддръжката трие непотвърдени акаунти, а
          // изтриването иска отделна способност и потвърждение.
          emailVerifiedAt: target.emailVerifiedAt ?? (input.emailVerified ? now : null),
          ...(trial ? { planExpiresAt: trial.planExpiresAt } : {}),
        },
      });
      if (trial) await tx.planChange.create({ data: trial.change });
      // Нов имейл: връзките, пратени до стария адрес, вече не вършат работа. В същата транзакция —
      // при повторно „Запази“ имейлът вече е новият и до анулирането не би се стигнало.
      if (emailChanged) await revokeEmailTokens(id, undefined, tx);
      return true;
    },
    {
      action: 'admin.account.edited',
      targetType: 'user',
      targetId: id,
      // какво е направено сега: отметката на вече потвърден акаунт е изключена и не идва с формата
      detail: { emailChanged, verifiedNow: verifyNow },
    },
  ).catch((error: unknown) => {
    if (isUniqueViolation(error)) return false;
    throw error;
  });
  if (!saved) return fail('admin.errors.emailTaken');
  // Старият адрес научава, както при смяната от самия човек — смяна от екипа не минава тихо. Само до
  // потвърден адрес: непотвърденият може да е чужд (грешно изписан) и не бива да научава новия.
  if (emailChanged && target.emailVerifiedAt) {
    void mailEmailChangedByStaff(
      target.email,
      accountLocale(target),
      greetingName(target),
      input.email,
    );
  }
  return { ok: true };
}

export async function changeRole(
  actor: StaffActor,
  id: string,
  role: unknown,
): Promise<ActionResult> {
  const target = await targetFor(actor, id, 'staff:manage');
  if (isResult(target)) return target;
  const parsed = roleSchema.safeParse(role);
  if (!parsed.success) return fail('admin.errors.input');
  if (!outranks(actor.role, parsed.data)) return fail('admin.errors.rank');
  await audited(
    actor,
    async (tx) => {
      await tx.user.update({ where: { id }, data: { role: parsed.data } });
      // Смяната на права иска нов вход: старите сесии носят старата роля в главата на човека.
      await destroyAllSessions(id, undefined, tx);
    },
    {
      action: 'admin.role.changed',
      targetType: 'user',
      targetId: id,
      detail: { from: target.role, to: parsed.data },
    },
  );
  return { ok: true };
}
