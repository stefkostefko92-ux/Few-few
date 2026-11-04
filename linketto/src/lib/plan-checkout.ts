// Plan checkout без дубли (ядро: пари). Преди нов checkout потребителят има
// ЕДИН Stripe Customer (иначе customer_email кара Stripe да създаде нов
// Customer за всяка сесия), живото състояние в Stripe блокира втори
// абонамент/„Основател“ дори когато базата още казва FREE (webhook-ът не е
// дошъл), а отворените plan сесии на customer-а се изтичат. Чистата логика е
// тук; адаптерите към Stripe/Prisma са в actions/billing.ts.
import type Stripe from 'stripe';
import { classifyCheckout, type PaidPlanId } from './billing-sync';

/** Статуси, при които клиентът вече има абонамент (нов checkout = дубъл). */
export const BLOCKING_SUBSCRIPTION_STATUSES: ReadonlySet<string> = new Set([
  'active',
  'trialing',
  'past_due',
  'unpaid',
]);

/**
 * PaymentIntent на неплатена (отложен метод) „Основател“ сесия, при които
 * плащането вече няма да дойде → сесията не блокира нов checkout.
 */
export const FOUNDER_PENDING_DEAD_PI_STATUSES: ReadonlySet<string> = new Set([
  'canceled',
  'requires_payment_method',
]);

/** Plan checkout сесия (вкл. заварени без kind) — не магазинна. */
export function isPlanSession(
  metadata: Readonly<Record<string, string>> | null | undefined,
): boolean {
  return classifyCheckout(metadata).kind === 'plan';
}

export interface FounderSessionView {
  metadata: Readonly<Record<string, string>> | null;
  payment_status: string;
  payment_intent: string | { id: string } | null;
}

export interface FounderSessionPayment {
  paymentIntentId: string;
  /** true = платено; false = отложен метод в обработка (complete + unpaid). */
  paid: boolean;
}

/** Завършена FOUNDER plan сесия → плащането ѝ; всичко друго → null. */
export function founderSessionPayment(session: FounderSessionView): FounderSessionPayment | null {
  const kind = classifyCheckout(session.metadata);
  if (kind.kind !== 'plan' || kind.plan !== 'FOUNDER') return null;
  const pi = typeof session.payment_intent === 'string'
    ? session.payment_intent
    : (session.payment_intent?.id ?? null);
  if (!pi) return null;
  if (session.payment_status === 'paid') return { paymentIntentId: pi, paid: true };
  if (session.payment_status === 'unpaid') return { paymentIntentId: pi, paid: false };
  return null;
}

/** CAS условие за записа на customer: само ако полето още е празно. */
export function customerClaimWhere(userId: string): { id: string; stripeCustomerId: null } {
  return { id: userId, stripeCustomerId: null };
}

export function customerIdempotencyKey(userId: string): string {
  return `linketto-plan-customer-${userId}`;
}

export interface PlanCheckoutUser {
  id: string;
  email: string;
  stripeCustomerId: string | null;
  /** Записаният FOUNDER PaymentIntent (при FREE = отнет по refund/спор). */
  planPaymentIntentId: string | null;
}

export interface PlanCheckoutPorts {
  createCustomer(input: { userId: string; email: string }, idempotencyKey: string): Promise<string>;
  /** Записва customer само ако полето още е null; връща записания (победителя). */
  claimCustomer(userId: string, customerId: string): Promise<string>;
  listSubscriptionStatuses(customerId: string): Promise<string[]>;
  /** Завършените FOUNDER plan сесии на customer-а (платени и в обработка). */
  listFounderSessions(customerId: string): Promise<FounderSessionPayment[]>;
  paymentIntentStatus(paymentIntentId: string): Promise<string>;
  /** Пълен refund или загубен/активен спор (paymentReversal != null). */
  isPaymentReversed(paymentIntentId: string): Promise<boolean>;
  listOpenPlanSessionIds(customerId: string): Promise<string[]>;
  expireSession(sessionId: string): Promise<void>;
}

export async function ensureStripeCustomer(
  user: PlanCheckoutUser,
  ports: PlanCheckoutPorts,
): Promise<string> {
  if (user.stripeCustomerId) return user.stripeCustomerId;
  const created = await ports.createCustomer(
    { userId: user.id, email: user.email },
    customerIdempotencyKey(user.id),
  );
  return ports.claimCustomer(user.id, created);
}

export type PreparePlanCheckoutResult =
  | { ok: true; customerId: string }
  | { ok: false; error: 'plan' };

/**
 * Ред: customer → изтичане на отворените plan сесии → проверка на живото
 * състояние. Изтичането е ПРЕДИ проверката: след него стара сесия не може да
 * завърши, затова проверката вижда всичко платено. Грешка от Stripe се
 * пропагира (fail-closed — без нова сесия).
 */
export async function preparePlanCheckout(
  user: PlanCheckoutUser,
  ports: PlanCheckoutPorts,
): Promise<PreparePlanCheckoutResult> {
  const customerId = await ensureStripeCustomer(user, ports);
  for (const sessionId of await ports.listOpenPlanSessionIds(customerId)) {
    await ports.expireSession(sessionId);
  }
  const statuses = await ports.listSubscriptionStatuses(customerId);
  if (statuses.some((s) => BLOCKING_SUBSCRIPTION_STATUSES.has(s))) {
    return { ok: false, error: 'plan' };
  }
  for (const founder of await ports.listFounderSessions(customerId)) {
    const pi = founder.paymentIntentId;
    if (founder.paid) {
      // Записан PI при FREE = този „Основател“ вече е обработен и отнет.
      if (pi === user.planPaymentIntentId) continue;
      if (!(await ports.isPaymentReversed(pi))) return { ok: false, error: 'plan' };
    } else {
      // SEPA/iDEAL в обработка: базата е FREE до async_payment_succeeded.
      // Пуска се само ако плащането вече няма да дойде.
      const status = await ports.paymentIntentStatus(pi);
      if (!FOUNDER_PENDING_DEAD_PI_STATUSES.has(status)) return { ok: false, error: 'plan' };
    }
  }
  return { ok: true, customerId };
}

export interface PlanSessionInput {
  customerId: string;
  userId: string;
  plan: PaidPlanId;
  priceId: string;
  oneTime: boolean;
  taxEnabled: boolean;
  successUrl: string;
  cancelUrl: string;
}

/** Параметрите на plan сесията: винаги `customer`, никога `customer_email`. */
export function planCheckoutSessionParams(
  input: PlanSessionInput,
): Stripe.Checkout.SessionCreateParams {
  return {
    mode: input.oneTime ? 'payment' : 'subscription',
    line_items: [{ price: input.priceId, quantity: 1 }],
    customer: input.customerId,
    // ДДС (TAX.md): плановете са наша електронна услуга. Stripe Tax смята
    // ДДС по държавата на клиента (OSS); tax_id_collection взима и валидира
    // (VIES) ДДС номер → B2B reverse charge автоматично. Env Price ID-тата
    // трябва да са tax-inclusive (DEPLOY.md §2а). С подаден customer
    // customer_update пише събрания адрес/име върху него (docs.stripe.com/tax/checkout/page).
    ...(input.taxEnabled
      ? {
          automatic_tax: { enabled: true },
          tax_id_collection: { enabled: true },
          billing_address_collection: 'required' as const,
          customer_update: { address: 'auto' as const, name: 'auto' as const },
        }
      : {}),
    // Планът се дава само през проверения webhook, не през redirect-а.
    // kind: явна класификация в webhook-а (магазинът също носи plan).
    metadata: { kind: 'plan', userId: input.userId, plan: input.plan },
    locale: 'auto',
    success_url: input.successUrl,
    cancel_url: input.cancelUrl,
  };
}

/**
 * Webhook: записва customer от сесията само ако потребителят още няма такъв.
 * Различен записан customer НЕ се презаписва (иначе първият абонамент излиза
 * от Billing Portal) — разминаването се връща за лог и ръчна проверка.
 */
export function customerLinkUpdate(
  current: string | null,
  fromSession: string | null,
): { set: string | null; mismatch: boolean } {
  if (!fromSession) return { set: null, mismatch: false };
  if (!current) return { set: fromSession, mismatch: false };
  return { set: null, mismatch: current !== fromSession };
}
