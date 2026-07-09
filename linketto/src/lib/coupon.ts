// Промо кодове за магазина. Чистата логика (валидация, изчисление на
// отстъпката) е тук — тества се без БД. Прилагането е в actions/shop.ts,
// а сумата ВИНАГИ се преизчислява на сървъра (на клиента не се вярва).

export const COUPON_MIN_PERCENT = 1;
export const COUPON_MAX_PERCENT = 90;

// Stripe не приема заряд под ~€0.50; пазим таван на реалната крайна цена.
export const MIN_CHARGE_CENTS = 50;

/** Нормализира въведен код: главни букви, само букви/цифри, до 24 знака. */
export function normalizeCouponCode(raw: string): string {
  return raw
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 24);
}

export interface CouponLike {
  active: boolean;
  percentOff: number;
  maxRedemptions: number | null;
  timesRedeemed: number;
  expiresAt: Date | null;
}

/** Валиден ли е кодът в момента `now` (активен, в срок, с оставащи ползвания). */
export function isCouponUsable(coupon: CouponLike, now: Date): boolean {
  if (!coupon.active) return false;
  if (coupon.expiresAt && coupon.expiresAt.getTime() <= now.getTime()) {
    return false;
  }
  if (
    coupon.maxRedemptions !== null &&
    coupon.timesRedeemed >= coupon.maxRedemptions
  ) {
    return false;
  }
  return true;
}

/**
 * Крайна цена след отстъпката (евроцентове), закръглена нагоре в полза на
 * продавача, но никога под минималния заряд на Stripe.
 */
export function discountedPriceCents(
  priceCents: number,
  percentOff: number,
): number {
  const pct = Math.min(
    COUPON_MAX_PERCENT,
    Math.max(COUPON_MIN_PERCENT, Math.round(percentOff)),
  );
  const discounted = Math.ceil((priceCents * (100 - pct)) / 100);
  return Math.max(MIN_CHARGE_CENTS, discounted);
}

/** Валиден ли е процентът на отстъпката. */
export function isValidPercent(percent: number): boolean {
  return (
    Number.isInteger(percent) &&
    percent >= COUPON_MIN_PERCENT &&
    percent <= COUPON_MAX_PERCENT
  );
}
