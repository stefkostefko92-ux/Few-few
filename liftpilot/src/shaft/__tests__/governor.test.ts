// The overspeed governor: by the rated speed the smallest of PFB's LK series (and the R12BF) that takes it, or the
// model chosen when it takes the speed (PFB's, Bode's, Dynatech's, Wittur's or Montanari's); PFB's, Bode's and
// Dynatech's at the heights, axles and bases of their drawings, the others in the software's proportions.
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
  // the drawing's height, axle and base: the base's long side along the sheave's plane
  for (const [model, h, axle, along, across] of [['LK200', 415, 165, 220, 165], ['LK315', 415, 165, 220, 130], ['R12BF', 524, 337, 520, 116],
    ['R10BF', 488, 303, 460, 196], ['R1-LR', 344, 190.5, 285, 80], ['LX200', 349, 110, 190, 76], ['GB 7', 360, 205, 325, 165], ['VEGA 200', 332, 199.5, 200, 117]] as const) {
    const g = GOVERNORS.find((x) => x.model === model);
    assert.ok(g && Math.abs(g.axle + g.top - h) < 1e-9 && g.axle === axle && g.baseW === along / 2 && g.baseA === across / 2, model);
  }
  assert.equal(govSize(3.5).brand, 'PFB');
  assert.deepEqual(GOVERNORS.filter((g) => g.brand === 'Montanari').map((g) => g.model), ['RQ-A 200', 'RQ-A 250', 'RQ-A 300', 'RC 200', 'RC 300', 'NOR', 'RG 200']);
  // Bode's rated speed from its highest tripping speed (≥ 115 % of the rated one)
  assert.deepEqual(GOVERNORS.filter((g) => g.brand === 'Bode').map((g) => g.vMax), [2.98, 1.29]);
  assert.equal(govSize(1.5, 'GB 8').model, 'LK250', 'il GB 8 arriva a 1,29 m/s');
  assert.equal(govSize(5, 'OL100').brand, 'Wittur');
  assert.equal(govSize(1.2, 'NOR').model, 'NOR');
  assert.equal(govSize(1.6, 'NOR').model, 'LK250', 'il NOR arriva a 1,50 m/s');
  assert.equal(govSize(2.5, 'RQ-A 300').R, 150);
});
