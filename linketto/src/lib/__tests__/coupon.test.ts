import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  discountedPriceCents,
  isCouponUsable,
  isValidPercent,
  normalizeCouponCode,
  MIN_CHARGE_CENTS,
} from '../coupon';

test('нормализира код: главни букви, само букви/цифри', () => {
  assert.equal(normalizeCouponCode(' summer-25! '), 'SUMMER25');
  assert.equal(normalizeCouponCode('промо'), ''); // кирилица отпада
  assert.equal(normalizeCouponCode('a'.repeat(50)).length, 24);
});

test('изчислява крайна цена след отстъпка (закръгляне в полза на продавача)', () => {
  assert.equal(discountedPriceCents(1000, 20), 800); // €10 − 20% = €8
  assert.equal(discountedPriceCents(999, 10), 900); // ceil(899.1) = 900
  // никога под минималния заряд на Stripe
  assert.equal(discountedPriceCents(100, 90), MIN_CHARGE_CENTS);
});

test('валидира процента (1..90)', () => {
  assert.equal(isValidPercent(1), true);
  assert.equal(isValidPercent(90), true);
  assert.equal(isValidPercent(0), false);
  assert.equal(isValidPercent(91), false);
  assert.equal(isValidPercent(10.5), false);
});

test('usable: активен, в срок, с оставащи ползвания', () => {
  const now = new Date('2026-07-09T00:00:00Z');
  const base = {
    active: true,
    percentOff: 10,
    maxRedemptions: null,
    timesRedeemed: 0,
    expiresAt: null,
  };
  assert.equal(isCouponUsable(base, now), true);
  assert.equal(isCouponUsable({ ...base, active: false }, now), false);
  assert.equal(
    isCouponUsable({ ...base, expiresAt: new Date('2026-07-08T00:00:00Z') }, now),
    false,
  );
  assert.equal(
    isCouponUsable(
      { ...base, expiresAt: new Date('2026-07-10T00:00:00Z') },
      now,
    ),
    true,
  );
  assert.equal(
    isCouponUsable({ ...base, maxRedemptions: 5, timesRedeemed: 5 }, now),
    false,
  );
  assert.equal(
    isCouponUsable({ ...base, maxRedemptions: 5, timesRedeemed: 4 }, now),
    true,
  );
});
