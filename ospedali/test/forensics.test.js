import { test } from 'node:test';
import assert from 'node:assert/strict';
import { median, percentile, robustZ } from '../src/forensics.js';

test('median и percentile (forensics)', () => {
  assert.equal(median([10, 2, 8, 4, 6]), 6);
  assert.equal(median([]), null);
  assert.equal(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 90), 10);
  assert.equal(percentile([5], 50), 5);
});

test('robustZ — устойчив z-score', () => {
  // med=10, mad=2 → 1.4826*2 ≈ 2.965; (20-10)/2.965 ≈ 3.37
  const z = robustZ(20, 10, 2);
  assert.ok(z > 3 && z < 3.5, `z=${z}`);
  assert.equal(robustZ(10, 10, 0), null); // нулев MAD → без z
  assert.equal(robustZ(null, 10, 2), null);
});

test('robustZ — нормална стойност близо до 0', () => {
  const z = robustZ(10, 10, 2);
  assert.equal(z, 0);
});
