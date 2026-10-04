import 'server-only';
// Stripe for the subscription: the client, the monthly price read from Stripe (amount, currency, interval; cached for
// ten minutes) and the packs' prices made from it. The secret key stays in the server's environment; nothing of Stripe
// reaches the browser but the Checkout and portal links.
import Stripe from 'stripe';
import type { SeatPack } from '@prisma/client';
import { PACK, packAmount } from './billing';
import { billingConfig } from './billing-config';

let client: { key: string; stripe: Stripe } | null = null;

/** The Stripe client (null: billing off). */
export function stripeClient(): Stripe | null {
  const c = billingConfig();
  if (!c) return null;
  if (!client || client.key !== c.secretKey) {
    client = { key: c.secretKey, stripe: new Stripe(c.secretKey, { maxNetworkRetries: 2, timeout: 20_000, appInfo: { name: 'LiftPilot' } }) };
  }
  return client.stripe;
}

/** The monthly price as the screens and the packs need it. */
export interface MonthlyPrice {
  cents: number;
  currency: string;
  interval: Stripe.Price.Recurring.Interval;
  intervalCount: number;
  taxBehavior: Stripe.Price.TaxBehavior | null;
}

let priceCache: { id: string; at: number; price: MonthlyPrice } | null = null;
const PRICE_TTL_MS = 10 * 60 * 1000;

/** The monthly price from Stripe (null: billing off, or the Price is not a recurring one with a fixed amount). */
export async function monthlyPrice(): Promise<MonthlyPrice | null> {
  const c = billingConfig(), s = stripeClient();
  if (!c || !s) return null;
  if (priceCache && priceCache.id === c.priceMonthly && Date.now() - priceCache.at < PRICE_TTL_MS) return priceCache.price;
  const p = await s.prices.retrieve(c.priceMonthly);
  if (!p.active || p.unit_amount === null || !p.recurring) return null;
  const price: MonthlyPrice = { cents: p.unit_amount, currency: p.currency, interval: p.recurring.interval, intervalCount: p.recurring.interval_count, taxBehavior: p.tax_behavior };
  priceCache = { id: c.priceMonthly, at: Date.now(), price };
  return price;
}

/** The pack's price as a line of the subscription, made from the monthly price (null: no pack). */
export function packPriceData(pack: SeatPack, m: MonthlyPrice, productSeats: string) {
  if (!PACK[pack].pct) return null;
  return {
    currency: m.currency, product: productSeats, unit_amount: packAmount(m.cents, pack),
    recurring: { interval: m.interval, interval_count: m.intervalCount },
    ...(m.taxBehavior && m.taxBehavior !== 'unspecified' ? { tax_behavior: m.taxBehavior } : {}),
  };
}

/** What of an error may go to the log: a Stripe error's kind and code, another error's name and code — never a
 *  message (it may carry the customer's data). */
export function stripeErrorOf(err: unknown): { type: string; code?: string; status?: number } {
  if (err instanceof Stripe.errors.StripeError) return { type: err.type, code: err.code, status: err.statusCode };
  if (err instanceof Error) {
    const code = 'code' in err && typeof err.code === 'string' ? err.code : undefined;
    return { type: err.name, ...(code ? { code } : {}) };
  }
  return { type: 'unknown' };
}

/** The monthly price this subscription pays for the owner (its line that is not the slots'), from Stripe; null: none or
 *  not readable. The packs of a live subscription are priced on it, not on today's Price. */
export async function subscriptionPrice(subscriptionId: string, productSeats: string): Promise<MonthlyPrice | null> {
  const s = stripeClient();
  if (!s) return null;
  const sub = await s.subscriptions.retrieve(subscriptionId);
  const owner = sub.items.data.find((i) => (typeof i.price.product === 'string' ? i.price.product : i.price.product.id) !== productSeats);
  return owner ? priceOfItem(owner.price) : null;
}

/** The monthly price of a subscription's own line for the owner (the packs are priced on what this company pays). */
export function priceOfItem(p: Stripe.Price): MonthlyPrice | null {
  if (p.unit_amount === null || !p.recurring) return null;
  return { cents: p.unit_amount, currency: p.currency, interval: p.recurring.interval, intervalCount: p.recurring.interval_count, taxBehavior: p.tax_behavior };
}
