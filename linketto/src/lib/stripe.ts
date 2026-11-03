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

// Stripe Tax (automatic_tax) — включва се чак след като Stripe Tax е
// активиран в Dashboard-а И данъчните регистрации (OSS/BG) са въведени там;
// иначе checkout заявките се провалят. Без флага магазинът работи, но с
// ДДС = 0 (същите пътища на парите). Виж TAX.md и DEPLOY.md §0.
export function stripeTaxEnabled(): boolean {
  return process.env.STRIPE_TAX_ENABLED === '1';
}
