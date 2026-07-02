// Чиста логика за билинг — без Stripe SDK, без база, без Next, за да е лесно
// тествана. Тук живее ЕДИНСТВЕНОТО място, което решава „премиум ли е този
// статус": не се доверяваме на клиента, а мапваме статуса от Stripe.

// Точният текст на съгласието по чл. 16, б. „м" от Дир. 2011/83/ЕС (загуба на
// 14-дневното право на отказ при веднага започнала доставка на дигитална
// услуга). ЕДИНСТВЕН източник на истина: показва се в UI (BillingPanel) и се
// записва дословно в одит лога като доказателство при стартиране на Checkout.
// Пази този текст синхронизиран с показвания в UI.
export const CONSENT_CLAUSE_16M =
  "Съгласявам се услугата (премиум функциите) да започне веднага и потвърждавам, " +
  "че с това губя 14-дневното право на отказ за вече предоставената дигитална " +
  "услуга (чл. 16, б. „м“ от Дир. 2011/83/ЕС).";

// Статусите на абонамент в Stripe (subscription.status).
// https://docs.stripe.com/api/subscriptions/object#subscription_object-status
export type StripeSubStatus =
  | "trialing"
  | "active"
  | "past_due"
  | "canceled"
  | "unpaid"
  | "incomplete"
  | "incomplete_expired"
  | "paused";

// Нашето вътрешно огледало (enum BillingStatus в schema.prisma).
export type BillingStatus =
  | "NONE"
  | "TRIALING"
  | "ACTIVE"
  | "PAST_DUE"
  | "CANCELED"
  | "UNPAID"
  | "INCOMPLETE";

// Мапва Stripe статус → вътрешен BillingStatus.
export function mapStripeStatus(status: StripeSubStatus): BillingStatus {
  switch (status) {
    case "trialing":
      return "TRIALING";
    case "active":
      return "ACTIVE";
    case "past_due":
      return "PAST_DUE";
    case "unpaid":
      return "UNPAID";
    case "canceled":
      return "CANCELED";
    case "incomplete":
    case "paused":
      return "INCOMPLETE";
    case "incomplete_expired":
      return "CANCELED";
    default:
      return "NONE";
  }
}

// Дава ли този статус достъп до премиум? Само докато абонаментът реално върви:
// ACTIVE или TRIALING. PAST_DUE все още е в dunning — по избор бихме могли да
// дадем гратис, но по подразбиране сме консервативни (без плащане → без премиум).
//
// M1 — ЕДИНСТВЕНА точка на истина за premium gating: тази функция решава дали
// статусът дава достъп. Handler-ите (вкл. invoice.payment_failed) НЕ трябва да
// зашиват собствено `premium: true/false` независимо от статуса, защото Stripe
// не гарантира реда на доставка на събитията и двете политики биха се борили.
// Ако някога решим да даваме гратис по време на dunning — сменя се САМО тук
// (напр. добави `|| status === "PAST_DUE"`), на едно място.
export function isPremiumStatus(status: BillingStatus): boolean {
  return status === "ACTIVE" || status === "TRIALING";
}

// Удобна комбинация: Stripe статус → включен ли е премиум.
export function premiumFromStripe(status: StripeSubStatus): boolean {
  return isPremiumStatus(mapStripeStatus(status));
}

// Човешко описание на статуса (за UI, на български).
export function billingStatusLabel(status: BillingStatus): string {
  switch (status) {
    case "TRIALING":
      return "Пробен период";
    case "ACTIVE":
      return "Активен";
    case "PAST_DUE":
      return "Просрочено плащане";
    case "CANCELED":
      return "Прекратен";
    case "UNPAID":
      return "Неплатен";
    case "INCOMPLETE":
      return "Незавършен";
    case "NONE":
    default:
      return "Без абонамент";
  }
}
