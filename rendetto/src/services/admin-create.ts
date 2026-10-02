import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { audit } from '../audit.js';
import { prisma } from '../db.js';
import { hashPassword } from '../auth/password.js';
import { can, outranks } from '../auth/rbac.js';
import { issueEmailToken } from '../auth/tokens.js';
import { isLocale } from '../i18n.js';
import { mailResetPassword } from '../mail/templates.js';
import { addDays, premiumUntil } from '../plans/plan.js';
import { emailSchema, nameSchema, newPasswordProblem } from './auth-common.js';
import { roleSchema } from './admin-actions.js';
import { fail, localeOf, type ActionResult, type StaffActor } from './admin-common.js';

/* ------------------------------------ създаване ------------------------------------ */

export const createSchema = z.object({
  email: emailSchema,
  name: nameSchema,
  role: roleSchema,
  plan: z.enum(['TRIAL', 'PREMIUM', 'LIFETIME']),
  trialDays: z.coerce.number().int().min(1).max(365).default(30),
  months: z.coerce.number().int().min(1).max(120).default(1),
  password: z.string().max(256).optional(),
  locale: z.string().refine(isLocale).default('bg'),
});

/**
 * Нов акаунт от персонала. Без парола акаунтът получава писмо с връзка за задаване на парола —
 * тя потвърждава и имейла. С парола акаунтът е готов веднага и имейлът се смята за потвърден.
 */
export async function createAccount(actor: StaffActor, raw: unknown): Promise<ActionResult> {
  if (!can(actor.role, 'accounts:create')) return fail('error.noCapability');
  const parsed = createSchema.safeParse(raw);
  if (!parsed.success) return fail('admin.errors.input');
  const input = parsed.data;
  if (
    input.role !== 'CUSTOMER' &&
    (!can(actor.role, 'staff:manage') || !outranks(actor.role, input.role))
  ) {
    return fail('admin.errors.rank');
  }
  if (await prisma.user.findUnique({ where: { email: input.email } }))
    return fail('admin.errors.emailTaken');
  const password = input.password?.trim() ? input.password : '';
  if (password) {
    const problem = await newPasswordProblem(password, [input.email, input.name]);
    if (problem) return fail(problem);
  }
  const now = new Date();
  const verified = Boolean(password);
  const expiresAt =
    input.plan === 'LIFETIME'
      ? null
      : input.plan === 'PREMIUM'
        ? premiumUntil(null, input.months, now)
        : verified
          ? addDays(now, input.trialDays)
          : null;
  const user = await prisma.user.create({
    data: {
      email: input.email,
      name: input.name,
      role: input.role,
      locale: input.locale,
      // Без парола: случаен хеш, който никой не знае, докато човекът не зададе своя по връзката.
      passwordHash: await hashPassword(password || randomBytes(32).toString('base64url')),
      emailVerifiedAt: verified ? now : null,
      plan: input.plan,
      planExpiresAt: expiresAt,
    },
  });
  await prisma.planChange.create({
    data: {
      userId: user.id,
      actorId: actor.id,
      actorLabel: actor.label,
      toPlan: input.plan,
      toExpiresAt: expiresAt,
      months: input.plan === 'PREMIUM' ? input.months : null,
      note: 'създаден от персонала',
    },
  });
  if (!password) {
    const token = await issueEmailToken(user.id, 'RESET_PASSWORD');
    void mailResetPassword(user.email, localeOf(user), user.name, token);
  }
  await audit(actor, {
    action: 'admin.account.created',
    targetType: 'user',
    targetId: user.id,
    detail: { role: input.role, plan: input.plan, invited: !password },
  });
  return { ok: true, id: user.id };
}
