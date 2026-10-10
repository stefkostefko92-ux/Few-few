// Чисти правила за ДДС слоя (без server-only → тестват се). Виж TAX.md.

type Env = Record<string, string | undefined>;

/** Stripe Tax е включен чак след Dashboard setup + регистрации (DEPLOY §0). */
export function stripeTaxEnabled(env: Env = process.env): boolean {
  return env.STRIPE_TAX_ENABLED === '1';
}

/**
 * Дали магазинът може да продава. Общите условия и разписката твърдят, че
 * платформата начислява и отчита ДДС (чл. 9а) — не продаваме „с ДДС“, без да
 * го начисляваме. Test mode (sk_test_…) и включен Stripe Tax — да; live ключ
 * без STRIPE_TAX_ENABLED=1 — НЕ (fail closed).
 */
export function shopSalesAllowed(env: Env = process.env): boolean {
  if (stripeTaxEnabled(env)) return true;
  return (env.STRIPE_SECRET_KEY ?? '').startsWith('sk_test_');
}
