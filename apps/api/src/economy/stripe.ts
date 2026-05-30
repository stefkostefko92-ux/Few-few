import Stripe from "stripe";
import { env } from "../env.js";

/**
 * Stripe client. Lazily constructed so the API boots without billing in dev;
 * `requireStripe()` throws a typed 503-able error when unconfigured.
 */
let client: Stripe | null = null;

export function stripeEnabled(): boolean {
  return Boolean(env.STRIPE_SECRET_KEY);
}

export function getStripe(): Stripe {
  if (!env.STRIPE_SECRET_KEY) {
    throw new Error("stripe_not_configured");
  }
  // Use the SDK's bundled pinned API version (account default) — avoids a
  // brittle version literal that drifts with the stripe package.
  client ??= new Stripe(env.STRIPE_SECRET_KEY, { typescript: true });
  return client;
}
