// Предплатени планове (docs/revolut-migration-spec.md §7, P1/P6–P8) — чиста
// логика без база и без Revolut; тества се директно. Планът се плаща авансово за
// 1/3/6/12 месеца (BILLING_INTERVALS) или FOUNDER завинаги; без автоматично
// таксуване — преди изтичане идва напомняне (cron).

import {
  intervalFor,
  intervalPriceCents,
  PLANS,
  type BillingIntervalId,
  type PlanId,
} from '@/lib/plans';

const DAY_MS = 24 * 60 * 60 * 1000;
const RANK: Record<PlanId, number> = { FREE: 0, PRO: 1, BUSINESS: 2, FOUNDER: 3 };

export type PaidPlanId = Exclude<PlanId, 'FREE'>;

export function isPaidPlan(value: string): value is PaidPlanId {
  return value === 'PRO' || value === 'BUSINESS' || value === 'FOUNDER';
}

/** P1: сумата (евроцентове, с ДДС) — САМО от plans.ts; FREE → null. */
export function planOrderAmountCents(
  plan: PlanId,
  interval: BillingIntervalId,
): number | null {
  if (plan === 'FREE') return null;
  if (plan === 'FOUNDER') return PLANS.FOUNDER.priceCents;
  return intervalPriceCents(plan, interval);
}

function hasActivePeriod(plan: PlanId, expiresAt: Date | null, now: Date): boolean {
  return (plan === 'PRO' || plan === 'BUSINESS') && !!expiresAt && expiresAt > now;
}

/** P6: може ли потребителят да купи `want` сега. */
export function checkPurchase(input: {
  plan: PlanId;
  expiresAt: Date | null;
  want: PaidPlanId;
  now: Date;
}): 'ok' | 'founder' | 'downgrade-active' {
  if (input.plan === 'FOUNDER') return 'founder';
  if (
    hasActivePeriod(input.plan, input.expiresAt, input.now) &&
    RANK[input.want] < RANK[input.plan]
  ) {
    return 'downgrade-active';
  }
  return 'ok';
}

function addMonthsUtc(date: Date, months: number): Date {
  const d = new Date(date.getTime());
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, lastDay));
  return d;
}

/**
 * P6: новото състояние след платена поръчка. Същият план → от изтичането;
 * ъпгрейд → от сега + остатъкът на стария, преизчислен по месечната цена
 * (закръглен надолу до цял ден); FOUNDER → без изтичане.
 */
export function applyPaidOrder(input: {
  plan: PlanId;
  expiresAt: Date | null;
  want: PaidPlanId;
  interval: BillingIntervalId;
  now: Date;
}): { plan: PaidPlanId; expiresAt: Date | null } {
  if (input.want === 'FOUNDER') return { plan: 'FOUNDER', expiresAt: null };
  const active = hasActivePeriod(input.plan, input.expiresAt, input.now);
  const months = intervalFor(input.interval).months;
  if (active && input.plan === input.want) {
    return { plan: input.want, expiresAt: addMonthsUtc(input.expiresAt as Date, months) };
  }
  let extraDays = 0;
  if (active && RANK[input.want] > RANK[input.plan]) {
    const remainingDays = ((input.expiresAt as Date).getTime() - input.now.getTime()) / DAY_MS;
    extraDays = Math.floor(
      (remainingDays * PLANS[input.plan].priceCents) / PLANS[input.want].priceCents,
    );
  }
  const base = addMonthsUtc(input.now, months);
  return { plan: input.want, expiresAt: new Date(base.getTime() + extraDays * DAY_MS) };
}

/**
 * P7/P8: какво прави дневният cron с един потребител. `reminded` = последният
 * изпратен етап (7 или 1) за ТЕКУЩИЯ период (нулира се при плащане).
 */
export function expiryAction(input: {
  plan: PlanId;
  expiresAt: Date | null;
  reminded: 7 | 1 | null;
  now: Date;
}): { downgrade: boolean; remind?: 7 | 1 } {
  if ((input.plan !== 'PRO' && input.plan !== 'BUSINESS') || !input.expiresAt) {
    return { downgrade: false };
  }
  const left = input.expiresAt.getTime() - input.now.getTime();
  if (left <= 0) return { downgrade: true };
  if (left <= DAY_MS) return input.reminded === 1 ? { downgrade: false } : { downgrade: false, remind: 1 };
  if (left <= 7 * DAY_MS) return input.reminded === null ? { downgrade: false, remind: 7 } : { downgrade: false };
  return { downgrade: false };
}
