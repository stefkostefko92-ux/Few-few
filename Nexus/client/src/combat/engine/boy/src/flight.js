// The Warden's sword is struck from his hand: a ballistic tumble, a bounce, then it lies flat.
import * as THREE from 'three';
import { rootOf, toWorld, dirToWorld, weaponAt } from './timeline.js';

// Default за фиксираното демо на boy; 4a.2 подава кой слот/кога през EVENTS (виж fighter.js).
export const DISARM_T = 21.6;
const UP = new THREE.Vector3(0, 1, 0);
const ONE = new THREE.Vector3(1, 1, 1);

// Launch state from the choreographed grip at the moment of the disarm. `who`/`disarmT` идват
// от EVENTS ({type:'disarm', against}) на генерираната хореография — по подразбиране 'B'/21.6
// (фиксираното демо на boy, където губещият винаги е Warden-ът).
export function launchFlight(who = 'B', disarmT = DISARM_T) {
  const r0 = rootOf(who, disarmT);
  const w0 = weaponAt(who, disarmT, { p: new THREE.Vector3(), d: new THREE.Vector3(), e: new THREE.Vector3() });
  const g0 = toWorld(r0, [w0.p.x, w0.p.y, w0.p.z]);
  const d0 = dirToWorld(r0, [w0.d.x, w0.d.y, w0.d.z]);
  const e0 = dirToWorld(r0, [w0.e.x, w0.e.y, w0.e.z]);
  const away = dirToWorld(r0, [0.9, 0, -0.35]);
  const v0 = away.multiplyScalar(2.1).addScaledVector(UP, 2.6);
  const axis = new THREE.Vector3().crossVectors(d0, v0).normalize();
  const q0 = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(e0, d0, new THREE.Vector3().crossVectors(e0, d0)));
  const tl = (v0.y + Math.sqrt(v0.y * v0.y + 2 * 9.81 * (g0.y - 0.06))) / 9.81;
  const land = g0.clone().addScaledVector(v0, tl);
  land.y = 0.016;
  const flatD = new THREE.Vector3(v0.x, 0, v0.z).normalize().applyAxisAngle(UP, 1.1);
  const flatE = new THREE.Vector3().crossVectors(UP, flatD).normalize();
  const qFlat = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(flatE, flatD, UP.clone()));
  return { g0, v0, axis, q0, tl, land, qFlat, spin: 10.5 };
}

const pos = new THREE.Vector3();
const q = new THREE.Quaternion();
const qLand = new THREE.Quaternion();

// Pose `tau` seconds after the disarm: writes the sword matrix, its grip point and blade axis.
export function flightPose(F, tau, matrix, grip, dir) {
  if (tau < F.tl) {
    pos.copy(F.g0).addScaledVector(F.v0, tau);
    pos.y -= 4.905 * tau * tau;
    q.setFromAxisAngle(F.axis, F.spin * tau).multiply(F.q0);
  } else {
    const s = Math.min(1, (tau - F.tl) / 0.35);
    qLand.setFromAxisAngle(F.axis, F.spin * F.tl).multiply(F.q0);
    q.copy(qLand).slerp(F.qFlat, 1 - (1 - s) * (1 - s));
    pos.copy(F.land).addScaledVector(F.v0.clone().setY(0).normalize(), 0.25 * (1 - (1 - s) ** 2));
    pos.y = 0.016 + Math.sin(Math.PI * s) * 0.09 * (1 - s);
  }
  matrix.compose(pos, q, ONE);
  grip.copy(pos);
  dir.set(0, 1, 0).applyQuaternion(q);
}
