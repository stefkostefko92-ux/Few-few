// Binds the motion-capture body layer to the duel: each knight's choreography activity (sword
// hand speed plus turning) drives the alignment, and layerBody() adds the captured motion to the
// authored body drives with a single weight, so a knight can fall back to the authored pose alone.
import * as THREE from 'three';
import { BodyLayer, MOCAP_FPS } from './mocap.js';
import { rootOf, toWorld, weaponAt } from './timeline.js';
import { DURATION } from './config.js';

const UP = new THREE.Vector3(0, 1, 0);

function storyActivity(who) {
  const n = Math.ceil(DURATION * MOCAP_FPS) + 1;
  const act = new Float32Array(n);
  const W = { p: new THREE.Vector3(), d: new THREE.Vector3(), e: new THREE.Vector3() };
  const root = { pos: new THREE.Vector3(), yaw: 0 };
  const grip = new THREE.Vector3();
  const prev = new THREE.Vector3();
  let prevYaw = 0;
  for (let i = 0; i < n; i++) {
    rootOf(who, i / MOCAP_FPS, root);
    weaponAt(who, i / MOCAP_FPS, W);
    toWorld(root, [W.p.x, W.p.y, W.p.z], grip);
    if (i > 0) act[i] = (grip.distanceTo(prev) + 0.35 * Math.abs(root.yaw - prevYaw)) * MOCAP_FPS;
    prev.copy(grip);
    prevYaw = root.yaw;
  }
  act[0] = act[1];
  return act;
}

// The Warden moves as the actor's mirror image, so the two knights never share a gesture.
export const captureFor = (who) => new BodyLayer(storyActivity(who), { mirror: who === 'B' });

// P = authored drives + weight k x captured motion (mo from BodyLayer.sample).
export function layerBody(P, drives, mo, k, yaw) {
  P.pelvisYaw = drives.pelvisYaw + mo.pelvisYaw * k;
  P.pelvisPitch = drives.pelvisPitch + mo.pelvisPitch * k;
  P.pelvisRoll = drives.pelvisRoll + mo.pelvisRoll * k;
  P.twist = drives.twist + mo.twist * k;
  P.lean = drives.lean + mo.lean * k;
  P.side = drives.side + mo.side * k;
  P.hipY = drives.hipY + mo.hipY * k;
  P.headYaw = drives.headYaw + mo.headYaw * k;
  P.headPitch = drives.headPitch + mo.headPitch * k;
  P.headRoll = drives.headRoll + mo.headRoll * k;
  P.shift.set(-mo.shiftX * k, 0, mo.shiftZ * k).applyAxisAngle(UP, yaw);
}
