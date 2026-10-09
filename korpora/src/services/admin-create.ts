import { randomBytes } from 'node:crypto';
import { Plan } from '@prisma/client';
import { z } from 'zod';
import { audited } from '../audit.js';
import { prisma } from '../db.js';
import { LABEL } from '../labels.js';
import { hashPassword } from '../auth/password.js';
import { can, outranks } from '../auth/rbac.js';
import { issueEmailToken } from '../auth/tokens.js';
import { accountLocale, DEFAULT_LOCALE, isLocale } from '../i18n.js';
import { mailInvite } from '../mail/templates.js';
import { addDays, premiumUntil, TRIAL_DAYS } from '../plans/plan.js';
import { emailSchema, nameSchema, newPasswordProblem } from './auth-common.js';
import { roleSchema } from './admin-actions.js';
import { fail, isUniqueViolation, type ActionResult, type StaffActor } from './admin-common.js';
import { ADMIN_LIMITS } from './admin-limits.js';

/* ------------------------------------ създаване ------------------------------------ */

export const createSchema = z.object({
  email: emailSchema,
  name: nameSchema,
  role: roleSchema,
  plan: z.nativeEnum(Plan),
  trialDays: z.coerce
    .number()
    .int()
    .min(ADMIN_LIMITS.trialDays.min)
    .max(ADMIN_LIMITS.trialDays.max)
    .default(TRIAL_DAYS),
  months: z.coerce
    .number()
    .int()
    .min(ADMIN_LIMITS.months.min)
    .max(ADMIN_LIMITS.months.max)
    .default(1),
  password: z.string().max(256).optional(),
  locale: z.string().refine(isLocale).default(DEFAULT_LOCALE),
});

/**
 * Нов акаунт от персонала. Без парола акаунтът получава писмо-покана с връзка за задаване на парола —
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
  } else if (input.plan === 'TRIAL' && input.trialDays !== TRIAL_DAYS) {
    // Без парола тестът тръгва, когато човекът зададе паролата, и е стандартният — друг избран срок
    // би се загубил тихо. За друг срок: с парола или със смяна на плана след това.
    return fail('admin.errors.inviteTrialDays');
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
  // Хешът е бавен (Argon2id) — смята се преди транзакцията, за да не държи връзката към базата.
  // Без парола: случаен хеш, който никой не знае, докато човекът не зададе своя по връзката.
  const passwordHash = await hashPassword(password || randomBytes(32).toString('base64url'));
  // Акаунтът, първият ред в историята на плана, поканата и записът в одита — заедно или нищо: иначе
  // остава акаунт без история или без покана, а повторният опит връща „имейлът е зает“.
  const created = await audited(
    actor,
    async (tx) => {
      const user = await tx.user.create({
        data: {
          email: input.email,
          name: input.name,
          role: input.role,
          locale: input.locale,
          passwordHash,
          emailVerifiedAt: verified ? now : null,
          plan: input.plan,
          planExpiresAt: expiresAt,
        },
      });
      await tx.planChange.create({
        data: {
          userId: user.id,
          actorId: actor.id,
          actorLabel: actor.label,
          toPlan: input.plan,
          toExpiresAt: expiresAt,
          months: input.plan === 'PREMIUM' ? input.months : null,
          note: LABEL.createdByStaff,
        },
      });
      const token = password
        ? null
        : await issueEmailToken(user.id, 'RESET_PASSWORD', undefined, tx);
      return { user, token };
    },
    ({ user }) => ({
      action: 'admin.account.created',
      targetType: 'user',
      targetId: user.id,
      detail: { role: input.role, plan: input.plan, invited: !password },
    }),
  ).catch((error: unknown) => {
    if (isUniqueViolation(error)) return null;
    throw error;
  });
  if (!created) return fail('admin.errors.emailTaken');
  const { user, token } = created;
  if (token) void mailInvite(user.email, accountLocale(user), token);
  return { ok: true, id: user.id };
}
