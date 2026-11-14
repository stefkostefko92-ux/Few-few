// Bathroom furniture (engine/bathroom.js): the cabinet under a sink — no top and no shelf, the siphon's place marked on
// the back, hung on the wall or on legs — and the mirror cabinet, whose glued mirror counts in the hinge check. Both
// make whole outputs: nothing in anything, the CNC files not withheld on the defaults, the bought parts named.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { registerFixtures } from './fixtures.mjs';
import { checkModel, assertNoHoleOnHole } from './check.mjs';
import { buildModel } from '../../engine/model.js';
import { TYPES } from '../../engine/types.js';
import { MIRROR, SIPHON } from '../../engine/bathroom.js';
import { nest } from '../../engine/nest.js';
import { cncBlockers } from '../../engine/cam.js';

registerFixtures();

const variants = [
  { type: 'vanity' },
  { type: 'vanity', mount: 'legs' },
  { type: 'vanity', width: 400, doors: 1 },
  { type: 'vanity', width: 1200, doors: 2 },
  { type: 'mirror' },
  { type: 'mirror', width: 1200, doors: 2 },
  { type: 'mirror', depth: 120, shelves: 0 },
];
const label = (s) => JSON.stringify(s);

test('both are offered, in the bathroom group, and their defaults build without a warning above info', () => {
  for (const type of ['vanity', 'mirror']) {
    assert.equal(TYPES[type].group, 'bathroom');
    const m = buildModel({ type });
    assert.deepEqual(m.warnings.filter((w) => w.level !== 'info'), [], type);
  }
});

test('under the sink: rails instead of a top, no shelf, the siphon marked on the back, the basin bought', () => {
  for (const s of variants.filter((v) => v.type === 'vanity')) {
    const m = buildModel(s);
    assert.equal(m.parts.filter((p) => p.role === 'top').length, 0, label(s));
    assert.equal(m.parts.filter((p) => p.role === 'rail').length, 2, label(s));
    assert.equal(m.parts.filter((p) => p.role === 'shelf').length, 0, label(s));
    const back = m.parts.find((p) => p.role === 'back');
    const siphon = back.features.filter((f) => f.type === 'mark' && f.kind === 'siphon');
    assert.equal(siphon.length, 4, label(s));
    const us = siphon.map((f) => f.u);
    const vs = siphon.map((f) => f.v);
    assert.ok(Math.abs(Math.max(...us, ...vs) - Math.min(...us, ...vs)) >= SIPHON.w - 0.01, label(s));
    assert.ok(m.hardware.some((h) => h.key === 'basin'), label(s));
    // hung: the lower edge at `floor`, no legs; on legs: standing on them
    const wall = (s.mount ?? 'wall') === 'wall';
    const side = m.parts.find((p) => p.role === 'side');
    assert.equal(side.box.min[1], wall ? (s.floor ?? 330) : (s.legs ?? 150), label(s));
    assert.equal(m.symbols.some((x) => x.type === 'leg'), !wall, label(s));
    checkModel(m, label(s));
    assertNoHoleOnHole(m, label(s));
    assert.deepEqual(cncBlockers(m, nest(m)), [], label(s));
  }
});

test('the mirror cabinet: a mirror per door, bought to size, and its weight in the hinge check', () => {
  for (const s of variants.filter((v) => v.type === 'mirror')) {
    const m = buildModel(s);
    const doors = m.parts.filter((p) => p.role === 'door');
    const mirrors = m.hardware.filter((h) => h.key.startsWith('mirror:'));
    assert.equal(mirrors.reduce((a, h) => a + h.qty, 0), doors.length, label(s));
    for (const d of doors) {
      const w = Math.round((d.box.max[0] - d.box.min[0] - 4) * 10) / 10;
      assert.ok(mirrors.some((h) => h.key.startsWith(`mirror:${w}x`)), `${label(s)}: ${w}`);
    }
    checkModel(m, label(s));
    assert.deepEqual(cncBlockers(m, nest(m)), [], label(s));
  }
  assert.equal(MIRROR.kgM2, 10);
  // the mirror's weight counts in the hinges: the same 500 × 600 door takes a third hinge with its mirror
  const hinges = (m) => m.hardware.filter((h) => h.key.startsWith('hinge:')).reduce((a, h) => a + h.qty, 0);
  const door = { width: 500, height: 600, doors: 1, shelves: 0 };
  assert.equal(hinges(buildModel({ type: 'mirror', depth: 200, ...door })), 3);
  assert.equal(hinges(buildModel({ type: 'wall', depth: 300, ...door })), 2);
});
