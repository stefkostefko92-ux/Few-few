import { z } from 'zod';

/**
 * Клиентът на Revolut Merchant API (#31; спецификацията OpenAPI на Revolut, версия 2026-08-17): поръчка за
 * плащане (hosted checkout — Revolut събира данните на картата, ние не ги виждаме), четене на поръчката (кое е
 * вярно решава то, не webhook-ът) и регистрация на webhook. Тайният ключ — само в заглавието, само към базата
 * на средата; грешката носи само кода (тялото на отговора може да съдържа данни).
 */
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
});
export type OrdineRevolut = z.infer<typeof ordineSchema>;

const webhookSchema = z.object({
  id: z.string().min(1).max(100),
  signing_secret: z.string().min(8).max(200),
});

async function chiama(
  c: ClienteRevolut,
  method: 'GET' | 'POST',
  path: string,
  body?: unknown,
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
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      redirect: 'error',
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new ErroreRevolut('rete');
  }
  if (!res.ok) throw new ErroreRevolut(res.status);
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

/** Регистрира адреса за известията на поръчките; връща id-то и signing secret-а (пази се шифрован). */
export async function registraWebhook(
  c: ClienteRevolut,
  url: string,
): Promise<{ id: string; segreto: string }> {
  const w = leggi(
    webhookSchema,
    await chiama(c, 'POST', '/api/webhooks', {
      url,
      events: ['ORDER_COMPLETED', 'ORDER_CANCELLED', 'ORDER_FAILED'],
    }),
  );
  return { id: w.id, segreto: w.signing_secret };
}
