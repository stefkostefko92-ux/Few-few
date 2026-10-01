// The overspeed governor: by the rated speed the smallest of PFB's LK series (and the R12BF) that takes it, or the
// model chosen when it takes the speed (PFB's or Montanari's); the range drawn in the LK200's proportions, the LX120,
// R10BF, R12BF and R1-LR at their published heights and bases.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GOVERNORS, govSize } from '../governor';

test('limitatore: per velocità, o il modello scelto se regge la velocità', () => {
  assert.equal(govSize(1).model, 'LK200');
  assert.equal(govSize(1.6).model, 'LK250');
  assert.equal(govSize(2.5).model, 'LK300');
  assert.equal(govSize(3.5).model, 'R12BF');
  assert.equal(govSize(1, 'LX150').model, 'LX150');
  assert.equal(govSize(2.5, 'LX150').model, 'LK300', 'oltre la sua velocità il modello scelto non vale');
  assert.equal(new Set(GOVERNORS.map((g) => g.model)).size, GOVERNORS.length);
  const lx120 = GOVERNORS.find((g) => g.model === 'LX120');
  assert.ok(lx120 && Math.abs(lx120.axle + lx120.top - 178) < 1e-9);
  for (const g of GOVERNORS) assert.ok(g.R > 0 && g.rope > 0 && g.axle > g.R && g.baseA > 0 && g.baseW > 0, g.model);
  // a dealer's height and base: the base's long side along the sheave's plane
  for (const [model, h, along, across] of [['R12BF', 524, 520, 116], ['R10BF', 488, 460, 196], ['R1-LR', 344, 285, 80]] as const) {
    const g = GOVERNORS.find((x) => x.model === model);
    assert.ok(g && Math.abs(g.axle + g.top - h) < 1e-9 && g.baseW === along / 2 && g.baseA === across / 2, model);
  }
  assert.equal(govSize(3.5).brand, 'PFB');
  assert.deepEqual(GOVERNORS.filter((g) => g.brand === 'Montanari').map((g) => g.model), ['RQ-A 200', 'RQ-A 250', 'RQ-A 300', 'NOR', 'RG 200']);
  assert.equal(govSize(1.2, 'NOR').model, 'NOR');
  assert.equal(govSize(1.6, 'NOR').model, 'LK250', 'il NOR arriva a 1,50 m/s');
  assert.equal(govSize(2.5, 'RQ-A 300').R, 150);
});
