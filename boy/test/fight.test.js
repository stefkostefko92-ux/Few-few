// Simulates the whole duel without a GPU and checks what the eye would catch:
// arms that detach from the gauntlets, feet in the floor, and blows that miss their mark.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { buildFighters } from './fixtures.js';
import { EVENTS } from '../src/choreo.js';
import { closestSegSeg } from '../src/events.js';
import { DURATION } from '../src/config.js';

const STEP = 1 / 120;
const pa = new THREE.Vector3();
const pb = new THREE.Vector3();

function simulate(onFrame) {
  const { A, B } = buildFighters();
  for (let T = 0; T < DURATION; T += STEP) {
    const dT = T === 0 ? 0 : STEP;
    A.update(T, dT, B);
    B.update(T, dT, A);
    onFrame(T, A, B);
  }
}

test('arms always reach the gauntlets and every part stays finite', () => {
  let worst = 0;
  let worstAt = '';
  const wrist = new THREE.Vector3();
  simulate((T, A, B) => {
    for (const f of [A, B]) {
      for (const [hand, joint] of [[f.handR, f.rig.w.wristR], [f.handL, f.rig.w.wristL]]) {
        const gap = wrist.copy(hand.grip).addScaledVector(hand.x, -0.072).distanceTo(joint);
        if (gap > worst) {
          worst = gap;
          worstAt = `${f.who} at ${T.toFixed(2)} s`;
        }
      }
      for (const part of Object.values(f.knight.parts)) assert.ok(part.matrix.elements.every(Number.isFinite), `${f.who} has a non-finite part matrix at ${T}`);
    }
  });
  assert.ok(worst < 0.03, `wrist misses its target by ${(worst * 100).toFixed(1)} cm (${worstAt})`);
});

test('feet never sink into the cobbles', () => {
  let lowest = Infinity;
  simulate((T, A, B) => {
    for (const f of [A, B]) for (const foot of f.feet.feet) lowest = Math.min(lowest, foot.pos.y);
  });
  assert.ok(lowest >= 0.085, `an ankle dips to ${lowest.toFixed(3)} m`);
});

test('every blow lands on steel: blades cross, shields catch, the pauldron is struck', () => {
  const pending = EVENTS.filter((e) => ['clash', 'shield', 'pauldron', 'bash'].includes(e.type));
  const results = [];
  simulate((T, A, B) => {
    while (pending.length && T + STEP / 2 >= pending[0].t) {
      const ev = pending.shift();
      if (ev.type === 'clash') {
        closestSegSeg(A.bladeBase, A.bladeTip, B.bladeBase, B.bladeTip, pa, pb);
        results.push([ev, pa.distanceTo(pb), 0.02]);
      } else if (ev.type === 'shield') {
        const n = B.shieldNormal;
        const o = B.shieldCenter;
        const s = THREE.MathUtils.clamp(n.dot(o.clone().sub(A.bladeBase)) / n.dot(A.bladeTip.clone().sub(A.bladeBase)), 0, 1);
        const off = A.bladeBase.clone().lerp(A.bladeTip, s).sub(o);
        off.addScaledVector(n, -off.dot(n));
        results.push([ev, off.length(), 0.26]);
      } else if (ev.type === 'pauldron') {
        const plate = B.rig.w.shoulderL.clone().add(new THREE.Vector3(0, 0.1, 0));
        const ab = A.bladeTip.clone().sub(A.bladeBase);
        const t = THREE.MathUtils.clamp(plate.clone().sub(A.bladeBase).dot(ab) / ab.lengthSq(), 0, 1);
        results.push([ev, A.bladeBase.clone().addScaledVector(ab, t).distanceTo(plate), 0.09]);
        // Bare heads: the final blow must stay clear of the Warden's face.
        const face = B.rig.w.head.clone().add(new THREE.Vector3(0, 0.1, 0));
        const s = THREE.MathUtils.clamp(face.clone().sub(A.bladeBase).dot(ab) / ab.lengthSq(), 0, 1);
        assert.ok(A.bladeBase.clone().addScaledVector(ab, s).distanceTo(face) > 0.12, 'the final blow cuts through the head');
      } else {
        results.push([ev, B.shieldCenter.distanceTo(A.rig.w.chest), 0.2]);
      }
    }
  });
  assert.equal(pending.length, 0);
  for (const [ev, dist, limit] of results) assert.ok(dist < limit, `${ev.type} at ${ev.t} s misses by ${dist.toFixed(3)} m (limit ${limit})`);
});
