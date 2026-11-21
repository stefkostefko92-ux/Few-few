import 'server-only';
import { revolutOrderBody } from '@/lib/revolut-core';
import { setting } from '@/lib/settings';

// Клиент към Revolut Merchant API (https://developer.revolut.com/docs/api/merchant.yaml,
// info.version 2026-08-17). Ключовете идват от админ панела (шифровани,
// lib/settings.ts), иначе от env; без ключ плащанията са изключени (fail
// closed). Средата по подразбиране е sandbox — продукция само изрично.

// Версията НЕ се сменя тук без diff на спецификациите. При 2026-08-17 всеки отказан
// refund идва като 400 (хвърля от `call`); клонът за 200 с отказано плащане
// (refundOutcome → 'failed', plan-order-core) е подготвен за 2026-09-22, където
// Revolut Pay връща 200 (merchant.yaml, refundOrder „Declined refunds“). Асинхронният
// отказ (refund поръчката, четена с GET, стига до „declined/failed“ — refundOrder
// „Asynchronous processing“) не зависи от тази разлика и се чете и днес.
const API_VERSION = '2026-08-17';

async function baseUrl(): Promise<string> {
  return (await setting('revolut.env')) === 'production'
    ? 'https://merchant.revolut.com'
    : 'https://sandbox-merchant.revolut.com';
}

export async function revolutReady(): Promise<boolean> {
  return Boolean(await setting('revolut.secretKey'));
}

async function call(
  path: string,
  init: { method: 'GET' | 'POST'; body?: unknown; idempotencyKey?: string },
): Promise<unknown> {
  const key = await setting('revolut.secretKey');
  if (!key) throw new Error('revolut: not configured');
  const res = await fetch(`${await baseUrl()}${path}`, {
    method: init.method,
    headers: {
      Authorization: `Bearer ${key}`,
      'Revolut-Api-Version': API_VERSION,
      Accept: 'application/json',
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...(init.idempotencyKey ? { 'Idempotency-Key': init.idempotencyKey } : {}),
    },
    body: init.body ? JSON.stringify(init.body) : undefined,
    signal: AbortSignal.timeout(15_000),
    cache: 'no-store',
  });
  // Тялото на грешка не се логва (може да съдържа данни на клиента) — само статусът
  // (и в `status`, за да се различи временна грешка от отказ — isTransientRevolutError).
  if (!res.ok) {
    throw Object.assign(new Error(`revolut ${init.method} ${path.split('/').slice(0, 3).join('/')}: ${res.status}`), {
      status: res.status,
    });
  }
  return res.status === 204 ? null : res.json();
}

/** P2: нова поръчка; връща id и адреса на hosted checkout. */
export async function createRevolutOrder(
  input: Parameters<typeof revolutOrderBody>[0],
): Promise<{ id: string; checkoutUrl: string }> {
  const order = (await call('/api/orders', {
    method: 'POST',
    body: revolutOrderBody(input),
  })) as { id?: unknown; checkout_url?: unknown };
  if (typeof order.id !== 'string' || typeof order.checkout_url !== 'string') {
    throw new Error('revolut: order without id/checkout_url');
  }
  return { id: order.id, checkoutUrl: order.checkout_url };
}

/** P4: истината за поръчката (уебхукът носи само id). */
export function getRevolutOrder(orderId: string): Promise<unknown> {
  return call(`/api/orders/${encodeURIComponent(orderId)}`, { method: 'GET' });
}

/**
 * P10: пълен refund; Idempotency-Key (≤50 знака) пази от двоен refund при
 * повторен клик. Revolut създава НОВА поръчка `type: refund`
 * (`related_order_id`), която стига до краен статус до 2 дни — връща се самата
 * refund поръчка; докъде е, решава ядрото (refundOutcome: и `payments[].state`,
 * защото отказът при Revolut Pay от версия 2026-09-22 идва като 200, F1).
 * Отказ с 400 (карта; всеки отказ преди 2026-09-22) хвърля от `call`.
 */
export function refundRevolutOrder(input: {
  orderId: string;
  amountCents: number;
  idempotencyKey: string;
}): Promise<unknown> {
  return call(`/api/orders/${encodeURIComponent(input.orderId)}/refund`, {
    method: 'POST',
    body: { amount: input.amountCents, currency: 'EUR', description: 'Linketto refund' },
    idempotencyKey: input.idempotencyKey,
  });
}

/**
 * F2: спорът, както го казва Revolut сега (уебхукът носи само id). Само в
 * Production — в Sandbox отговорът е 404 (merchant.yaml, retrieveDispute).
 */
export function getRevolutDispute(disputeId: string): Promise<unknown> {
  return call(`/api/disputes/${encodeURIComponent(disputeId)}`, { method: 'GET' });
}

/** Проверка на ключа от админа — най-леката четяща заявка; отговорът не се показва. */
export async function revolutPing(): Promise<{ ok: boolean; status?: number }> {
  try {
    await call('/api/orders?limit=1', { method: 'GET' });
    return { ok: true };
  } catch (error) {
    return { ok: false, status: (error as { status?: number }).status };
  }
}

// DEPLOY §3: събитията на уебхука. Спорове — само където Revolut ги приема
// (в Sandbox `/api/disputes` го няма → 400/422 → без тях, като в rilievi).
const ORDER_EVENTS = [
  'ORDER_COMPLETED',
  'ORDER_AUTHORISED',
  'ORDER_FAILED',
  'ORDER_CANCELLED',
  'ORDER_PAYMENT_DECLINED',
  'ORDER_PAYMENT_FAILED',
];
const DISPUTE_EVENTS = ['DISPUTE_ACTION_REQUIRED', 'DISPUTE_UNDER_REVIEW', 'DISPUTE_WON', 'DISPUTE_LOST'];

/** Тайна на уебхука от отговор на Revolut — низ без интервали (схемата няма шаблон, `wsk_` е само в примера). */
function signingSecret(value: unknown): string | null {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{8,200}$/.test(value) ? value : null;
}

/**
 * Регистрира уебхука от админ панела (POST /api/webhooks) и връща тайната за
 * подписа. `GET /api/webhooks` връща `{ webhooks: [Webhook-v2] }` (merchant.yaml
 * 2026-08-17); ако за същия адрес вече има уебхук — без дубликат: тайната му
 * (`signing_secret` е задължително поле на Webhook-v2) или `exists`, ако я няма.
 * Непозната форма на списъка → `failed` (без POST на сляпо).
 */
export async function registerRevolutWebhook(
  url: string,
): Promise<{ secret: string; disputes: boolean; reused: boolean } | { error: 'exists' | 'failed'; status?: number }> {
  try {
    const list = await call('/api/webhooks', { method: 'GET' });
    const hooks = (list as { webhooks?: unknown } | null)?.webhooks;
    if (!Array.isArray(hooks)) return { error: 'failed' };
    const match = hooks.find((hook) => (hook as { url?: unknown } | null)?.url === url) as
      | { signing_secret?: unknown; events?: unknown }
      | undefined;
    if (match) {
      const secret = signingSecret(match.signing_secret);
      const disputes = Array.isArray(match.events) && match.events.includes('DISPUTE_LOST');
      return secret ? { secret, disputes, reused: true } : { error: 'exists' };
    }
    let created: unknown;
    let disputes = true;
    try {
      created = await call('/api/webhooks', { method: 'POST', body: { url, events: [...ORDER_EVENTS, ...DISPUTE_EVENTS] } });
    } catch (error) {
      const status = (error as { status?: number }).status;
      if (status !== 400 && status !== 422) throw error;
      disputes = false;
      created = await call('/api/webhooks', { method: 'POST', body: { url, events: ORDER_EVENTS } });
    }
    const secret = signingSecret((created as { signing_secret?: unknown } | null)?.signing_secret);
    return secret ? { secret, disputes, reused: false } : { error: 'failed' };
  } catch (error) {
    return { error: 'failed', status: (error as { status?: number }).status };
  }
}
