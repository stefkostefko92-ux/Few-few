import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  commissionCents,
  MIN_PRODUCT_PRICE_EUR,
  PLANS,
  planFor,
  processingFeeCents,
  totalFeeCents,
  intervalPriceCents,
  effectiveMonthlyCents,
  stripePriceEnvFor,
} from '../plans';

test('комисиони: 8% Free и 4% Pro (под Linktree), 0% само горните два', () => {
  assert.equal(PLANS.FREE.feePercent, 8);
  assert.equal(PLANS.PRO.feePercent, 4);
  assert.equal(PLANS.BUSINESS.feePercent, 0);
  assert.equal(PLANS.FOUNDER.feePercent, 0);
});

test('commissionCents смята коректно и закръгля надолу', () => {
  assert.equal(commissionCents(10000, 'FREE'), 800);
  assert.equal(commissionCents(999, 'FREE'), 79);
  assert.equal(commissionCents(10000, 'PRO'), 400);
  assert.equal(commissionCents(10000, 'BUSINESS'), 0);
  assert.equal(commissionCents(0, 'FREE'), 0);
  assert.equal(commissionCents(-500, 'FREE'), 0);
});

test('такса обработка: 1.9% + €0.30, закръглена нагоре', () => {
  assert.equal(processingFeeCents(10000), 220); // 190 + 30
  assert.equal(processingFeeCents(300), 36); // ceil(5.7)=6 + 30
  assert.equal(processingFeeCents(0), 0);
});

test('пълната такса покрива Stripe (~1.5% + €0.25) на всички планове', () => {
  for (const plan of ['FREE', 'PRO', 'BUSINESS', 'FOUNDER'] as const) {
    for (const amount of [MIN_PRODUCT_PRICE_EUR * 100, 1000, 10000]) {
      const stripeCost = Math.ceil(amount * 0.015) + 25;
      assert.ok(
        totalFeeCents(amount, plan) >= stripeCost,
        `${plan} @ ${amount} не покрива Stripe таксата`,
      );
    }
  }
  // и стълбището се запазва: Free > Pro > Business
  assert.ok(totalFeeCents(1000, 'FREE') > totalFeeCents(1000, 'PRO'));
  assert.ok(totalFeeCents(1000, 'PRO') > totalFeeCents(1000, 'BUSINESS'));
  assert.equal(totalFeeCents(1000, 'BUSINESS'), processingFeeCents(1000));
});

test('planFor пада към FREE при непознат план', () => {
  assert.equal(planFor('UNKNOWN').id, 'FREE');
  assert.equal(planFor('PRO').id, 'PRO');
});

test('интервалите с намаления: цена и ефективна месечна', () => {
  // Pro €4/мес: 3 мес −10%, 6 мес −15%, 12 мес −20%
  assert.equal(intervalPriceCents('PRO', 'monthly'), 400);
  assert.equal(intervalPriceCents('PRO', 'quarterly'), 1080); // 1200×0.9
  assert.equal(intervalPriceCents('PRO', 'semiannual'), 2040); // 2400×0.85
  assert.equal(intervalPriceCents('PRO', 'annual'), 3840); // 4800×0.8
  // Business €9/мес годишно
  assert.equal(intervalPriceCents('BUSINESS', 'annual'), 8640); // 10800×0.8
  // ефективна месечна цена при годишен план (по-ниска от месечната)
  assert.equal(effectiveMonthlyCents('PRO', 'annual'), 320);
  assert.ok(effectiveMonthlyCents('PRO', 'annual') < PLANS.PRO.priceCents);
});

test('stripePriceEnvFor: правилно env име по план+период', () => {
  assert.equal(stripePriceEnvFor('PRO', 'annual'), 'STRIPE_PRICE_PRO_ANNUAL');
  assert.equal(
    stripePriceEnvFor('BUSINESS', 'monthly'),
    'STRIPE_PRICE_BUSINESS_MONTHLY',
  );
});

test('membershipFeePercent = комисиона по плана + обработка', async () => {
  const { membershipFeePercent, membershipInterval } = await import('../plans');
  assert.equal(membershipFeePercent('PRO'), 5.9); // 4 + 1.9
  assert.equal(membershipFeePercent('BUSINESS'), 1.9); // 0 + 1.9
  assert.equal(membershipInterval('year'), 'year');
  assert.equal(membershipInterval('month'), 'month');
  assert.equal(membershipInterval(null), 'month');
});
