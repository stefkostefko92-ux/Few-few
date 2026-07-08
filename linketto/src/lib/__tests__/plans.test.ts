import { test } from 'node:test';
import assert from 'node:assert/strict';
import { commissionCents, PLANS, planFor } from '../plans';

test('комисионите са намалени: 5% Free, 0% платени', () => {
  assert.equal(PLANS.FREE.feePercent, 5);
  assert.equal(PLANS.PRO.feePercent, 0);
  assert.equal(PLANS.BUSINESS.feePercent, 0);
  assert.equal(PLANS.FOUNDER.feePercent, 0);
});

test('commissionCents смята коректно и закръгля надолу', () => {
  assert.equal(commissionCents(10000, 'FREE'), 500);
  assert.equal(commissionCents(999, 'FREE'), 49);
  assert.equal(commissionCents(10000, 'PRO'), 0);
  assert.equal(commissionCents(0, 'FREE'), 0);
  assert.equal(commissionCents(-500, 'FREE'), 0);
});

test('planFor пада към FREE при непознат план', () => {
  assert.equal(planFor('UNKNOWN').id, 'FREE');
  assert.equal(planFor('PRO').id, 'PRO');
});
