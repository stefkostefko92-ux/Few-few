// Чисти решения за синхронизация на плановете със Stripe (спецификация
// docs/billing-spec.md, раздели 3 и 9–9.4). БЕЗ импорт на stripe/prisma: входът е
// нормализиран snapshot от живото състояние, изходът е решение. Адаптерите
// (impure) са в stripe-state.ts, прилагането (CAS) е в webhook route-а.
// Идемпотентност: всяко решение зависи само от състоянието (level-triggered),
// затова повторено или разместено събитие дава същия краен резултат.
import { BILLING_INTERVALS, stripePriceEnvFor, type PlanId } from './plans';

export type PaidPlanId = Exclude<PlanId, 'FREE'>;

/** Причина за обърнато плащане / отнет план / сторниран реферал. */
export type ReversalReason = 'refund' | 'dispute';

/** Низ от базата → ReversalReason; всичко друго (вкл. null) → null. */
export function toReversalReason(value: string | null | undefined): ReversalReason | null {
  return value === 'refund' || value === 'dispute' ? value : null;
}
export type SubscriptionPlanId = Exclude<PlanId, 'FREE' | 'FOUNDER'>; // PRO | BUSINESS

const PAID_PLANS: readonly PaidPlanId[] = ['PRO', 'BUSINESS', 'FOUNDER'];
const SUBSCRIPTION_PLANS: readonly SubscriptionPlanId[] = ['PRO', 'BUSINESS'];

function isPaidPlan(value: string | undefined): value is PaidPlanId {
  return value !== undefined && (PAID_PLANS as readonly string[]).includes(value);
}

// ── Класификация на checkout ────────────────────────────────────────
export type CheckoutKind =
  | { kind: 'plan'; userId: string; plan: PaidPlanId }
  | { kind: 'shop'; productId: string; profileId: string }
  | { kind: 'ignore'; reason: 'no-metadata' | 'ambiguous' | 'unknown-plan' };

function planCheckout(userId: string, plan: string | undefined): CheckoutKind {
  return isPaidPlan(plan)
    ? { kind: 'plan', userId, plan }
    : { kind: 'ignore', reason: 'unknown-plan' };
}

/**
 * Явен `metadata.kind` ('plan' | 'shop') има предимство. Заварените сесии без
 * kind се класифицират по досегашното правило: магазинът също носи `plan`
 * (плана на продавача за комисионата), затова решава наличието на userId.
 */
export function classifyCheckout(
  metadata: Readonly<Record<string, string>> | null | undefined,
): CheckoutKind {
  if (!metadata) return { kind: 'ignore', reason: 'no-metadata' };
  const { kind, userId, plan, productId, profileId } = metadata;
  const hasPlan = Boolean(userId) && Boolean(plan);
  const hasShop = Boolean(productId) && Boolean(profileId);

  if (kind === 'plan') {
    return userId ? planCheckout(userId, plan) : { kind: 'ignore', reason: 'no-metadata' };
  }
  if (kind === 'shop') {
    return hasShop
      ? { kind: 'shop', productId, profileId }
      : { kind: 'ignore', reason: 'no-metadata' };
  }
  if (kind) return { kind: 'ignore', reason: 'ambiguous' };

  if (hasPlan && hasShop) return { kind: 'ignore', reason: 'ambiguous' };
  if (hasPlan) return planCheckout(userId, plan);
  if (hasShop) return { kind: 'shop', productId, profileId };
  return { kind: 'ignore', reason: 'no-metadata' };
}

// ── Цена → план ─────────────────────────────────────────────────────
/**
 * Карта Price ID → PRO/BUSINESS от env (параметър, не process.env):
 * STRIPE_PRICE_<PLAN>_<INTERVAL> + заварените STRIPE_PRICE_<PLAN>. FOUNDER
 * не влиза (еднократен). Хвърля при една цена за два плана.
 */
export function buildPlanPriceMap(
  env: Readonly<Record<string, string | undefined>>,
): ReadonlyMap<string, SubscriptionPlanId> {
  const map = new Map<string, SubscriptionPlanId>();
  for (const plan of SUBSCRIPTION_PLANS) {
    const names = [
      `STRIPE_PRICE_${plan}`,
      ...BILLING_INTERVALS.map((interval) => stripePriceEnvFor(plan, interval.id)),
    ];
    for (const name of names) {
      const priceId = env[name]?.trim();
      if (!priceId) continue;
      const existing = map.get(priceId);
      if (existing && existing !== plan) {
        throw new Error(`Price ID в ${name} е зададен и за план ${existing}`);
      }
      map.set(priceId, plan);
    }
  }
  return map;
}

/** Точно един план сред позициите → той; нула или различни планове → null. */
export function planForPriceIds(
  priceIds: readonly string[],
  map: ReadonlyMap<string, SubscriptionPlanId>,
): SubscriptionPlanId | null {
  const plans = new Set<SubscriptionPlanId>();
  for (const priceId of priceIds) {
    const plan = map.get(priceId);
    if (plan) plans.add(plan);
  }
  return plans.size === 1 ? [...plans][0] : null;
}

// ── Статус → право ──────────────────────────────────────────────────
// past_due е гратис по време на Smart Retries (O-2). Непознат → false.
const GRANTING_STATUSES = new Set(['active', 'trialing', 'past_due']);
const TERMINAL_STATUSES = new Set(['canceled', 'incomplete_expired']);

export function subscriptionGrantsPlan(status: string): boolean {
  return GRANTING_STATUSES.has(status);
}

// ── Снимки ───────────────────────────────────────────────────────────
export interface PlanUserSnapshot {
  id: string;
  plan: PlanId;
  stripeCustomerId: string | null;
  planSubscriptionId: string | null;
  planPaymentIntentId: string | null;
  planRevokedReason: ReversalReason | null;
  /** Оспореното плащане по плановия абонамент (A10); null/липсва = няма или заварено. */
  planDisputedPaymentIntentId?: string | null;
}

/**
 * Дискриминатор (спецификация 9.1, A10/F13): причината 'dispute' е от спор
 * по ПЛАНОВИЯ АБОНАМЕНТ, а не от отнет FOUNDER, когато е записан оспореният PI
 * на абонамента (новият път винаги го записва) ИЛИ потребителят няма FOUNDER
 * плащане (заварен ред: тогава спорът няма как да е по FOUNDER).
 */
export function isSubscriptionDispute(user: PlanUserSnapshot): boolean {
  return (
    user.planRevokedReason === 'dispute' &&
    ((user.planDisputedPaymentIntentId ?? null) !== null || user.planPaymentIntentId === null)
  );
}

/** Абонаментът под спор (O-1 hold за grant), или null. */
export function disputeHoldSubscriptionId(user: PlanUserSnapshot): string | null {
  return isSubscriptionDispute(user) ? user.planSubscriptionId : null;
}

/** Resume/restore само за записания оспорен PI; null (заварено) допуска всеки. */
function matchesDisputedPayment(user: PlanUserSnapshot, paymentIntentId: string | null | undefined): boolean {
  const recorded = user.planDisputedPaymentIntentId ?? null;
  return recorded === null || recorded === paymentIntentId;
}
export interface SubscriptionSnapshot {
  id: string;
  customerId: string;
  status: string; // актуален, от subscriptions.retrieve
  priceIds: readonly string[];
}
export interface ChargeSnapshot {
  amountCents: number; // цели центове
  amountRefundedCents: number; // натрупано
}

// ── Синхронизация на абонамент → User.plan (D2) ─────────────────────
export type PlanSyncDecision =
  | {
      action: 'noop';
      reason:
        | 'no-user'
        | 'founder'
        | 'not-plan-subscription'
        | 'unknown-price'
        | 'unchanged'
        | 'dispute-hold';
    }
  | { action: 'set'; plan: PlanId; adoptSubscriptionId: string | null };

export function decideSubscriptionSync(
  user: PlanUserSnapshot | null,
  sub: SubscriptionSnapshot,
  priceMap: ReadonlyMap<string, SubscriptionPlanId>,
): PlanSyncDecision {
  if (!user) return { action: 'noop', reason: 'no-user' };
  // Founder не се отнема от събитие за абонамент (CLAUDE.md).
  if (user.plan === 'FOUNDER') return { action: 'noop', reason: 'founder' };
  if (user.planSubscriptionId !== null && user.planSubscriptionId !== sub.id) {
    return { action: 'noop', reason: 'not-plan-subscription' };
  }
  const pricePlan = planForPriceIds(sub.priceIds, priceMap);
  const adopt = user.planSubscriptionId === null;
  if (adopt && (user.stripeCustomerId !== sub.customerId || pricePlan === null)) {
    return { action: 'noop', reason: 'not-plan-subscription' };
  }
  const grants = subscriptionGrantsPlan(sub.status);
  // Не сваляме плащащ клиент заради грешка в конфигурацията на цените.
  if (grants && pricePlan === null) return { action: 'noop', reason: 'unknown-price' };
  const target: PlanId = grants && pricePlan ? pricePlan : 'FREE';
  // O-1: докато трае спорът ПО АБОНАМЕНТА, синхронизацията не връща платен
  // план. Запазен FOUNDER-спор (F13) не блокира новия абонамент.
  if (isSubscriptionDispute(user) && target !== 'FREE') {
    return { action: 'noop', reason: 'dispute-hold' };
  }
  if (adopt) return { action: 'set', plan: target, adoptSubscriptionId: sub.id };
  if (target === user.plan) return { action: 'noop', reason: 'unchanged' };
  return { action: 'set', plan: target, adoptSubscriptionId: null };
}

/**
 * L4: защо заварен абонамент НЕ се осиновява (за лог в webhook-а). Non-null
 * само при осиновяване (потребител без planSubscriptionId, не FOUNDER).
 */
export function adoptionSkipReason(
  user: PlanUserSnapshot | null,
  sub: SubscriptionSnapshot,
  priceMap: ReadonlyMap<string, SubscriptionPlanId>,
): 'unknown-price' | 'customer-mismatch' | null {
  if (!user || user.plan === 'FOUNDER' || user.planSubscriptionId !== null) return null;
  if (user.stripeCustomerId !== sub.customerId) return 'customer-mismatch';
  if (planForPriceIds(sub.priceIds, priceMap) === null) return 'unknown-price';
  return null;
}

/**
 * Заварен клиент (без planSubscriptionId): ако събитието е за абонамент,
 * който не дава план, но същият customer има жив абонамент с планова цена,
 * се осиновява живият. Иначе закъсняло `deleted` на стар абонамент би
 * заключило плащащия клиент на FREE.
 */
export function selectAdoptableSubscription(
  eventSub: SubscriptionSnapshot,
  customerSubs: readonly SubscriptionSnapshot[],
  priceMap: ReadonlyMap<string, SubscriptionPlanId>,
): SubscriptionSnapshot {
  if (subscriptionGrantsPlan(eventSub.status)) return eventSub;
  const alive = customerSubs.find(
    (sub) =>
      sub.id !== eventSub.id &&
      sub.customerId === eventSub.customerId &&
      subscriptionGrantsPlan(sub.status) &&
      planForPriceIds(sub.priceIds, priceMap) !== null,
  );
  return alive ?? eventSub;
}

// ── Обърнато ли е плащането (P5) ─────────────────────────────────────
export type PaymentReversal =
  | { reversed: false }
  | { reversed: true; reason: ReversalReason };

// Inquiry (warning_*) не е chargeback; won/prevented не теглят пари.
// Всеки друг статус (вкл. непознат) се брои за обърнато (fail-closed).
const NON_REVERSING_DISPUTE_STATUSES = new Set([
  'warning_needs_response',
  'warning_under_review',
  'warning_closed',
  'won',
  'prevented',
]);

export function paymentReversal(
  charge: ChargeSnapshot,
  disputeStatuses: readonly string[],
): PaymentReversal {
  if (charge.amountCents <= 0) return { reversed: false };
  if (charge.amountRefundedCents >= charge.amountCents) {
    return { reversed: true, reason: 'refund' };
  }
  if (disputeStatuses.some((status) => !NON_REVERSING_DISPUTE_STATUSES.has(status))) {
    return { reversed: true, reason: 'dispute' };
  }
  return { reversed: false };
}

// ── FOUNDER (D1) ─────────────────────────────────────────────────────
export type FounderDecision =
  | { action: 'noop'; reason: 'not-founder-payment' | 'unchanged' | 'refund-terminal' }
  | { action: 'revoke'; reason: ReversalReason }
  | { action: 'restore' }
  | { action: 'flag'; reason: 'restore-blocked-plan-changed' };

export function decideFounderPayment(
  user: PlanUserSnapshot | null,
  paymentIntentId: string,
  reversal: PaymentReversal,
): FounderDecision {
  if (!user || user.planPaymentIntentId !== paymentIntentId) {
    return { action: 'noop', reason: 'not-founder-payment' };
  }
  if (reversal.reversed) {
    return user.plan === 'FOUNDER'
      ? { action: 'revoke', reason: reversal.reason }
      : { action: 'noop', reason: 'unchanged' };
  }
  if (user.planRevokedReason === 'dispute') {
    // F14: причината е от спор по АБОНАМЕНТА (не по FOUNDER) → не връщаме
    // FOUNDER автоматично, а сигнализираме за ръчно решение.
    return user.plan === 'FREE' && !isSubscriptionDispute(user)
      ? { action: 'restore' }
      : { action: 'flag', reason: 'restore-blocked-plan-changed' };
  }
  // Refund е краен: провален refund не връща плана автоматично (P6).
  if (user.planRevokedReason === 'refund') return { action: 'noop', reason: 'refund-terminal' };
  return { action: 'noop', reason: 'unchanged' };
}

// ── Спор по плановия абонамент (O-1: пауза на таксуването, не отмяна) ──
export type CollectionDecision = 'pause' | 'resume' | 'none';

/**
 * `collectionPaused` е живото `subscription.pause_collection !== null`.
 * Ред в адаптера: първо Stripe (pause/resume), после БД — виж спецификацията, 9.1.
 */
export function decidePlanSubscriptionCollection(
  user: PlanUserSnapshot | null,
  subscriptionIdOfPayment: string | null,
  reversal: PaymentReversal,
  subscriptionStatus: string,
  collectionPaused: boolean,
  paymentIntentId?: string | null,
): CollectionDecision {
  if (!user || subscriptionIdOfPayment === null) return 'none';
  if (user.planSubscriptionId !== subscriptionIdOfPayment) return 'none';
  if (user.plan === 'FOUNDER') return 'none';
  if (TERMINAL_STATUSES.has(subscriptionStatus)) return 'none';
  if (reversal.reversed) {
    return reversal.reason === 'dispute' && !collectionPaused ? 'pause' : 'none';
  }
  // Възобновяваме само пауза, която сме сложили ние, и само при събитие по
  // оспореното плащане (A10): друго успешно плащане не отменя паузата.
  return isSubscriptionDispute(user) && collectionPaused && matchesDisputedPayment(user, paymentIntentId)
    ? 'resume'
    : 'none';
}

export type PlanSubscriptionDisputeDecision =
  | { action: 'noop'; reason: 'not-plan-subscription-payment' | 'founder' | 'unchanged' }
  | { action: 'revoke'; reason: 'dispute' }
  | { action: 'restore' };

export function decidePlanSubscriptionDispute(
  user: PlanUserSnapshot | null,
  subscriptionIdOfPayment: string | null,
  reversal: PaymentReversal,
  paymentIntentId?: string | null,
): PlanSubscriptionDisputeDecision {
  if (!user || subscriptionIdOfPayment === null || user.planSubscriptionId !== subscriptionIdOfPayment) {
    return { action: 'noop', reason: 'not-plan-subscription-payment' };
  }
  if (user.plan === 'FOUNDER') return { action: 'noop', reason: 'founder' };
  if (reversal.reversed) {
    // P7: refund по абонамента не сваля плана — решава статусът му.
    if (reversal.reason !== 'dispute') return { action: 'noop', reason: 'unchanged' };
    return user.plan === 'FREE' && user.planRevokedReason === 'dispute'
      ? { action: 'noop', reason: 'unchanged' }
      : { action: 'revoke', reason: 'dispute' };
  }
  return isSubscriptionDispute(user) && matchesDisputedPayment(user, paymentIntentId)
    ? { action: 'restore' }
    : { action: 'noop', reason: 'unchanged' };
}

export type PlanDisputeStep = 'db-revoke' | 'stripe-pause' | 'stripe-resume' | 'db-restore' | 'resync';

/**
 * A11: ред на стъпките. Pause → първо БД (паричният риск се затваря веднага,
 * дори Stripe да се провали), после Stripe. Resume → първо Stripe, после БД
 * (иначе изчистената причина би загубила resume при ретрай).
 */
export function planDisputeSteps(
  collection: CollectionDecision,
  dispute: PlanSubscriptionDisputeDecision,
  reversal?: PaymentReversal,
): PlanDisputeStep[] {
  const steps = disputeEffectSteps(collection, dispute);
  // A12: необърнато плащане → винаги завършва с синхронизация по живото
  // състояние (level-triggered): ретрай след срив между db-restore и sync
  // пак връща плана.
  return reversal?.reversed === false ? [...steps, 'resync'] : steps;
}

function disputeEffectSteps(
  collection: CollectionDecision,
  dispute: PlanSubscriptionDisputeDecision,
): PlanDisputeStep[] {
  if (collection === 'pause') {
    if (dispute.action === 'revoke') return ['db-revoke', 'stripe-pause'];
    if (dispute.action === 'noop') return ['stripe-pause'];
    return [];
  }
  if (collection === 'resume') return dispute.action === 'restore' ? ['stripe-resume', 'db-restore'] : [];
  if (dispute.action === 'revoke') return ['db-revoke'];
  if (dispute.action === 'restore') return ['db-restore'];
  return [];
}

/**
 * A11: пуска ВСИЧКИ задачи последователно (провал на една не спира
 * следващите), после хвърля първата грешка → 500 → Stripe ретрайва.
 */
export async function runIsolated(tasks: readonly (() => Promise<unknown>)[]): Promise<void> {
  let firstError: unknown = null;
  let failed = false;
  for (const task of tasks) {
    try {
      await task();
    } catch (error) {
      if (!failed) firstError = error;
      failed = true;
    }
  }
  if (failed) throw firstError;
}

// ── Предоставяне от checkout ────────────────────────────────────────
export type CheckoutPlanDecision =
  | {
      action: 'grant';
      plan: PaidPlanId;
      link: { paymentIntentId: string } | { subscriptionId: string };
    }
  | {
      action: 'skip';
      reason:
        | 'not-paid'
        | 'mode-mismatch'
        | 'missing-link'
        | 'payment-reversed'
        | 'subscription-not-granting'
        | 'already-founder'
        | 'dispute-hold';
    };

export function decideCheckoutPlanGrant(input: {
  plan: PaidPlanId;
  mode: 'payment' | 'subscription' | 'setup';
  paymentStatus: 'paid' | 'unpaid' | 'no_payment_required';
  paymentIntentId: string | null;
  subscriptionId: string | null;
  reversal: PaymentReversal | null; // live, за mode 'payment'
  subscriptionStatus: string | null; // live, за mode 'subscription'
  currentPlan: PlanId;
  /** planSubscriptionId, когато planRevokedReason === 'dispute' (O-1). */
  holdSubscriptionId?: string | null;
}): CheckoutPlanDecision {
  const expectedMode = input.plan === 'FOUNDER' ? 'payment' : 'subscription';
  if (input.mode !== expectedMode) return { action: 'skip', reason: 'mode-mismatch' };
  if (input.currentPlan === 'FOUNDER' && input.plan !== 'FOUNDER') {
    return { action: 'skip', reason: 'already-founder' };
  }
  if (input.mode === 'payment') {
    if (input.paymentStatus !== 'paid') return { action: 'skip', reason: 'not-paid' };
    // Без живо състояние на плащането не даваме (fail-closed).
    if (!input.paymentIntentId || !input.reversal) return { action: 'skip', reason: 'missing-link' };
    if (input.reversal.reversed) return { action: 'skip', reason: 'payment-reversed' };
    return { action: 'grant', plan: input.plan, link: { paymentIntentId: input.paymentIntentId } };
  }
  if (input.paymentStatus === 'unpaid') return { action: 'skip', reason: 'not-paid' };
  if (!input.subscriptionId) return { action: 'skip', reason: 'missing-link' };
  if (input.holdSubscriptionId && input.holdSubscriptionId === input.subscriptionId) {
    return { action: 'skip', reason: 'dispute-hold' };
  }
  if (!subscriptionGrantsPlan(input.subscriptionStatus ?? '')) {
    return { action: 'skip', reason: 'subscription-not-granting' };
  }
  return { action: 'grant', plan: input.plan, link: { subscriptionId: input.subscriptionId } };
}

/**
 * W1/W2: предупреждение за ръчно наблюдение (webhook-ът го праща в console.warn).
 * - 'second-dispute': нов спор по ДРУГО плащане на абонамента, докато има
 *   записан оспорен PI (записва се само първият — остатъчен риск 4).
 * - 'restore-founder-trace': restore по абонамента при потребител със
 *   FOUNDER плащане — изчистената причина може да е носила и FOUNDER-спор.
 */
export function planDisputeWarning(
  user: PlanUserSnapshot | null,
  paymentIntentId: string,
  reversal: PaymentReversal,
  dispute: PlanSubscriptionDisputeDecision,
): 'second-dispute' | 'restore-founder-trace' | null {
  if (!user) return null;
  if (dispute.action === 'restore') {
    return user.planPaymentIntentId !== null ? 'restore-founder-trace' : null;
  }
  const recorded = user.planDisputedPaymentIntentId ?? null;
  const relevant = dispute.action === 'revoke' || (dispute.action === 'noop' && dispute.reason === 'unchanged');
  if (
    relevant &&
    reversal.reversed &&
    reversal.reason === 'dispute' &&
    recorded !== null &&
    recorded !== paymentIntentId
  ) {
    return 'second-dispute';
  }
  return null;
}

/** G10: след grant от абонамент webhook-ът синхронизира по живия абонамент. */
export function subscriptionIdToResyncAfterGrant(d: CheckoutPlanDecision): string | null {
  return d.action === 'grant' && 'subscriptionId' in d.link ? d.link.subscriptionId : null;
}

/**
 * F13: нов не-FOUNDER план НЕ чисти причината, когато FOUNDER е отнет по
 * спор — иначе спечелен FOUNDER спор не стига до flag (F8).
 */
export function shouldClearRevocationOnGrant(user: PlanUserSnapshot, grantedPlan: PlanId): boolean {
  // F13e: пазим САМО FOUNDER-спор; спор по стар абонамент се чисти с новия
  // grant (иначе вечен dispute-hold на плащащ клиент).
  return !(
    grantedPlan !== 'FOUNDER' &&
    user.planPaymentIntentId !== null &&
    user.planRevokedReason === 'dispute' &&
    !isSubscriptionDispute(user)
  );
}

/**
 * B1: първият ненулев PI сред платените сесии (по реда на входа). Неплатените
 * не се питат; спира при първия намерен.
 */
export async function firstPaidPaymentIntent<S extends { payment_status: string | null }>(
  sessions: readonly S[],
  piOf: (session: S) => Promise<string | null>,
): Promise<string | null> {
  for (const session of sessions) {
    if (session.payment_status !== 'paid') continue;
    const pi = await piOf(session);
    if (pi) return pi;
  }
  return null;
}

// ── Реферал (D3) ─────────────────────────────────────────────────────
export interface ReferralSnapshot {
  id: string;
  referrerId: string;
  rewardCents: number;
  createdAt: Date;
  stripePaymentIntentId: string | null;
  reversedAt: Date | null;
  reversalReason: ReversalReason | null;
}
export interface PayoutSnapshot {
  id: string;
  requestedAt: Date;
  status: 'pending' | 'paid';
}
export type ReferralDecision =
  | { action: 'noop'; reason: 'not-referral-payment' | 'unchanged' | 'refund-terminal' }
  | {
      action: 'reverse';
      reason: ReversalReason;
      decrementCents: number;
      clawbackPayoutId: string | null;
      clawbackPayoutStatus: 'pending' | 'paid' | null;
    }
  | { action: 'restore'; incrementCents: number };

export function decideReferralReversal(
  referral: ReferralSnapshot | null,
  paymentIntentId: string,
  reversal: PaymentReversal,
  payoutsOfReferrer: readonly PayoutSnapshot[],
): ReferralDecision {
  if (!referral || referral.stripePaymentIntentId !== paymentIntentId) {
    return { action: 'noop', reason: 'not-referral-payment' };
  }
  if (reversal.reversed) {
    if (referral.reversedAt !== null) return { action: 'noop', reason: 'unchanged' };
    // requestPayoutAction снапшотва целия баланс → наградата е в първия
    // payout, поискан след нея.
    const clawback = payoutsOfReferrer
      .filter((p) => p.requestedAt.getTime() >= referral.createdAt.getTime())
      .reduce<PayoutSnapshot | null>(
        (earliest, p) =>
          earliest === null || p.requestedAt.getTime() < earliest.requestedAt.getTime() ? p : earliest,
        null,
      );
    return {
      action: 'reverse',
      reason: reversal.reason,
      decrementCents: referral.rewardCents, // записаната, не преизчислена
      clawbackPayoutId: clawback?.id ?? null,
      clawbackPayoutStatus: clawback?.status ?? null,
    };
  }
  if (referral.reversalReason === 'refund') return { action: 'noop', reason: 'refund-terminal' };
  if (referral.reversalReason === 'dispute' && referral.reversedAt !== null) {
    return { action: 'restore', incrementCents: referral.rewardCents };
  }
  return { action: 'noop', reason: 'unchanged' };
}
