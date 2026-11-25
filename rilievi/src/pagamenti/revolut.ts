import { z } from 'zod';

/**
 * Клиентът на Revolut Merchant API (#31; спецификацията OpenAPI на Revolut, версия 2026-08-17): поръчка за
 * плащане (hosted checkout — Revolut събира данните на картата, ние не ги виждаме), четене на поръчката (кое е
 * вярно решава то, не webhook-ът), връщане върху поръчка (`POST /api/orders/{id}/refund` — нова поръчка
 * `type: refund`, до 2 дни до крайното си състояние), четене на спор (`GET /api/disputes/{id}` — само в
 * продукция) и регистрация на webhook. Тайният ключ — само в заглавието, само към базата на средата; грешката
 * носи само кода (тялото на отговора може да съдържа данни).
 */
// 2026-09-22 не е въведена: единствената ѝ разлика е отказът на връщане с Revolut Pay (200 вместо 400) —
// `esitoOrdineRimborso` вече чете и двата отговора.
export const VERSIONE_API = '2026-08-17';

export const BASI = {
  SANDBOX: 'https://sandbox-merchant.revolut.com',
  PRODUZIONE: 'https://merchant.revolut.com',
} as const;

/** Страницата за плащане — само на Revolut (CSP form-action и проверката на `checkout_url`). */
export const ORIGINI_CHECKOUT = [
  'https://checkout.revolut.com',
  'https://sandbox-checkout.revolut.com',
];

export interface ClienteRevolut {
  base: string;
  chiave: string;
}

export class ErroreRevolut extends Error {
  constructor(readonly stato: number | 'rete' | 'risposta') {
    super(`revolut: ${stato}`);
  }
}

const STATI = ['pending', 'processing', 'authorised', 'completed', 'cancelled', 'failed'] as const;
export type StatoOrdine = (typeof STATI)[number];

const ordineSchema = z.object({
  id: z.string().min(1).max(100),
  state: z.enum(STATI),
  amount: z.number().int().nonnegative(),
  currency: z.string().length(3),
  checkout_url: z.string().url().optional(),
  merchant_order_data: z.object({ reference: z.string().max(100).optional() }).optional(),
  /** `payment` или `refund`; поръчката за връщане сочи върнатата с `related_order_id`. */
  type: z.string().max(20).optional(),
  related_order_id: z.string().max(100).optional(),
  /**
   * Плащанията на поръчката (Payment-v3) — само състоянието и причината за отказ. Непредвидена форма не спира
   * четенето на поръчката (платената остава четима): тогава плащания няма и връщането остава отворено.
   */
  payments: z
    .array(z.object({ state: z.string().max(40), decline_reason: z.string().max(100).optional() }))
    .max(100)
    .optional()
    .catch(undefined),
});
export type OrdineRevolut = z.infer<typeof ordineSchema>;

/** Плащане на връщане, което Revolut е отказал (Payment-v3 `state`). */
const PAGAMENTO_RIFIUTATO = ['declined', 'failed'];
/** Причината за отказ се пази като код само ако е обикновен код (`suspected_fraud`), иначе — състоянието. */
const MOTIVO = /^[a-z0-9_]{1,30}$/;

/**
 * Какво казва поръчката за връщане: `completed` — върнато; `failed`/`cancelled` — отказано; поръчка, чиито плащания
 * са ВСИЧКИ `declined`/`failed`, — отказано, макар самата поръчка да стои `processing`. При нашата версия
 * (`VERSIONE_API`, 2026-08-17) синхронният отказ е 400, а такава поръчка идва при четене по-късно (webhook,
 * поддръжката); 200 с отказано плащане при самото нареждане (Revolut Pay, спецификацията 2026-09-22, „Declined
 * refunds“) е подготовка за 2026-09-22. Всичко друго — още тече: затворено връщане, което Revolut още може да
 * плати, би се наредило втори път.
 */
export function esitoOrdineRimborso(
  r: OrdineRevolut,
): 'completato' | 'inCorso' | { rifiutato: string } {
  if (r.state === 'completed') return 'completato';
  if (r.state === 'failed' || r.state === 'cancelled') return { rifiutato: r.state };
  const pagamenti = r.payments ?? [];
  if (pagamenti.length === 0 || !pagamenti.every((p) => PAGAMENTO_RIFIUTATO.includes(p.state)))
    return 'inCorso';
  const ultimo = pagamenti[pagamenti.length - 1]!;
  const motivo = ultimo.decline_reason;
  return { rifiutato: motivo !== undefined && MOTIVO.test(motivo) ? motivo : ultimo.state };
}

const webhookSchema = z.object({
  id: z.string().min(1).max(100),
  signing_secret: z.string().min(8).max(200),
});

async function chiama(
  c: ClienteRevolut,
  method: 'GET' | 'POST' | 'DELETE',
  path: string,
  body?: unknown,
  intestazioni: Record<string, string> = {},
): Promise<unknown> {
  let res: Response;
  try {
    res = await fetch(`${c.base}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${c.chiave}`,
        'Revolut-Api-Version': VERSIONE_API,
        Accept: 'application/json',
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...intestazioni,
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      redirect: 'error',
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new ErroreRevolut('rete');
  }
  if (!res.ok) throw new ErroreRevolut(res.status);
  if (res.status === 204) return null;
  try {
    return (await res.json()) as unknown;
  } catch {
    throw new ErroreRevolut('risposta');
  }
}

function leggi<T>(schema: z.ZodType<T>, raw: unknown): T {
  const parsed = schema.safeParse(raw);
  if (!parsed.success) throw new ErroreRevolut('risposta');
  return parsed.data;
}

/** Нова поръчка за `amount` цента в евро; `reference` — нашето плащане (за сверка в Revolut). */
export async function creaOrdine(
  c: ClienteRevolut,
  dati: { amount: number; description: string; reference: string; redirectUrl: string },
): Promise<OrdineRevolut> {
  const ordine = leggi(
    ordineSchema,
    await chiama(c, 'POST', '/api/orders', {
      amount: dati.amount,
      currency: 'EUR',
      description: dati.description,
      merchant_order_data: { reference: dati.reference },
      redirect_url: dati.redirectUrl,
      // Неплатена поръчка изтича след час — старият линк не плаща стария план.
      expire_pending_after: 'PT1H',
    }),
  );
  if (ordine.amount !== dati.amount || ordine.currency !== 'EUR' || !ordine.checkout_url)
    throw new ErroreRevolut('risposta');
  return ordine;
}

export function leggiOrdine(c: ClienteRevolut, id: string): Promise<OrdineRevolut> {
  if (!/^[A-Za-z0-9-]{1,100}$/.test(id)) return Promise.reject(new ErroreRevolut('risposta'));
  return chiama(c, 'GET', `/api/orders/${encodeURIComponent(id)}`).then((r) =>
    leggi(ordineSchema, r),
  );
}

const ID = /^[A-Za-z0-9-]{1,100}$/;

/**
 * Връщане на `amount` цента върху платена поръчка. `chiave` е Idempotency-Key (до 50 знака — нашият id на
 * връщането): повторено нареждане със същия ключ не връща втори път. Отговорът е новата поръчка за връщане;
 * крайното ѝ състояние идва до 2 дни (webhook или четене).
 */
export async function rimborsaOrdine(
  c: ClienteRevolut,
  orderId: string,
  dati: { amount: number; reference: string; description: string; chiave: string },
): Promise<OrdineRevolut> {
  if (!ID.test(orderId) || !/^[A-Za-z0-9_-]{1,50}$/.test(dati.chiave))
    throw new ErroreRevolut('risposta');
  const rimborso = leggi(
    ordineSchema,
    await chiama(
      c,
      'POST',
      `/api/orders/${encodeURIComponent(orderId)}/refund`,
      {
        amount: dati.amount,
        currency: 'EUR',
        merchant_order_data: { reference: dati.reference },
        description: dati.description,
      },
      { 'Idempotency-Key': dati.chiave },
    ),
  );
  if (
    rimborso.amount !== dati.amount ||
    rimborso.currency !== 'EUR' ||
    rimborso.id === orderId ||
    (rimborso.type !== undefined && rimborso.type !== 'refund') ||
    (rimborso.related_order_id !== undefined && rimborso.related_order_id !== orderId)
  )
    throw new ErroreRevolut('risposta');
  return rimborso;
}

const STATI_DISPUTA = ['needs_response', 'under_review', 'won', 'lost'] as const;
const disputaSchema = z
  .object({
    id: z.string().min(1).max(100),
    state: z.enum(STATI_DISPUTA),
    substate: z.string().max(40).optional(),
    created_at: z.string().max(40).optional(),
    response_due_date: z.string().max(40).optional(),
    reason_code: z.string().max(40).optional(),
    reason_description: z.string().max(500).optional(),
    amount: z.number().int().nonnegative(),
    currency: z.string().length(3),
    payment: z
      .object({ order_id: z.string().max(100).optional() })
      .passthrough()
      .optional(),
  })
  .passthrough();
export type DisputaRevolut = z.infer<typeof disputaSchema>;

/** Спорът (chargeback), както го казва Revolut сега. */
export function leggiDisputa(c: ClienteRevolut, id: string): Promise<DisputaRevolut> {
  if (!ID.test(id)) return Promise.reject(new ErroreRevolut('risposta'));
  return chiama(c, 'GET', `/api/disputes/${encodeURIComponent(id)}`).then((r) =>
    leggi(disputaSchema, r),
  );
}

/**
 * Поръчките и връщанията (те са поръчки). `ORDER_PAYMENT_DECLINED`/`_FAILED`: отказаното плащане на връщане идва
 * веднага по webhook-а, а не чак с часовата поддръжка (поръчката му може да остане `processing`).
 */
export const EVENTI_ORDINE = [
  'ORDER_COMPLETED',
  'ORDER_CANCELLED',
  'ORDER_FAILED',
  'ORDER_PAYMENT_DECLINED',
  'ORDER_PAYMENT_FAILED',
] as const;
export const EVENTI_DISPUTA = [
  'DISPUTE_ACTION_REQUIRED',
  'DISPUTE_UNDER_REVIEW',
  'DISPUTE_WON',
  'DISPUTE_LOST',
] as const;

/**
 * Регистрира адреса за известията — поръчките (и връщанията: те са поръчки) и, с `conDispute`, споровете;
 * връща id-то и signing secret-а (пази се шифрован).
 */
export async function registraWebhook(
  c: ClienteRevolut,
  url: string,
  conDispute = true,
): Promise<{ id: string; segreto: string }> {
  const w = leggi(
    webhookSchema,
    await chiama(c, 'POST', '/api/webhooks', {
      url,
      events: conDispute ? [...EVENTI_ORDINE, ...EVENTI_DISPUTA] : [...EVENTI_ORDINE],
    }),
  );
  return { id: w.id, segreto: w.signing_secret };
}

/** Маха регистриран webhook (преди нов или при смяна на ключа/средата — Revolut пази най-много 10). */
export async function eliminaWebhook(c: ClienteRevolut, id: string): Promise<void> {
  if (!/^[A-Za-z0-9-]{1,100}$/.test(id)) return;
  await chiama(c, 'DELETE', `/api/webhooks/${encodeURIComponent(id)}`);
}
