import 'server-only';
// The subscription's configuration: all four Stripe values and the first day of paid use, or billing is off (the free
// beta: every company works as before, without a trial or limits). Kept apart from the Stripe client so that the session
// reads it without loading the SDK.
import { env } from './env';
import { billingStarted } from './billing';

export interface BillingConfig {
  secretKey: string;
  webhookSecret: string;
  /** the monthly price of the owner's subscription (a recurring Price) and the product the packs of slots are sold as */
  priceMonthly: string;
  productSeats: string;
  automaticTax: boolean;
  trialDays: number;
}

export function billingConfig(now: Date = new Date()): BillingConfig | null {
  const e = env();
  if (!e.STRIPE_SECRET_KEY || !e.STRIPE_WEBHOOK_SECRET || !e.STRIPE_PRICE_MONTHLY || !e.STRIPE_PRODUCT_SEATS) return null;
  // the beta ends only on the day stated in the owners' e-mail: Stripe's values on the server before it, test ones
  // included, change nothing
  if (!billingStarted(e.BILLING_START, now)) return null;
  return {
    secretKey: e.STRIPE_SECRET_KEY, webhookSecret: e.STRIPE_WEBHOOK_SECRET, priceMonthly: e.STRIPE_PRICE_MONTHLY, productSeats: e.STRIPE_PRODUCT_SEATS,
    automaticTax: e.STRIPE_AUTOMATIC_TAX === 'true', trialDays: e.BILLING_TRIAL_DAYS,
  };
}

export const billingConfigured = (): boolean => billingConfig() !== null;
