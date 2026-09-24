import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RESOLVED, rootOf, timeScaleAt } from '../src/timeline.js';
import { DURATION } from '../src/config.js';

test('every weapon key resolves to a unit blade with a perpendicular edge', () => {
  for (const who of ['A', 'B']) {
    for (const k of RESOLVED.keysOf[who]) {
      for (const v of [k.p, k.d, k.e]) assert.ok(Number.isFinite(v.x + v.y + v.z), `${who} @ ${k.t}`);
      assert.ok(Math.abs(k.d.length() - 1) < 1e-6);
      assert.ok(Math.abs(k.d.dot(k.e)) < 1e-6, `${who} @ ${k.t}: edge not perpendicular to the blade`);
    }
  }
  for (const k of RESOLVED.shield) assert.ok(Number.isFinite(k.w.x + k.w.y + k.w.z + k.n.x + k.n.y + k.n.z));
});

test('keys are in time order for both fighters', () => {
  for (const list of [RESOLVED.keysOf.A, RESOLVED.keysOf.B, RESOLVED.shield]) {
    for (let i = 1; i < list.length; i++) assert.ok(list[i].t > list[i - 1].t, `key order at ${list[i].t}`);
  }
});

test('the knights always face each other and never overlap', () => {
  for (let t = 0; t <= DURATION; t += 0.05) {
    const a = rootOf('A', t);
    const b = rootOf('B', t);
    const gap = a.pos.distanceTo(b.pos);
    assert.ok(gap > 0.6, `roots only ${gap.toFixed(2)} m apart at ${t.toFixed(2)} s`);
    const toB = b.pos.clone().sub(a.pos).normalize();
    assert.ok(Math.abs(Math.sin(a.yaw) - toB.x) < 1e-6 && Math.abs(Math.cos(a.yaw) - toB.z) < 1e-6);
  }
});

test('time only slows down, and only in the two bullet-time beats', () => {
  for (let t = 0; t <= DURATION; t += 0.01) {
    const s = timeScaleAt(t);
    assert.ok(s > 0.1 && s <= 1, `time scale ${s} at ${t}`);
    if (s < 0.99) assert.ok((t > 12.8 && t < 13.7) || (t > 21.4 && t < 22.6), `unexpected slow motion at ${t.toFixed(2)}`);
  }
});
