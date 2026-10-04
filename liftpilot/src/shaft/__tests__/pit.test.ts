// The buffers in the pit: one place for the plan, the section, the check and the 3D (pit.ts). The software's places
// stay what the drawings had; set by hand they move, the drawings say where, and the check only watches what was set.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bufferMargin, bufferPlan, defaultInputs, keptPlan, layout, pitSpace, planValues } from '../index';
import type { ShaftInputs } from '../index';

const withV = (I: ShaftInputs, n: number): ShaftInputs => ({ ...I, vertical: { ...I.vertical, carBuffers: n } });

test('ammortizzatori: posizioni del software (uno al centro, due a 160 mm dai lati, quattro su due file)', () => {
  const I = defaultInputs(1600, 1750), L = layout(I), c = L.car, cx = c.x + c.w / 2, cy = c.y + c.h / 2;
  const car = (J: ShaftInputs): number[][] => bufferPlan(layout(J)).spots.filter((s) => s.kind === 'car').map((s) => [...s.c]);
  assert.deepEqual(car(withV(I, 1)), [[cx, cy]]);
  assert.deepEqual(car(I), [[cx - (c.w / 2 - 160), cy], [cx + (c.w / 2 - 160), cy]]);
  assert.deepEqual(car(withV(I, 4)), [[cx - (c.w / 2 - 160), cy - c.h / 4], [cx + (c.w / 2 - 160), cy - c.h / 4], [cx - (c.w / 2 - 160), cy + c.h / 4], [cx + (c.w / 2 - 160), cy + c.h / 4]]);
  const w = L.cw, cw = bufferPlan(L).spots.find((s) => s.kind === 'cw');
  assert.deepEqual(cw?.c, [w.x + w.w / 2, w.y + w.h / 2]);
  // a counterweight on a side: its buffer under its middle, the place along the side wall
  const S = layout({ ...I, cw: 'left' }), sw = bufferPlan(S);
  assert.equal(sw.cwPos, S.cw.y + S.cw.h / 2);
  assert.deepEqual(sw.spots.find((s) => s.kind === 'cw')?.c, [S.cw.x + S.cw.w / 2, S.cw.y + S.cw.h / 2]);
});

test('ammortizzatori: quelli del software e quelli a mano, la verifica li guarda tutti', () => {
  const I = defaultInputs(1600, 1750), L = layout(I), v = planValues(L);
  // none set: the software's places, checked too (out of the refuge space in the pit, UNI EN 81-20 5.2.5.8.1)
  assert.ok(bufferMargin(L) >= 0);
  assert.equal(L.checks.find((c) => c.id === 'v_buffer')?.status, 'ok');
  assert.ok(!L.checks.some((c) => c.id === 'v_place'), 'le quote dei soli ammortizzatori non aggiungono le verifiche della pianta');
  // the same places set by hand: the same buffers, conforming
  const same = layout({ ...I, plan: { bufX: v.bufX, bufY: v.bufY, bufSpan: v.bufSpan, cwBufPos: v.cwBufPos } });
  assert.deepEqual(bufferPlan(same).spots, bufferPlan(L).spots);
  assert.equal(same.checks.find((c) => c.id === 'v_buffer')?.status, 'ok');
  assert.ok(!same.checks.some((c) => c.id === 'v_place'));
  // moved 100 mm toward the back and 60 mm further apart: they move, still under the car and out of the refuge space
  const moved = layout({ ...I, plan: { bufY: (v.bufY ?? 0) + 100, bufSpan: (v.bufSpan ?? 0) + 60 } }), mp = bufferPlan(moved);
  assert.deepEqual(mp.rows, [(v.bufY ?? 0) + 100]);
  assert.equal(mp.span, (v.bufSpan ?? 0) + 60);
  assert.equal(moved.checks.find((c) => c.id === 'v_buffer')?.status, 'ok');
  // past the platform's side
  const out = layout({ ...I, plan: { bufSpan: L.car.w } });
  assert.equal(out.checks.find((c) => c.id === 'v_buffer')?.status, 'fail');
  assert.equal(out.checks.find((c) => c.id === 'v_buffer')?.value, -75);
  // into the refuge space in the pit
  const ref = pitSpace(L), inside = layout({ ...I, plan: { bufSpan: ref.x1 - ref.x0 } });
  assert.equal(inside.checks.find((c) => c.id === 'v_buffer')?.status, 'fail');
  // the counterweight's buffer past the end of the counterweight; only it was set
  const cw = layout({ ...I, plan: { cwBufPos: L.cw.x + 20 } });
  assert.equal(cw.checks.find((c) => c.id === 'v_buffer')?.status, 'fail');
  assert.equal(cw.checks.find((c) => c.id === 'v_buffer')?.value, 20 - 60);
});

test('ammortizzatori a mano: con un vano di altra misura tornano al software, con un altro lato del contrappeso resta solo la cabina', () => {
  const I: ShaftInputs = { ...defaultInputs(1600, 1750), plan: { bufX: 790, bufY: 820, bufSpan: 900, cwBufPos: 820 } };
  assert.equal(keptPlan(I, { ...I, W: 1700 }), undefined);
  assert.deepEqual(keptPlan(I, { ...I, cw: 'left' }), { bufX: 790, bufY: 820, bufSpan: 900 });
  assert.deepEqual(keptPlan(I, { ...I, Q: 630 }), I.plan);
});
