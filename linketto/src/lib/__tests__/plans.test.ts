import { test } from 'node:test';
import assert from 'node:assert/strict';
import { commissionCents, PLANS, planFor } from '../plans';

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

test('planFor пада към FREE при непознат план', () => {
  assert.equal(planFor('UNKNOWN').id, 'FREE');
  assert.equal(planFor('PRO').id, 'PRO');
});
