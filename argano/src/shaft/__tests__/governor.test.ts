// The overspeed governor: by the rated speed the smallest of PFB's LK series (and the R12BF) that takes it, or the
// model chosen when it takes the speed; the range drawn in the LK200's proportions, the LX120 at its published height.
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
});
