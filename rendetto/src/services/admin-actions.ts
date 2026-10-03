import { z } from 'zod';
import { audit } from '../audit.js';
import { prisma } from '../db.js';
import { outranks } from '../auth/rbac.js';
import { destroyAllSessions } from '../auth/sessions.js';
import { revokeEmailTokens } from '../auth/tokens.js';
import { isLocale } from '../i18n.js';
import { trialEndsAt } from '../plans/plan.js';
import { emailSchema, nameSchema } from './auth-common.js';
import { fail, isResult, targetFor, type ActionResult, type StaffActor } from './admin-common.js';

/* ----------------------------------- редакция ----------------------------------- */

/** Ролите, които панелът приема от формата. */
export const roleSchema = z.enum([
  'CUSTOMER',
  'VIEWER',
  'ANALYST',
  'SUPPORT',
  'MANAGER',
  'ADMIN',
  'OWNER',
]);

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
  if (
    input.email !== target.email &&
    (await prisma.user.findUnique({ where: { email: input.email } }))
  ) {
    return fail('admin.errors.emailTaken');
  }
  const verifyNow = input.emailVerified && !target.emailVerifiedAt;
  const startTrial = verifyNow && target.plan === 'TRIAL' && !target.planExpiresAt;
  await prisma.user.update({
    where: { id },
    data: {
      name: input.name,
      email: input.email,
      locale: input.locale,
      // Веднъж потвърден имейл не става пак непотвърден: поддръжката трие непотвърдени акаунти, а
      // изтриването иска отделна способност и потвърждение.
      emailVerifiedAt: target.emailVerifiedAt ?? (input.emailVerified ? new Date() : null),
      ...(startTrial ? { planExpiresAt: trialEndsAt(new Date()) } : {}),
    },
  });
  // нов имейл: връзките, пратени до стария адрес, вече не вършат работа
  if (input.email !== target.email) await revokeEmailTokens(id);
  await audit(actor, {
    action: 'admin.account.edited',
    targetType: 'user',
    targetId: id,
    detail: { emailChanged: input.email !== target.email, verified: input.emailVerified },
  });
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
  await prisma.user.update({ where: { id }, data: { role: parsed.data } });
  // Смяната на права иска нов вход: старите сесии носят старата роля в главата на човека.
  await destroyAllSessions(id);
  await audit(actor, {
    action: 'admin.role.changed',
    targetType: 'user',
    targetId: id,
    detail: { from: target.role, to: parsed.data },
  });
  return { ok: true };
}
