// A wall of furniture is a run in its own coordinates, placed in the room by a quarter turn about the vertical and a
// shift (engine/transform.js) — the same turn three.js gives a group with rotation.y, so the 3D and the plan agree.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { registerFixtures } from './fixtures.mjs';
import { buildModel } from '../../engine/model.js';
import { turnPoint, turnDir, worldBox, worldParts, runOf } from '../../engine/transform.js';

registerFixtures();

test('points and directions turn a quarter at a time: the front of the left wall (+z) looks along +x, of the right one along −x', () => {
  assert.deepEqual(turnPoint([100, 50, 10], { turn: 1, dx: 0, dz: 0 }), [10, 50, -100]);
  assert.deepEqual(turnPoint([100, 50, 10], { turn: 3, dx: 2000, dz: 600 }), [1990, 50, 700]);
  assert.deepEqual(turnPoint([100, 50, 10], { turn: 2 }), [-100, 50, -10]);
  for (const [dir, turn, out] of [['+z', 1, '+x'], ['+x', 1, '-z'], ['+z', 3, '-x'], ['-y', 3, '-y'], ['-x', 2, '+x'], ['+z', 0, '+z']]) {
    assert.equal(turnDir(dir, turn), out, `${dir} turned ${turn}`);
  }
});

test('the turn is the one three.js makes with rotation.y = turn · π/2', () => {
  const up = new THREE.Vector3(0, 1, 0);
  for (const turn of [0, 1, 2, 3]) {
    for (const p of [[600, 820, 560], [-30, 5, 7], [0, 0, 1]]) {
      const v = new THREE.Vector3(...p).applyAxisAngle(up, (turn * Math.PI) / 2);
      const ours = turnPoint(p, { turn, dx: 0, dz: 0 });
      ours.forEach((c, i) => assert.ok(Math.abs(c - v.getComponent(i)) < 1e-9, `turn ${turn} ${p}: ${ours} vs ${v.toArray()}`));
    }
  }
});

test('a box turns into a box of the same size, and turned back it is where it was', () => {
  const box = { min: [0, 100, 0], max: [600, 820, 560] };
  for (const turn of [0, 1, 2, 3]) {
    const w = worldBox(box, { turn, dx: 300, dz: 900 });
    const size = (b) => b.max.map((v, i) => v - b.min[i]);
    const [sx, sy, sz] = size(box);
    assert.deepEqual(size(w), turn % 2 ? [sz, sy, sx] : [sx, sy, sz], `turn ${turn}: size`);
    const shifted = { min: w.min.map((v, i) => v - [300, 0, 900][i]), max: w.max.map((v, i) => v - [300, 0, 900][i]) };
    assert.deepEqual(worldBox(shifted, { turn: 4 - turn, dx: 0, dz: 0 }), box, `turn ${turn}: back`);
  }
});

test('a model without runs is already in the room: its parts are their own world', () => {
  const m = buildModel({ type: 'kitchen' });
  assert.equal(m.runs, undefined);
  assert.ok(m.parts.every((p) => p.run === undefined));
  assert.equal(worldParts(m), m.parts);
  assert.equal(runOf(m, undefined), null);
});
