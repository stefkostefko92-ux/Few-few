// Чиста логика за билинг — без Stripe SDK, без база, без Next, за да е лесно
// тествана. Тук живее ЕДИНСТВЕНОТО място, което решава „премиум ли е този
// статус": не се доверяваме на клиента, а мапваме статуса от Stripe.

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
