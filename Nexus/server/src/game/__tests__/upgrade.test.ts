import test from 'node:test';
import assert from 'node:assert';
import { nextUpgradeCost, cumulativeCost, batchCost } from '../upgrade';

test('nextUpgradeCost е линейна 5-10-15-20-25-30-35-40-45 крива', () => {
  // count = брой досегашни вдигания; цената на следващото е 5*(count+1).
  const expected = [5, 10, 15, 20, 25, 30, 35, 40, 45];
  for (let count = 0; count < expected.length; count++) {
    assert.equal(nextUpgradeCost(count), expected[count], `вдигане #${count + 1}`);
  }
  // Продължава линейно и след 45.
  assert.equal(nextUpgradeCost(9), 50);
  assert.equal(nextUpgradeCost(19), 100);
});

test('cumulativeCost = сумата на линейната крива (5·n(n+1)/2)', () => {
  assert.equal(cumulativeCost(0), 0);
  assert.equal(cumulativeCost(1), 5);
  assert.equal(cumulativeCost(2), 15);   // 5+10
  assert.equal(cumulativeCost(3), 30);   // 5+10+15
  assert.equal(cumulativeCost(9), 225);  // 5+10+…+45
});

test('batchCost сумира последователни вдигания от текущия брой', () => {
  assert.equal(batchCost(0, 3), 30);     // 5+10+15
  assert.equal(batchCost(2, 2), 35);     // 15+20
  // batchCost(0, n) === cumulativeCost(n)
  assert.equal(batchCost(0, 9), cumulativeCost(9));
});
