import type { Plan, User } from '@prisma/client';
import { z } from 'zod';
import { audited } from '../audit.js';
import { prisma } from '../db.js';
import { can } from '../auth/rbac.js';
import { isRecordId } from '../http/meta.js';
import { accountLocale, translate } from '../i18n.js';
import { longDate } from '../mail/dates.js';
import { greetingName, mailPlanChanged } from '../mail/templates.js';
import { sofiaEndOfDay } from '../plans/bg-calendar.js';
import { addDays, premiumUntil } from '../plans/plan.js';
import { optionPriceCents, TERM_OPTIONS } from '../plans/pricing.js';
import { paidStartAllowedFrom } from '../plans/withdrawal.js';
import { fail, isResult, targetFor, type ActionResult, type StaffActor } from './admin-common.js';
import { ADMIN_LIMITS } from './admin-limits.js';
import { hasUnsafeChars } from './names.js';
import { sendOrderRejected } from './order-mail.js';

/** Бележката на служителя е свободен текст: не може да започва с „@“ — така се пишат знаците на системата. */
const note = z
  .string()
  .max(ADMIN_LIMITS.noteMax)
  .refine((value) => !hasUnsafeChars(value))
  .default('')
  .transform((value) => value.replace(/^@+/, ''));

const requestId = z.string().refine(isRecordId).optional();

const planSchema = z.discriminatedUnion('plan', [
  z.object({
    plan: z.literal('TRIAL'),
    days: z.coerce.number().int().min(ADMIN_LIMITS.trialDays.min).max(ADMIN_LIMITS.trialDays.max),
    note,
    notify: z.boolean(),
    requestId,
  }),
  z.object({
    plan: z.literal('PREMIUM'),
    mode: z.enum(['months', 'date']),
    months: z.coerce
      .number()
      .int()
      .min(ADMIN_LIMITS.months.min)
      .max(ADMIN_LIMITS.months.max)
      .default(1),
    until: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
    note,
    notify: z.boolean(),
    requestId,
  }),
  z.object({
    plan: z.literal('LIFETIME'),
    note,
    notify: z.boolean(),
    requestId,
  }),
]);

type PlanInput = z.infer<typeof planSchema>;

/** Справочна цена от ценоразписа за избраната промяна — само ако съвпада с готов вариант. */
function listPriceFor(plan: Plan, months: number | null): number | null {
  if (plan === 'LIFETIME') return optionPriceCents('lifetime');
  if (plan === 'PREMIUM' && months !== null) {
    const option = TERM_OPTIONS.find((item) => item.months === months);
    return option ? optionPriceCents(option.id) : null;
  }
  return null;
}

interface NextState {
  expiresAt: Date | null;
  months: number | null;
  /** Откъде тръгва платеното: месеците на Premium — след оставащото време, всичко друго — веднага. */
  paidStart: Date;
}

/** Новото състояние от сегашното: дни на теста, месеци след оставащото време или точна дата, Lifetime. */
function nextState(
  input: PlanInput,
  current: Pick<User, 'plan' | 'planExpiresAt'>,
  now: Date,
): NextState | { error: string } {
  if (input.plan === 'TRIAL')
    return { expiresAt: addDays(now, input.days), months: null, paidStart: now };
  if (input.plan === 'LIFETIME') return { expiresAt: null, months: null, paidStart: now };
  if (input.mode === 'months') {
    // Платените месеци започват след оставащото време (тестово или платено), не го изяждат.
    const remaining = current.plan === 'LIFETIME' ? null : current.planExpiresAt;
    return {
      expiresAt: premiumUntil(remaining, input.months, now),
      months: input.months,
      paidStart: remaining && remaining.getTime() > now.getTime() ? remaining : now,
    };
  }
  // Включен е целият избран ден по София — писмото и панелът показват същата дата.
  const expiresAt = input.until ? sofiaEndOfDay(input.until) : null;
  if (!expiresAt) return { error: 'admin.errors.input' };
  if (expiresAt.getTime() <= now.getTime()) return { error: 'admin.errors.pastDate' };
  return { expiresAt, months: null, paidStart: now };
}

/** Поръчка се изпълнява само с поръчаното: Lifetime с Lifetime, N месеца — с N месеца Premium. */
function matchesOrder(input: PlanInput, option: string, months: number | null): boolean {
  if (option === 'lifetime') return input.plan === 'LIFETIME';
  return input.plan === 'PREMIUM' && input.mode === 'months' && input.months === months;
}

/**
 * Ръчна смяна на плана: trial (дни от днес), premium (месеци към по-късния от „сега“ и текущия край,
 * или точна дата), lifetime. Записва се в историята; човекът получава писмо, ако е избрано. С
 * `requestId` изпълнява поръчка: само поръчания план и не преди срока за отказ, ако няма ранно начало;
 * тогава писмото тръгва винаги. Платен план без поръчка — само ако човекът няма отворена поръчка.
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

  const outcome = await audited(
    actor,
    async (tx) => {
      // Редът на заключване е като при отказа — поръчката, после човекът: двете не се разминават и не се
      // блокират взаимно. Сегашният план се чете наново под ключа, не от прочетеното преди транзакцията.
      if (input.requestId) {
        const open = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT "id" FROM "UpgradeRequest"
        WHERE "id" = ${input.requestId} AND "userId" = ${id} AND "status" = 'OPEN'
        FOR UPDATE`;
        if (open.length !== 1) return { error: 'admin.errors.requestGone' };
      }
      await tx.$executeRaw`SELECT 1 FROM "User" WHERE "id" = ${id} FOR UPDATE`;
      // Платен план на ръка, докато поръчка чака, би заобиколил поръчаното и срока за отказ, а
      // поръчката би останала отворена и после би се изпълнила втори път: платеното минава през нея.
      if (!input.requestId && input.plan !== 'TRIAL') {
        const waiting = await tx.upgradeRequest.count({ where: { userId: id, status: 'OPEN' } });
        if (waiting > 0) return { error: 'admin.errors.openOrder' };
      }
      const user = await tx.user.findUniqueOrThrow({ where: { id } });
      const next = nextState(input, user, now);
      if ('error' in next) return next;
      if (input.requestId) {
        const order = await tx.upgradeRequest.findUniqueOrThrow({ where: { id: input.requestId } });
        if (!matchesOrder(input, order.option, order.months))
          return { error: 'admin.errors.orderMismatch' };
        if (next.paidStart.getTime() < paidStartAllowedFrom(order).getTime())
          return { error: 'admin.errors.withdrawalPeriod' };
        await tx.upgradeRequest.update({
          where: { id: order.id },
          data: {
            status: 'DONE',
            handledById: actor.id,
            handledByLabel: actor.label,
            handledAt: now,
          },
        });
      }
      await tx.user.update({
        where: { id },
        data: {
          plan: input.plan,
          planExpiresAt: next.expiresAt,
          ...(user.emailVerifiedAt ? {} : { emailVerifiedAt: now }),
        },
      });
      await tx.planChange.create({
        data: {
          userId: id,
          actorId: actor.id,
          actorLabel: actor.label,
          fromPlan: user.plan,
          toPlan: input.plan,
          fromExpiresAt: user.planExpiresAt,
          toExpiresAt: next.expiresAt,
          months: next.months,
          listPriceCents: listPriceFor(input.plan, next.months),
          note: input.note || null,
          requestId: input.requestId ?? null,
        },
      });
      return { from: user.plan, expiresAt: next.expiresAt, months: next.months };
    },
    (done) =>
      'error' in done
        ? null
        : {
            action: 'admin.plan.changed',
            targetType: 'user',
            targetId: id,
            detail: {
              from: done.from,
              to: input.plan,
              until: done.expiresAt?.toISOString() ?? null,
              months: done.months,
              request: input.requestId ?? null,
            },
          },
  );
  if ('error' in outcome) return fail(outcome.error);
  // Изпълнена поръчка се съобщава винаги — така обещават общите условия; отметката е за ръчните промени.
  if (input.notify || input.requestId) {
    const locale = accountLocale(target);
    void mailPlanChanged(target.email, locale, greetingName(target), {
      plan: translate(locale, `plan.name.${input.plan}`),
      until: outcome.expiresAt
        ? longDate(outcome.expiresAt, locale)
        : translate(locale, 'mail.noExpiry'),
    });
  }
  return { ok: true };
}

/**
 * Отхвърляне на поръчка. Като всяко действие върху акаунт: способност И по-висок ранг от човека, който
 * е поръчал, и никога своята поръчка. Поръчка се затваря като изпълнена само от `changePlan`. Поръчката
 * е договор, потвърден по имейл: отхвърлянето му тръгва по същия път, за да не се плати по нея.
 */
export async function rejectRequest(actor: StaffActor, requestId: string): Promise<ActionResult> {
  if (!can(actor.role, 'requests:handle')) return fail('error.noCapability');
  const order = requestId
    ? await prisma.upgradeRequest.findUnique({
        where: { id: requestId },
        include: {
          user: { select: { email: true, name: true, locale: true, emailVerifiedAt: true } },
        },
      })
    : null;
  // поръчката на изтрит акаунт е само запис на договора: тя вече е затворена и не се отхвърля
  if (!order?.userId || !order.user) return fail('admin.errors.notFound');
  const customer = order.user;
  const target = await targetFor(actor, order.userId, 'requests:handle');
  if (isResult(target)) return target;
  const result = await audited(
    actor,
    (tx) =>
      tx.upgradeRequest.updateMany({
        where: { id: requestId, status: 'OPEN' },
        data: {
          status: 'REJECTED',
          handledById: actor.id,
          handledByLabel: actor.label,
          handledAt: new Date(),
        },
      }),
    (closed) =>
      closed.count === 1
        ? { action: 'admin.request.rejected', targetType: 'request', targetId: requestId }
        : null,
  );
  if (result.count !== 1) return fail('admin.errors.notFound');
  if (order.termsVersion !== null) void sendOrderRejected(order, customer);
  return { ok: true };
}
