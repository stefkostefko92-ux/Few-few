import 'server-only';
import { revolutOrderBody } from '@/lib/revolut-core';

// Клиент към Revolut Merchant API (https://developer.revolut.com/docs/api/merchant.yaml,
// info.version 2026-08-17). Ключовете идват само от env; без REVOLUT_SECRET_KEY
// плащанията са изключени (fail closed). Средата по подразбиране е sandbox —
// продукция само с изрично REVOLUT_ENV=production.

const API_VERSION = '2026-08-17';

function baseUrl(): string {
  return process.env.REVOLUT_ENV === 'production'
    ? 'https://merchant.revolut.com'
    : 'https://sandbox-merchant.revolut.com';
}

export function revolutConfigured(): boolean {
  return Boolean(process.env.REVOLUT_SECRET_KEY);
}

async function call(
  path: string,
  init: { method: 'GET' | 'POST'; body?: unknown; idempotencyKey?: string },
): Promise<unknown> {
  const key = process.env.REVOLUT_SECRET_KEY;
  if (!key) throw new Error('revolut: not configured');
  const res = await fetch(`${baseUrl()}${path}`, {
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
  // Тялото на грешка не се логва (може да съдържа данни на клиента) — само статусът.
  if (!res.ok) throw new Error(`revolut ${init.method} ${path.split('/').slice(0, 3).join('/')}: ${res.status}`);
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
 * (`related_order_id`), която стига до краен статус до 2 дни — затова се
 * връща нейното id и състояние; нашият запис се приключва чак при `completed`.
 */
export async function refundRevolutOrder(input: {
  orderId: string;
  amountCents: number;
  idempotencyKey: string;
}): Promise<{ id: string; state: string }> {
  const refund = (await call(`/api/orders/${encodeURIComponent(input.orderId)}/refund`, {
    method: 'POST',
    body: { amount: input.amountCents, currency: 'EUR', description: 'Linketto refund' },
    idempotencyKey: input.idempotencyKey,
  })) as { id?: unknown; state?: unknown } | null;
  if (!refund || typeof refund.id !== 'string') throw new Error('revolut: refund without id');
  return { id: refund.id, state: typeof refund.state === 'string' ? refund.state : 'pending' };
}
