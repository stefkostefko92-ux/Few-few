import { ApiError } from "../../lib/api";

/**
 * i18n ключ за грешка от checkout. Собствен текст за познатите кодове — вместо
 * общото „Грешка“ (напр. абонат, който натиска VIP, трябва да разбере защо и
 * къде да управлява абонамента си).
 */
export function checkoutErrorKey(err: unknown): string {
  if (!(err instanceof ApiError)) return "shop.error";
  switch (err.code) {
    case "stripe_unavailable":
      return "shop.unavailable";
    case "already_subscribed":
      return "shop.sub.alreadySubscribed";
    case "product_unavailable":
    case "unknown_sku":
      return "shop.productUnavailable";
    default:
      return "shop.error";
  }
}
