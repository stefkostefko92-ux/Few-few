// Revolut Merchant API — чистите части (подпис, тяло на поръчка, резултат от
// поръчка); тестват се без мрежа. Клиентът е в revolut.ts.
// Източник: developer.revolut.com/docs/api/merchant.yaml (info.version 2026-08-17)
// и ръководството „Verify the payload signature“ (spec §7.1 P2–P4).

import { createHmac, timingSafeEqual } from 'node:crypto';

const SIGNATURE_TOLERANCE_MS = 5 * 60_000;

/**
 * P3: `Revolut-Signature` = `v1=` + HMAC-SHA256 hex на `v1.{timestamp}.{сурово тяло}`.
 * При ротация на тайната хедърът носи няколко подписа, разделени със запетая.
 * `Revolut-Request-Timestamp` е UNIX време — по вторични източници в
 * милисекунди; първоизточникът не го потвърждава (Д8), затова стойност под
 * 10^12 се тълкува като секунди. Толерансът (5 мин.) е наша политика.
 */
export function verifyRevolutSignature(input: {
  rawBody: string;
  timestamp: string;
  signature: string;
  secret: string;
  now: number;
}): boolean {
  if (!input.secret || !input.timestamp || !input.signature) return false;
  const raw = Number(input.timestamp);
  const ts = raw < 1e12 ? raw * 1000 : raw;
  if (!Number.isFinite(ts) || ts <= 0 || Math.abs(input.now - ts) > SIGNATURE_TOLERANCE_MS) return false;
  const expected = Buffer.from(
    `v1=${createHmac('sha256', input.secret).update(`v1.${input.timestamp}.${input.rawBody}`).digest('hex')}`,
  );
  return input.signature
    .split(',')
    .map((part) => Buffer.from(part.trim()))
    .some((given) => given.length === expected.length && timingSafeEqual(given, expected));
}

/**
 * P2: тялото на `POST /api/orders` (сумата е в центове, EUR). Без `customer`
 * (F5): с email и без `id` Revolut създава НОВ клиент при всяка поръчка
 * (merchant.yaml, Customer-v2), а нищо у нас не чете клиента — потвърждението
 * на траен носител (P14) е наше, имейлът на платеца се взима в checkout-а.
 */
export function revolutOrderBody(input: {
  amountCents: number;
  description: string;
  reference: string;
  redirectUrl: string;
}) {
  return {
    amount: input.amountCents,
    currency: 'EUR',
    description: input.description,
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
 * се). Държавите идват от успешното плащане (Payment-v3): на картата
 * (`payment_method.card_country_code`) и от адреса за таксуване на плащането
 * (`billing_address.country_code`).
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
    billingCountry: country(rec(paid.billing_address).country_code),
  };
}

export type RefundState = 'completed' | 'failed' | 'pending';
// Крайните неуспешни състояния на плащането по refund поръчка (merchant.yaml
// 2026-09-22, refundOrder „Declined refunds“: „completed, or declined/failed“).
const REFUND_PAYMENT_FAILED = new Set(['declined', 'failed']);

/**
 * F1: докъде е refund поръчката (`type: refund`) — от отговора на
 * `POST /api/orders/{id}/refund` или от `GET /api/orders/{id}`. Отказан refund
 * при Revolut Pay (от версия 2026-09-22 — 200 вместо 400) остава с поръчка в
 * `processing`, а отказът е само в `payments[].state` (`declined`/`failed`) —
 * затова се гледат и плащанията, не само `state` на поръчката. Неуспешен е,
 * когато поръчката е `failed`/`cancelled` или ВСИЧКИ плащания са отказани;
 * плащане в ход го държи в ход (иначе — риск от втори refund).
 */
export function refundOutcome(order: unknown): { id: string | null; state: RefundState; declineReason: string | null } {
  const o = rec(order);
  const id = typeof o.id === 'string' && o.id ? o.id : null;
  const payments = Array.isArray(o.payments) ? o.payments.map(rec) : [];
  const failedPayment = [...payments].reverse().find((p) => REFUND_PAYMENT_FAILED.has(String(p.state)));
  const declineReason =
    typeof failedPayment?.decline_reason === 'string' ? failedPayment.decline_reason.replace(/[^\w.-]/g, '').slice(0, 60) : null;
  if (o.state === 'completed') return { id, state: 'completed', declineReason: null };
  if (o.state === 'failed' || o.state === 'cancelled') return { id, state: 'failed', declineReason };
  if (payments.length > 0 && payments.every((p) => REFUND_PAYMENT_FAILED.has(String(p.state)))) {
    return { id, state: 'failed', declineReason };
  }
  return { id, state: 'pending', declineReason: null };
}

// id-та от външни данни, които отиват в пътя на заявка към Revolut.
const REVOLUT_ID = /^[A-Za-z0-9-]{1,100}$/;

const ORDER_EVENTS = new Set([
  'ORDER_COMPLETED',
  'ORDER_AUTHORISED',
  'ORDER_FAILED',
  'ORDER_CANCELLED',
  'ORDER_PAYMENT_FAILED',
  'ORDER_PAYMENT_DECLINED',
]);
const DISPUTE_EVENTS = new Set(['DISPUTE_ACTION_REQUIRED', 'DISPUTE_UNDER_REVIEW', 'DISPUTE_WON', 'DISPUTE_LOST']);

/**
 * Тялото на уебхука (след проверения подпис). Поръчка → `{event, order_id}`,
 * спор → `{event, dispute_id}` (merchant.yaml, webhooks; без id на събитие и
 * без сума — истината се чете от API-то). Всичко друго → null (игнорира се).
 */
export function webhookEvent(
  body: unknown,
): { kind: 'order'; orderId: string } | { kind: 'dispute'; disputeId: string } | null {
  const b = rec(body);
  if (typeof b.event !== 'string') return null;
  if (ORDER_EVENTS.has(b.event) && typeof b.order_id === 'string' && REVOLUT_ID.test(b.order_id)) {
    return { kind: 'order', orderId: b.order_id };
  }
  if (DISPUTE_EVENTS.has(b.event) && typeof b.dispute_id === 'string' && REVOLUT_ID.test(b.dispute_id)) {
    return { kind: 'dispute', disputeId: b.dispute_id };
  }
  return null;
}

const DISPUTE_STATES = ['needs_response', 'under_review', 'won', 'lost'] as const;
export type DisputeState = (typeof DISPUTE_STATES)[number];

const text = (value: unknown, max: number): string | null => {
  if (typeof value !== 'string') return null;
  const clean = value.replace(/\p{Cc}+/gu, ' ').trim().slice(0, max);
  return clean || null;
};
const date = (value: unknown): Date | null => {
  if (typeof value !== 'string') return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
};

/**
 * F2: спорът от `GET /api/disputes/{id}` (Dispute, merchant.yaml) — външни
 * данни, валидират се; непознато състояние → null (човек проверява). Взимат се
 * само служебните полета — без данните на платеца (име, IBAN, карта).
 */
export function disputeOutcome(dispute: unknown): {
  id: string;
  state: DisputeState;
  substate: string | null;
  reasonCode: string | null;
  reason: string | null;
  amountCents: number;
  currency: string;
  responseDueAt: Date | null;
  revolutOrderId: string | null;
} | null {
  const d = rec(dispute);
  if (typeof d.id !== 'string' || !REVOLUT_ID.test(d.id)) return null;
  if (!(DISPUTE_STATES as readonly string[]).includes(String(d.state))) return null;
  if (!Number.isInteger(d.amount) || (d.amount as number) < 0) return null;
  if (typeof d.currency !== 'string' || !/^[A-Z]{3}$/.test(d.currency)) return null;
  const orderId = rec(d.payment).order_id;
  return {
    id: d.id,
    state: d.state as DisputeState,
    substate: text(d.substate, 40),
    reasonCode: text(d.reason_code, 40),
    reason: text(d.reason_description, 200),
    amountCents: d.amount as number,
    currency: d.currency,
    responseDueAt: date(d.response_due_date),
    revolutOrderId: typeof orderId === 'string' && REVOLUT_ID.test(orderId) ? orderId : null,
  };
}

/**
 * Временна ли е грешката от клиента на Revolut (мрежа, таймаут, 409, 429, 5XX) —
 * заявката може да е изпълнена или още да се изпълнява (409: същият
 * Idempotency-Key още се обработва), затова не се третира като отказ. Изрично
 * 4XX (400, 404 в Sandbox за споровете, 401/403 ключ, 422) — отказ. Грешка без
 * статус (мрежа, база) — временна.
 */
export function isTransientRevolutError(error: unknown): boolean {
  const status = typeof error === 'object' && error !== null ? (error as { status?: unknown }).status : undefined;
  if (typeof status !== 'number') return true;
  return status === 409 || status === 429 || status >= 500;
}

/**
 * Refund поръчката отговаря ли на очакваната сума (частично връщане при отказ —
 * abuse-money-spec Б4): `type` (ако го има) е refund, `amount` (ако го има) =
 * очакваното, валутата (ако я има) — EUR. Липсващо поле не блокира.
 */
export function refundAmountMatches(order: unknown, expectedCents: number): boolean {
  const o = rec(order);
  if (typeof o.type === 'string' && o.type !== 'refund') return false;
  if (typeof o.amount === 'number' && o.amount !== expectedCents) return false;
  if (typeof o.currency === 'string' && o.currency !== 'EUR') return false;
  return true;
}
