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

// Такса за обработка на плащането — носи я продавачът (индустриален
// стандарт). Покрива таксата на Stripe за европейски карти (~1.5% + €0.25)
// с малък буфер; така „0% комисиона“ на горните планове остава вярно за
// НАШАТА комисиона, без да сме на загуба по Stripe таксите.
export const PROCESSING_FEE = { percent: 1.9, fixedCents: 30 } as const;

/** Минимална цена на продукт — под нея фиксираните такси изяждат всичко. */
export const MIN_PRODUCT_PRICE_EUR = 3;

/** Такса обработка в евроцентове, закръглена нагоре (в наша полза). */
export function processingFeeCents(amountCents: number): number {
  if (!Number.isInteger(amountCents) || amountCents <= 0) return 0;
  return (
    Math.ceil((amountCents * PROCESSING_FEE.percent) / 100) +
    PROCESSING_FEE.fixedCents
  );
}

/** Пълната application_fee за checkout: комисиона по плана + обработка. */
export function totalFeeCents(amountCents: number, plan: PlanId): number {
  if (!Number.isInteger(amountCents) || amountCents <= 0) return 0;
  return commissionCents(amountCents, plan) + processingFeeCents(amountCents);
}
