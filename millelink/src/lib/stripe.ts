import 'server-only';
import Stripe from 'stripe';

// Ключовете идват само от env (свързаният Stripe акаунт на собственика);
// нищо не се хардкодва в репото.
let client: Stripe | null = null;

export function getStripe(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  if (!client) {
    client = new Stripe(key);
  }
  return client;
}
