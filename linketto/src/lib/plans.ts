// Плановете — търговското ядро на Linketto. Без комисиона: продажбите на
// създателите вървят през техния собствен линк за плащане (решение О-1,
// docs/revolut-migration-spec.md). Плановете се плащат предплатено през
// Revolut (lib/plan-orders.ts). Сравнения с конкуренти — САМО през
// lib/comparisons.ts (с източник и дата).

import { RETENTION_DAYS } from '@/lib/retention-days';

export type PlanId = 'FREE' | 'PRO' | 'BUSINESS' | 'FOUNDER';

// Срок за съхранение на аналитичните събития = 13 месеца (политиката за
// поверителност). Платените планове показват цялата тази история.
export const CLICK_RETENTION_DAYS = RETENTION_DAYS.clickEvent;

export interface PlanDef {
  id: PlanId;
  /** Месечна цена в евроцентове (Founder е еднократна). */
  priceCents: number;
  oneTime: boolean;
  /** Максимален брой езикови версии на профил (null = без лимит). */
  maxLocales: number | null;
  /** Максимален брой профили на акаунт (екипи/марки — Business). */
  maxProfiles: number;
  /** Дни история на аналитиката (null = без лимит). Платените: 396 дни = 13
   *  месеца — срокът в политиката за поверителност (src/lib/retention.ts). */
  analyticsDays: number | null;
  /** Собствен домейн за профила. */
  customDomain: boolean;
  /** Скриване на Linketto баджа. */
  hideBadge: boolean;
}

export const PLANS: Record<PlanId, PlanDef> = {
  FREE: {
    id: 'FREE',
    priceCents: 0,
    oneTime: false,
    maxLocales: 2,
    maxProfiles: 1,
    analyticsDays: 90,
    customDomain: false,
    hideBadge: false,
  },
  PRO: {
    id: 'PRO',
    priceCents: 400,
    oneTime: false,
    maxLocales: null,
    maxProfiles: 1,
    analyticsDays: CLICK_RETENTION_DAYS,
    customDomain: true,
    hideBadge: true,
  },
  BUSINESS: {
    id: 'BUSINESS',
    priceCents: 900,
    oneTime: false,
    maxLocales: null,
    maxProfiles: 5,
    analyticsDays: CLICK_RETENTION_DAYS,
    customDomain: true,
    hideBadge: true,
  },
  FOUNDER: {
    id: 'FOUNDER',
    priceCents: 4900,
    oneTime: true,
    maxLocales: null,
    maxProfiles: 5,
    analyticsDays: CLICK_RETENTION_DAYS,
    customDomain: true,
    hideBadge: true,
  },
};

export function planFor(plan: string): PlanDef {
  return PLANS[(plan as PlanId) in PLANS ? (plan as PlanId) : 'FREE'];
}

// ── Периоди на плащане с намаления (за абонаментните планове) ─────────
// Колкото по-дълъг предплатен период, толкова по-голяма отстъпка. Плаща се
// веднъж за целия период, без автоматично подновяване. Founder е завинаги.

export type BillingIntervalId =
  | 'monthly'
  | 'quarterly'
  | 'semiannual'
  | 'annual';

export interface BillingInterval {
  id: BillingIntervalId;
  months: number;
  /** Отстъпка спрямо месечната цена × месеците, в проценти. */
  discountPercent: number;
}

export const BILLING_INTERVALS: readonly BillingInterval[] = [
  { id: 'monthly', months: 1, discountPercent: 0 },
  { id: 'quarterly', months: 3, discountPercent: 10 },
  { id: 'semiannual', months: 6, discountPercent: 15 },
  { id: 'annual', months: 12, discountPercent: 20 },
];

export function intervalFor(id: string): BillingInterval {
  return (
    BILLING_INTERVALS.find((interval) => interval.id === id) ??
    BILLING_INTERVALS[0]
  );
}

/** Цена (евроцентове) за план и период, с приложената отстъпка. */
export function intervalPriceCents(
  planId: PlanId,
  intervalId: BillingIntervalId,
): number {
  const plan = PLANS[planId];
  if (!plan || plan.oneTime) return plan?.priceCents ?? 0;
  const interval = intervalFor(intervalId);
  const gross = plan.priceCents * interval.months;
  return Math.round((gross * (100 - interval.discountPercent)) / 100);
}

/** Ефективна месечна цена при даден период (за „€X/мес" етикет). */
export function effectiveMonthlyCents(
  planId: PlanId,
  intervalId: BillingIntervalId,
): number {
  const interval = intervalFor(intervalId);
  return Math.round(intervalPriceCents(planId, intervalId) / interval.months);
}
