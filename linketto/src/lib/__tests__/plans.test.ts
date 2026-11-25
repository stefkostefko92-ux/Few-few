import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PLANS, planFor, intervalPriceCents, effectiveMonthlyCents } from '../plans';

test('плановете: цени и лимити (без комисиона — продажбите са извън Linketto)', () => {
  assert.equal(PLANS.FREE.priceCents, 0);
  assert.equal(PLANS.PRO.priceCents, 400);
  assert.equal(PLANS.BUSINESS.priceCents, 900);
  assert.equal(PLANS.FOUNDER.priceCents, 4900);
  assert.equal(PLANS.FOUNDER.oneTime, true);
  assert.equal(PLANS.FREE.customDomain, false);
  assert.equal(PLANS.PRO.customDomain, true);
  assert.equal(PLANS.BUSINESS.maxProfiles, 5);
  for (const plan of Object.values(PLANS)) {
    assert.ok(!('feePercent' in plan), `${plan.id}: комисионата е махната`);
  }
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
