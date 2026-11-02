// Адаптери: живо състояние от Stripe → нормализирани snapshot-и за
// billing-sync.ts. Impure, не се unit-тестват (доказват се с test mode +
// `stripe listen`). Без 'server-only' импорт, за да ги ползва и
// scripts/backfill-plan-links.ts; Stripe клиентът е параметър.
//
// ВЪРЗАНИ КЪМ API 2025-02-24.acacia (src/lib/stripe.ts). В 2025-03-31.basil
// са махнати PaymentIntent.invoice и Invoice.payment_intent/subscription
// (вместо тях invoicePayments.list и invoice.parent) — при ъпгрейд се
// пренаписва само този файл; чистите функции остават.
import type Stripe from 'stripe';
import type { ChargeSnapshot, SubscriptionSnapshot } from './billing-sync';

function idOf(value: string | { id: string } | null | undefined): string | null {
  if (!value) return null;
  return typeof value === 'string' ? value : value.id;
}

export interface PaymentState {
  charge: ChargeSnapshot;
  disputeStatuses: string[];
  /** Абонаментът, чиято фактура е платена с това плащане (или null). */
  subscriptionId: string | null;
}

/** Живо състояние на плащане: сума/refund от последния charge, спорове, абонамент. */
export async function loadPaymentState(
  stripe: Stripe,
  paymentIntentId: string,
): Promise<PaymentState> {
  const pi = await stripe.paymentIntents.retrieve(paymentIntentId, {
    expand: ['latest_charge'],
  });
  const latest = pi.latest_charge;
  const charge: ChargeSnapshot =
    latest && typeof latest !== 'string'
      ? { amountCents: latest.amount, amountRefundedCents: latest.amount_refunded }
      : { amountCents: 0, amountRefundedCents: 0 };

  let subscriptionId: string | null = null;
  const invoiceId = idOf(pi.invoice);
  if (invoiceId) {
    const invoice = await stripe.invoices.retrieve(invoiceId);
    subscriptionId = idOf(invoice.subscription);
  }

  const disputeStatuses: string[] = [];
  for await (const dispute of stripe.disputes.list({
    payment_intent: paymentIntentId,
    limit: 100,
  })) {
    disputeStatuses.push(dispute.status);
  }
  return { charge, disputeStatuses, subscriptionId };
}

export interface LiveSubscription {
  snapshot: SubscriptionSnapshot;
  /** subscription.pause_collection !== null (O-1). */
  collectionPaused: boolean;
}

export function toSubscriptionSnapshot(sub: Stripe.Subscription): SubscriptionSnapshot {
  return {
    id: sub.id,
    customerId: idOf(sub.customer) ?? '',
    status: sub.status,
    priceIds: sub.items.data.map((item) => item.price.id),
  };
}

export async function loadSubscription(
  stripe: Stripe,
  subscriptionId: string,
): Promise<LiveSubscription> {
  const sub = await stripe.subscriptions.retrieve(subscriptionId);
  return {
    snapshot: toSubscriptionSnapshot(sub),
    collectionPaused: sub.pause_collection !== null,
  };
}

/** Всички абонаменти на customer (за осиновяване при заварени клиенти). */
export async function listCustomerSubscriptions(
  stripe: Stripe,
  customerId: string,
): Promise<SubscriptionSnapshot[]> {
  const result: SubscriptionSnapshot[] = [];
  for await (const sub of stripe.subscriptions.list({
    customer: customerId,
    status: 'all',
    limit: 100,
  })) {
    result.push(toSubscriptionSnapshot(sub));
  }
  return result;
}

/**
 * O-1: обратима пауза на таксуването (`behavior: 'void'` — фактурите през
 * паузата се анулират) или възобновяване (`''` маха pause_collection в
 * stripe-node). Idempotency-Key пази от двоен ефект при ретрай.
 */
export async function setSubscriptionCollectionPaused(
  stripe: Stripe,
  subscriptionId: string,
  paused: boolean,
  idempotencyKey: string,
): Promise<void> {
  await stripe.subscriptions.update(
    subscriptionId,
    { pause_collection: paused ? { behavior: 'void' } : '' },
    { idempotencyKey },
  );
}

/** Първото плащане на checkout сесия: payment → PI; subscription → PI на първата фактура. */
export async function firstPaymentIntentOfSession(
  stripe: Stripe,
  session: Stripe.Checkout.Session,
): Promise<string | null> {
  if (session.mode === 'payment') return idOf(session.payment_intent);
  if (session.mode === 'subscription') {
    const invoiceId = idOf(session.invoice);
    if (!invoiceId) return null;
    const invoice = await stripe.invoices.retrieve(invoiceId);
    return idOf(invoice.payment_intent);
  }
  return null;
}
