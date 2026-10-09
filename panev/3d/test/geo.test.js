import test from 'node:test';
import assert from 'node:assert/strict';
import { signedArea, slot, slotX, circle, rect, Path, loopGap } from '../src/geo/path.js';
import { insetLoop, trimBend } from '../src/geo/outline.js';
import { sheet } from '../src/geo/part.js';
import { analyse } from '../src/geo/check.js';

const close = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;
const bounds = (loop) => {
  const xs = loop.map((p) => p[0]);
  const ys = loop.map((p) => p[1]);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
};

test('outlines run counter-clockwise, holes clockwise', () => {
  assert.ok(signedArea(rect(0, 0, 10, 5)) > 0);
  assert.ok(signedArea(slot(0, 0, 40, 10)) < 0);
  assert.ok(signedArea(circle(0, 0, 10)) < 0);
  const p = new Path(0, 0).to(0, 10).to(10, 10).to(10, 0).close();
  assert.ok(signedArea(p) > 0, 'Path.close() normalises to counter-clockwise');
});

test('a slot spans exactly the extremes it is drawn between', () => {
  const [x0, y0, x1, y1] = bounds(slotX(11, 83, 32.5, 12));
  assert.ok(close(x0, 11, 1e-9) && close(x1, 83, 1e-9));
  assert.ok(close(y0, 26.5, 1e-9) && close(y1, 38.5, 1e-9));
  const area = -signedArea(slotX(0, 40, 0, 10));
  assert.ok(Math.abs(area - (30 * 10 + Math.PI * 25)) < 0.5, `stadium area ${area}`);
});

test('inset moves free edges by the bevel and leaves bend edges in place', () => {
  const sq = rect(0, 0, 10, 10); // edges: bottom, right, top, left
  const inset = insetLoop(sq, [0, 1, 1, 1]);
  assert.deepEqual(inset.map(([x, y]) => [Math.round(x * 1e6) / 1e6, Math.round(y * 1e6) / 1e6]), [[1, 0], [9, 0], [9, 9], [1, 9]]);
});

test('a bend over the whole edge moves it back by the setback', () => {
  const { loop, flags } = trimBend(rect(0, 0, 100, 50), [null, null, null, null], [0, 0], [100, 0], 10, 7);
  assert.deepEqual(loop, [[0, 10], [100, 10], [100, 50], [0, 50]]);
  assert.deepEqual(flags, [7, null, null, null]);
});

test('a bend over part of an edge gets a relief notch beside it', () => {
  // Top edge of a flange runs right to left; the bend covers x 0..90 of 150.
  const { loop, flags } = trimBend(rect(0, 0, 150, 65), [null, null, null, null], [90, 65], [0, 65], 10, 1, { w: 2, d: 3 });
  assert.equal(flags.filter((f) => f === 1).length, 1);
  const bendEdge = flags.indexOf(1);
  assert.deepEqual([loop[bendEdge], loop[(bendEdge + 1) % loop.length]], [[90, 55], [0, 55]]);
  assert.ok(loop.some(([x, y]) => x === 92 && y === 52), 'notch 2 wide, 3 below the tangent line');
  assert.ok(signedArea(loop) > 0);
});

test('an L angle folds into a closed solid with the drawn outer dimensions', () => {
  for (const bevel of [0, 0.5]) {
    const p = sheet({ t: 4, bevel });
    p.face('plate', { outline: rect(0, 0, 150, 80), holes: [slotX(20, 70, 40, 10)] });
    p.face('flange', { outline: rect(0, 0, 150, 50) });
    p.bend('plate', 'flange', { from: [0, 0], to: [150, 0], dir: 'up' });
    const a = analyse(p.build());
    assert.equal(a.open, 0, 'no open edges');
    assert.equal(a.nonManifold, 0, 'no edge used twice in one direction');
    assert.equal(a.degenerate, 0);
    assert.deepEqual(a.size.map((v) => Math.round(v * 1000) / 1000), [150, 80, 50]);
    // Straight parts + quarter-annulus bend − slot, minus what the bevels shave off.
    const straight = 150 * 72 * 4 + 150 * 42 * 4 - (40 * 10 + Math.PI * 25) * 4;
    const bendVol = 150 * (Math.PI / 4) * (8 * 8 - 4 * 4);
    assert.ok(a.volume <= straight + bendVol + 1 && a.volume > (straight + bendVol) * 0.985, `volume ${a.volume}`);
  }
});

test('children fold to the requested side and the drawn hand can be mirrored', () => {
  const p = sheet({ t: 5 });
  p.face('flange', { outline: rect(0, 0, 150, 65) });
  p.face('plate', { outline: rect(0, 0, 90, 160) });
  p.bend('flange', 'plate', { from: [0, 65], to: [90, 65], dir: 'down' });
  const mb = p.build();
  let a = analyse(mb);
  assert.equal(a.open, 0);
  assert.ok(close(a.min[2], -155, 1e-6) && close(a.max[2], 5, 1e-6), 'plate hangs 160 below the flange top face');
  a = analyse(mb.mirrorX());
  assert.equal(a.open, 0);
  assert.ok(close(a.min[0], -150, 1e-6) && a.volume > 0, 'mirrored solid keeps its orientation');
});

test('holes keep clear of each other', () => {
  assert.ok(loopGap(slotX(10, 61, 25, 10), slotX(69, 120, 25, 10)) > 7.9);
});
