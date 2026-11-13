import { revolutSettings } from '../admin/integrations.js';
import { REVOLUT_API_VERSION, REVOLUT_BASE_URL, scrub } from '../admin/integration-checks.js';
import { errorMessage } from '../logger.js';

/**
 * Клиентът към Revolut Merchant API (плащане на план с карта — SPEC 49). Договорът е по официалната
 * спецификация `merchant.yaml`, версия 2026-08-17 (сверено 13.11.2026): суми в минимални единици (цели),
 * `merchant_order_data.reference` — нашето основание, `checkout_url` — страницата за плащане, състоянията
 * pending · processing · authorised · completed · cancelled · failed. Поле „платено на“ няма — моментът е
 * `updated_at` на плащането в `payments[]` със състояние completed/captured. Създаването НЕ приема
 * Idempotency-Key, затова при таймаут поръчката се търси по основанието, не се създава втора.
 * Ключът е от мастър настройките; никога не стига до лога или до изгледа.
 */
export type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

export class RevolutError extends Error {
  constructor(readonly code: 'notConfigured' | 'rejected' | 'network' | 'invalidResponse') {
    super(code);
  }
}

export interface RevolutOrder {
  id: string;
  /** С малки букви, както е в API-то: 'completed' е единственото, което дава права. */
  state: string;
  amount: number;
  outstandingAmount: number | null;
  currency: string;
  checkoutUrl: string | null;
  reference: string | null;
  /** Кога е захванато плащането (за BT-7), ако поръчката е платена. */
  paidAt: Date | null;
}

/** Колко живее неплатена поръчка при Revolut — после я проваля сама (ORDER_FAILED). */
export const REVOLUT_PENDING_TTL = 'PT24H';

const ORDER_ID = /^[A-Za-z0-9-]{8,80}$/;

async function call(
  method: 'GET' | 'POST',
  path: string,
  body: unknown,
  fetchImpl: FetchLike,
): Promise<unknown> {
  const settings = await revolutSettings();
  const key = settings.secretKey;
  if (!key) throw new RevolutError('notConfigured');
  let response: Response;
  try {
    response = await fetchImpl(`${REVOLUT_BASE_URL[settings.environment]}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${key}`,
        'Revolut-Api-Version': REVOLUT_API_VERSION,
        Accept: 'application/json',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(15_000),
    });
  } catch (error) {
    throw Object.assign(new RevolutError('network'), {
      detail: scrub(errorMessage(error), [key]),
    });
  }
  if (!response.ok) {
    await response.body?.cancel();
    throw new RevolutError('rejected');
  }
  const json: unknown = await response.json().catch(() => null);
  if (typeof json !== 'object' || json === null) throw new RevolutError('invalidResponse');
  return json;
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function dateOf(value: unknown): Date | null {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value)) ? new Date(value) : null;
}

/** Моментът на захващане: най-късното завършено плащане в `payments[]`. */
function paidAtOf(payments: unknown): Date | null {
  if (!Array.isArray(payments)) return null;
  let latest: Date | null = null;
  for (const item of payments) {
    const payment = record(item);
    const state = typeof payment?.['state'] === 'string' ? payment['state'].toLowerCase() : '';
    if (state !== 'completed' && state !== 'captured') continue;
    const at = dateOf(payment?.['updated_at']) ?? dateOf(payment?.['created_at']);
    if (at && (!latest || at > latest)) latest = at;
  }
  return latest;
}

export function parseRevolutOrder(value: unknown): RevolutOrder {
  const json = record(value);
  const id = json?.['id'];
  const state = json?.['state'];
  const amount = json?.['amount'];
  if (
    !json ||
    typeof id !== 'string' ||
    !ORDER_ID.test(id) ||
    typeof state !== 'string' ||
    typeof amount !== 'number' ||
    !Number.isSafeInteger(amount)
  ) {
    throw new RevolutError('invalidResponse');
  }
  const reference = record(json['merchant_order_data'])?.['reference'];
  const outstanding = json['outstanding_amount'];
  const currency = json['currency'];
  const checkout = json['checkout_url'];
  return {
    id,
    state: state.toLowerCase(),
    amount,
    outstandingAmount: typeof outstanding === 'number' ? outstanding : null,
    currency: typeof currency === 'string' ? currency.toUpperCase() : '',
    checkoutUrl: typeof checkout === 'string' && checkout.startsWith('https://') ? checkout : null,
    reference: typeof reference === 'string' ? reference : null,
    paidAt: paidAtOf(json['payments']),
  };
}

/** Нова поръчка за плащане с карта: сумата е от нашия запис (центове), основанието — нашето. */
export async function createRevolutOrder(
  input: { amountCents: number; reference: string; description: string; redirectUrl: string },
  fetchImpl: FetchLike = fetch,
): Promise<RevolutOrder> {
  const json = await call(
    'POST',
    '/api/orders',
    {
      amount: input.amountCents,
      currency: 'EUR',
      description: input.description,
      capture_mode: 'automatic',
      expire_pending_after: REVOLUT_PENDING_TTL,
      merchant_order_data: { reference: input.reference },
      redirect_url: input.redirectUrl,
    },
    fetchImpl,
  );
  return parseRevolutOrder(json);
}

/** Повторното четене преди активиране — на webhook-а и на пренасочването не се вярва. */
export async function retrieveRevolutOrder(
  orderId: string,
  fetchImpl: FetchLike = fetch,
): Promise<RevolutOrder> {
  if (!ORDER_ID.test(orderId)) throw new RevolutError('invalidResponse');
  return parseRevolutOrder(await call('GET', `/api/orders/${orderId}`, null, fetchImpl));
}

/**
 * Поръчката с нашето основание (възстановяване след таймаут при създаването). Списъкът носи съкратен
 * запис — пълният се чете наново по id.
 */
export async function findRevolutOrderByReference(
  reference: string,
  fetchImpl: FetchLike = fetch,
): Promise<RevolutOrder | null> {
  if (!/^FKT-[A-Z0-9]{8}$/.test(reference)) throw new RevolutError('invalidResponse');
  const raw = await call(
    'GET',
    `/api/orders?merchant_order_data_reference=${encodeURIComponent(reference)}&limit=5`,
    null,
    fetchImpl,
  );
  // Спецификацията (Orders-v2) е {orders: [...]}; по-старите версии връщат масив — приема се и той.
  const orders = Array.isArray(raw) ? raw : record(raw)?.['orders'];
  if (!Array.isArray(orders)) throw new RevolutError('invalidResponse');
  const first = record(orders[0]);
  const id = first?.['id'];
  if (typeof id !== 'string') return null;
  return retrieveRevolutOrder(id, fetchImpl);
}
