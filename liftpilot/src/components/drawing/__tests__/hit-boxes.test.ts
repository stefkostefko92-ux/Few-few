// The buttons over the dimensions of a real plan: each one covers its lettering, none covers another, and they grow to
// a finger's size where there is room.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { layout, defaultInputs } from '@/shaft';
import { previews } from '@/lib/tavole/views';
import { hitBoxes } from '../hit-boxes';

const overlap = (a: { x0: number; y0: number; x1: number; y1: number }, b: typeof a): boolean => a.x0 < b.x1 - 1e-9 && b.x0 < a.x1 - 1e-9 && a.y0 < b.y1 - 1e-9 && b.y0 < a.y1 - 1e-9;

test('pulsanti delle quote: coprono la scritta, non si coprono tra loro, crescono dove c’è posto', () => {
  const { plan } = previews(layout(defaultInputs(1600, 1750)));
  assert.ok(plan.hits.length > 30);
  for (const min of [2, 8, 14]) {
    const boxes = hitBoxes(plan.hits, min);
    boxes.forEach((r, i) => {
      const o = plan.hits[i].box;
      assert.ok(r.x0 <= o.x0 + 1e-9 && r.x1 >= o.x1 - 1e-9 && r.y0 <= o.y0 + 1e-9 && r.y1 >= o.y1 - 1e-9, `${i} copre la scritta`);
      boxes.forEach((q, j) => { if (j > i && !overlap(o, plan.hits[j].box)) assert.ok(!overlap(r, q), `${min}: ${i} e ${j} si coprono`); });
    });
  }
  // with room all round, a lone lettering grows to the full size
  const lone = hitBoxes([{ box: { x0: 10, y0: 10, x1: 12, y1: 11 }, edit: { key: 'W', base: 0, k: 1 }, value: 1 }], 8)[0];
  assert.deepEqual([lone.x1 - lone.x0, lone.y1 - lone.y0], [8, 8]);
});
