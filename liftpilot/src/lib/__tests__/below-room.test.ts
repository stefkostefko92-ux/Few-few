// The room of a machine below with its sizes set on its drawings (ShaftInputs.below): beside the shaft it keeps its side
// at the wall it stands past and grows away from it, across from its side nearest the origin; under the pit from its
// corner nearest the origin, its height taking the machine's floor down; the machine has to stay inside it (m_fit).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deriveLift, newLift, type LiftInputs } from '@/lib/lift';
import { belowFit, belowMachine, belowRoom, bottomGeo, type BottomScheme } from '@/lib/lift/bottom';
import { sheaveAxisBelow } from '@/lib/lift/machine';
import type { BelowRoom, ShaftInputs } from '@/shaft';

const below = (scheme: BottomScheme, p: Partial<ShaftInputs> = {}): LiftInputs => {
  const b = newLift();
  return { ...b, calc: { ...b.calc, layout: 'bottom' }, shaft: { ...b.shaft, ...p }, bottom: scheme };
};
const roomOf = (inp: LiftInputs, set?: BelowRoom) => {
  const d = deriveLift(set ? { ...inp, shaft: { ...inp.shaft, below: set } } : inp), L = d.layout, M = d.machine, scheme = d.bottom;
  assert.ok(scheme);
  const g = bottomGeo(L, scheme, M.D, d.analysis.ctx.I.Dp, M.n, M.d, d.analysis.ctx.I.r, sheaveAxisBelow(M.D, M.shape ?? null));
  const m = belowMachine(L, g, M.D, M.n, M.d, M.shape ?? null);
  return { d, g, R: belowRoom(L, g, m.body).room, fit: belowFit(L, g, M)[0] };
};

test('macchina in basso accanto al vano: le misure date sui disegni, il lato al muro resta', () => {
  const rear = below('head'), a = roomOf(rear), b = roomOf(rear, { W: a.R.W + 300, D: a.R.D + 400, H: 2700, doorW: 900, doorH: 2100 });
  assert.equal(a.fit.status, 'ok');
  assert.deepEqual([b.R.W, b.R.D, b.R.H, b.R.doorW, b.R.doorH], [a.R.W + 300, a.R.D + 400, 2700, 900, 2100]);
  // the room past the rear wall (the drops along +y): its near side (min y) stays, across its side nearest the origin
  assert.equal(b.R.shaftY, a.R.shaftY);
  assert.equal(b.R.shaftX, a.R.shaftX);
  // past the left wall (the drops along −x): its side at the wall (max x) stays as it grows
  const left = below('head', { cw: 'left' }), c = roomOf(left), e = roomOf(left, { W: c.R.W + 500 });
  assert.equal(e.R.W - e.R.shaftX, c.R.W - c.R.shaftX, 'il lato al muro resta');
  // too small for the machine: m_fit says so, in the derivation's checks too
  const tiny = roomOf(rear, { W: 1000, D: 1000 });
  assert.equal(tiny.fit.status, 'fail');
  assert.equal(tiny.d.supportChecks.find((x) => x.id === 'm_fit')?.status, 'fail');
});

test('macchina sotto il vano: il locale dal suo angolo, la sua altezza porta giù il pavimento della macchina', () => {
  const under = below('under'), a = roomOf(under), b = roomOf(under, { H: 3000, W: a.R.W + 200 });
  assert.equal(b.R.shaftX, a.R.shaftX);
  assert.equal(b.R.W, a.R.W + 200);
  assert.equal(a.g.roomFloor - b.g.roomFloor, 3000 - a.R.H);
  assert.equal(b.fit.status, 'ok');
  // the calculation follows the machine down (the runs from the head pulleys are longer)
  assert.ok(Number(b.d.values.Hv) > Number(a.d.values.Hv));
});
