import 'server-only';
import Stripe from 'stripe';

// Ключовете идват само от env (свързаният Stripe акаунт на собственика);
// нищо не се хардкодва в репото.
let client: Stripe | null = null;

export function getStripe(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  if (!client) {
    // Пинваме API версията — ъпгрейд на акаунта да не сменя мълчаливо
    // формата на webhook обектите.
    client = new Stripe(key, { apiVersion: '2025-02-24.acacia' });
  }
  return client;
}
