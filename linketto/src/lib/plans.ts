// Планове и комисиони — търговското ядро на Linketto.
// Комисионата е НАМАЛЕНА спрямо пазара, но не сме на загуба:
// Free 8% (срещу 12% при Linktree), Pro 4% (срещу 9% при Linktree
// Starter/Pro), а 0% имат само горните два плана — Business и Founder.

export type PlanId = 'FREE' | 'PRO' | 'BUSINESS' | 'FOUNDER';

export interface PlanDef {
  id: PlanId;
  /** Комисиона върху продажби, в проценти. */
  feePercent: number;
  /** Месечна цена в евроцентове (Founder е еднократна). */
  priceCents: number;
  oneTime: boolean;
  /** Максимален брой езикови версии на профил (null = без лимит). */
  maxLocales: number | null;
  /** Дни история на аналитиката (null = без лимит). */
  analyticsDays: number | null;
  /** env променлива със Stripe Price ID. */
  stripePriceEnv: string | null;
}

export const PLANS: Record<PlanId, PlanDef> = {
  FREE: {
    id: 'FREE',
    feePercent: 8,
    priceCents: 0,
    oneTime: false,
    maxLocales: 2,
    analyticsDays: 90,
    stripePriceEnv: null,
  },
  PRO: {
    id: 'PRO',
    feePercent: 4,
    priceCents: 400,
    oneTime: false,
    maxLocales: null,
    analyticsDays: null,
    stripePriceEnv: 'STRIPE_PRICE_PRO',
  },
  BUSINESS: {
    id: 'BUSINESS',
    feePercent: 0,
    priceCents: 900,
    oneTime: false,
    maxLocales: null,
    analyticsDays: null,
    stripePriceEnv: 'STRIPE_PRICE_BUSINESS',
  },
  FOUNDER: {
    id: 'FOUNDER',
    feePercent: 0,
    priceCents: 4900,
    oneTime: true,
    maxLocales: null,
    analyticsDays: null,
    stripePriceEnv: 'STRIPE_PRICE_FOUNDER',
  },
};

export function planFor(plan: string): PlanDef {
  return PLANS[(plan as PlanId) in PLANS ? (plan as PlanId) : 'FREE'];
}

/** Комисиона в евроцентове върху сума в евроцентове, закръглена надолу. */
export function commissionCents(amountCents: number, plan: PlanId): number {
  if (!Number.isInteger(amountCents) || amountCents <= 0) return 0;
  return Math.floor((amountCents * PLANS[plan].feePercent) / 100);
}
