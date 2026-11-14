// Планове и цени. Сумите са в евроценти и се материализират в Stripe
// през scripts/setup-stripe.mjs (lookup_keys — сървърът никога не вярва на
// клиентски суми). Цените са конкурентно позиционирани за БГ пазара
// (виж docs/PRICING.md): под Microinvest/Mistral за малък магазин.

export const GRACE_DAYS = 14; // офлайн/просрочие гратис за абонаменти

export const PLANS = {
  monthly: {
    lookupKey: "cspos_monthly",
    mode: "subscription",
    interval: "month",
    label: "Месечен",
    unitAmount: 1900, // 19 € / каса / месец
  },
  yearly: {
    lookupKey: "cspos_yearly",
    mode: "subscription",
    interval: "year",
    label: "Годишен",
    unitAmount: 19000, // 190 € / каса / година (~2 месеца безплатни)
  },
  lifetime: {
    lookupKey: "cspos_lifetime",
    mode: "payment",
    interval: null,
    label: "Доживотен",
    unitAmount: 44900, // 449 € / каса, еднократно — С включени обновявания
    // (Microinvest: 298 € само версията към датата + ~52 € на всяка актуализация)
  },
};

export const MAX_SEATS = 20;

export function isValidPlan(plan) {
  return Object.prototype.hasOwnProperty.call(PLANS, plan);
}
