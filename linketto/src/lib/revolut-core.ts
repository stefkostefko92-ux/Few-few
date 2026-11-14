// Revolut Merchant API — чистите части (подпис, тяло на поръчка, резултат от
// поръчка); тестват се без мрежа. Клиентът е в revolut.ts.
// Източник: developer.revolut.com/docs/api/merchant.yaml (info.version 2026-08-17)
// и ръководството „Verify the payload signature“ (spec §7.1 P2–P4).

import { createHmac, timingSafeEqual } from 'node:crypto';

const SIGNATURE_TOLERANCE_MS = 5 * 60_000;

/**
 * P3: `Revolut-Signature` = `v1=` + HMAC-SHA256 hex на `v1.{timestamp}.{сурово тяло}`.
 * При ротация на тайната хедърът носи няколко подписа, разделени със запетая.
 * `Revolut-Request-Timestamp` е UNIX време в милисекунди.
 */
export function verifyRevolutSignature(input: {
  rawBody: string;
  timestamp: string;
  signature: string;
  secret: string;
  now: number;
}): boolean {
  if (!input.secret || !input.timestamp || !input.signature) return false;
  const ts = Number(input.timestamp);
  if (!Number.isFinite(ts) || Math.abs(input.now - ts) > SIGNATURE_TOLERANCE_MS) return false;
  const expected = Buffer.from(
    `v1=${createHmac('sha256', input.secret).update(`v1.${input.timestamp}.${input.rawBody}`).digest('hex')}`,
  );
  return input.signature
    .split(',')
    .map((part) => Buffer.from(part.trim()))
    .some((given) => given.length === expected.length && timingSafeEqual(given, expected));
}

/** P2: тялото на `POST /api/orders` (сумата е в центове, EUR). */
export function revolutOrderBody(input: {
  amountCents: number;
  description: string;
  email: string;
  reference: string;
  redirectUrl: string;
}) {
  return {
    amount: input.amountCents,
    currency: 'EUR',
    description: input.description,
    customer: { email: input.email },
    merchant_order_data: { reference: input.reference },
    metadata: { plan_order_id: input.reference },
    redirect_url: input.redirectUrl,
    expire_pending_after: 'PT1H',
  };
}

const ORDER_STATES = ['pending', 'processing', 'authorised', 'completed', 'cancelled', 'failed'] as const;
export type OrderState = (typeof ORDER_STATES)[number] | 'unknown';

const rec = (value: unknown): Record<string, unknown> =>
  typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
const country = (value: unknown): string | null =>
  typeof value === 'string' && /^[a-z]{2}$/i.test(value) ? value.toUpperCase() : null;

/**
 * P4: какво казва поръчката от `GET /api/orders/{id}` (външни данни — валидират
 * се). Държавите идват от успешното плащане: на картата и от адреса за таксуване.
 */
export function orderOutcome(order: unknown): {
  state: OrderState;
  amountCents: number | null;
  currency: string | null;
  cardCountry: string | null;
  billingCountry: string | null;
} {
  const o = rec(order);
  const state = (ORDER_STATES as readonly string[]).includes(String(o.state))
    ? (o.state as OrderState)
    : 'unknown';
  const payments = Array.isArray(o.payments) ? o.payments.map(rec) : [];
  const paid =
    payments.find((p) => p.state === 'completed' || p.state === 'captured') ??
    payments[payments.length - 1] ??
    {};
  const method = rec(paid.payment_method);
  return {
    state,
    amountCents: Number.isInteger(o.amount) ? (o.amount as number) : null,
    currency: typeof o.currency === 'string' ? o.currency : null,
    cardCountry: country(method.card_country_code),
    billingCountry: country(rec(method.billing_address).country_code),
  };
}
