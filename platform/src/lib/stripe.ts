import "server-only";
import Stripe from "stripe";

// Клиент за Stripe (билинг). Ключовете идват от env; без STRIPE_SECRET_KEY
// билингът е no-op (както mailer работи без SMTP) — панелът се вдига и без
// конфигурация, а UI показва „билингът не е настроен".
//
// Пинваме API версията изрично: без пин ъпгрейд на акаунта мълчаливо променя
// формата на обектите/събитията. Версията е тази, за която е генериран този
// SDK (виж node_modules/stripe/esm/apiVersion — LatestApiVersion).
const API_VERSION = "2026-06-24.dahlia" as const;

let cached: Stripe | null = null;

export function stripeConfigured(): boolean {
  return !!process.env.STRIPE_SECRET_KEY;
}

// Върни клиент или null (ако не е конфигуриран). Извикващите проверяват за null.
export function getStripe(): Stripe | null {
  if (!stripeConfigured()) return null;
  if (!cached) {
    cached = new Stripe(process.env.STRIPE_SECRET_KEY as string, {
      apiVersion: API_VERSION,
      // Идентифицира трафика ни в Stripe логовете.
      appInfo: { name: "Carbon Stealth Platform", url: "https://platform.carbonstealth.eu" },
    });
  }
  return cached;
}

// Тайната за проверка на подписа на webhook-а (whsec_…).
export function webhookSecret(): string | null {
  return process.env.STRIPE_WEBHOOK_SECRET || null;
}

// ID на месечния премиум план (Price от Stripe). Цената е ВИНАГИ от Stripe,
// никога от клиента.
export function premiumPriceId(): string | null {
  return process.env.STRIPE_PRICE_ID || null;
}
