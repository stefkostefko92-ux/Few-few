import type { Plan } from '@prisma/client';
import { z } from 'zod';
import { audit } from '../audit.js';
import { prisma } from '../db.js';
import { outranks } from '../auth/rbac.js';
import { destroyAllSessions } from '../auth/sessions.js';
import { revokeEmailTokens } from '../auth/tokens.js';
import { isLocale, LOCALE_TAG, translate } from '../i18n.js';
import { greetingName, mailPlanChanged } from '../mail/templates.js';
import { addDays, premiumUntil, trialEndsAt } from '../plans/plan.js';
import { optionPriceCents, TERM_OPTIONS } from '../plans/pricing.js';
import { emailSchema, nameSchema } from './auth-common.js';
import {
  fail,
  isResult,
  localeOf,
  targetFor,
  type ActionResult,
  type StaffActor,
} from './admin-common.js';

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

/* ------------------------------------- план ------------------------------------- */

export const planSchema = z.discriminatedUnion('plan', [
  z.object({
    plan: z.literal('TRIAL'),
    days: z.coerce.number().int().min(1).max(365),
    note: z.string().max(500).default(''),
    notify: z.boolean(),
    requestId: z.string().max(40).optional(),
  }),
  z.object({
    plan: z.literal('PREMIUM'),
    mode: z.enum(['months', 'date']),
    months: z.coerce.number().int().min(1).max(120).default(1),
    until: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
    note: z.string().max(500).default(''),
    notify: z.boolean(),
    requestId: z.string().max(40).optional(),
  }),
  z.object({
    plan: z.literal('LIFETIME'),
    note: z.string().max(500).default(''),
    notify: z.boolean(),
    requestId: z.string().max(40).optional(),
  }),
]);

/** Справочна цена от ценоразписа за избраната промяна — само ако съвпада с готов вариант. */
function listPriceFor(plan: Plan, months: number | null): number | null {
  if (plan === 'LIFETIME') return optionPriceCents('lifetime');
  if (plan === 'PREMIUM' && months !== null) {
    const option = TERM_OPTIONS.find((item) => item.months === months);
    return option ? optionPriceCents(option.id) : null;
  }
  return null;
}

/**
 * Ръчна смяна на плана: trial (дни от днес), premium (месеци към по-късния от „сега“ и текущия край,
 * или точна дата), lifetime. Записва се в историята; човекът получава писмо, ако е избрано.
 */
export async function changePlan(
  actor: StaffActor,
  id: string,
  raw: unknown,
  now: Date = new Date(),
): Promise<ActionResult> {
  const target = await targetFor(actor, id, 'accounts:plan');
  if (isResult(target)) return target;
  const parsed = planSchema.safeParse(raw);
  if (!parsed.success) return fail('admin.errors.input');
  const input = parsed.data;

  let expiresAt: Date | null = null;
  let months: number | null = null;
  if (input.plan === 'TRIAL') {
    expiresAt = addDays(now, input.days);
  } else if (input.plan === 'PREMIUM') {
    if (input.mode === 'months') {
      months = input.months;
      // Платените месеци започват след оставащото време (тестово или платено), не го изяждат.
      expiresAt = premiumUntil(
        target.plan === 'LIFETIME' ? null : target.planExpiresAt,
        months,
        now,
      );
    } else {
      if (!input.until) return fail('admin.errors.input');
      // Краят на избрания ден по София ≈ 21:59 UTC; пазим 23:59:59 UTC, за да е включен целият ден.
      expiresAt = new Date(`${input.until}T23:59:59.000Z`);
      if (Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() <= now.getTime())
        return fail('admin.errors.pastDate');
    }
  }

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id },
      data: {
        plan: input.plan,
        planExpiresAt: expiresAt,
        ...(target.emailVerifiedAt ? {} : { emailVerifiedAt: now }),
      },
    });
    await tx.planChange.create({
      data: {
        userId: id,
        actorId: actor.id,
        actorLabel: actor.label,
        fromPlan: target.plan,
        toPlan: input.plan,
        fromExpiresAt: target.planExpiresAt,
        toExpiresAt: expiresAt,
        months,
        listPriceCents: listPriceFor(input.plan, months),
        note: input.note || null,
      },
    });
    if (input.requestId) {
      await tx.upgradeRequest.updateMany({
        where: { id: input.requestId, userId: id, status: 'OPEN' },
        data: {
          status: 'DONE',
          handledById: actor.id,
          handledByLabel: actor.label,
          handledAt: now,
        },
      });
    }
  });
  await audit(actor, {
    action: 'admin.plan.changed',
    targetType: 'user',
    targetId: id,
    detail: { from: target.plan, to: input.plan, until: expiresAt?.toISOString() ?? null, months },
  });
  if (input.notify) {
    const locale = localeOf(target);
    const fmt = new Intl.DateTimeFormat(LOCALE_TAG[locale], {
      dateStyle: 'long',
      timeZone: 'Europe/Sofia',
    });
    void mailPlanChanged(target.email, locale, greetingName(target), {
      plan: translate(locale, `plan.name.${input.plan}`),
      until: expiresAt ? fmt.format(expiresAt) : translate(locale, 'mail.noExpiry'),
    });
  }
  return { ok: true };
}
