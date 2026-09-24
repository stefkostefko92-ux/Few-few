// Procedural skeleton: torso chain from quaternions, analytic two-bone IK for arms and legs.
import * as THREE from 'three';

export const DIM = { upper: 0.29, fore: 0.27, thigh: 0.45, shin: 0.43, ankle: 0.09, grip: 0.072 };

const UP = new THREE.Vector3(0, 1, 0);
const AX = new THREE.Vector3(1, 0, 0);
const AZ = new THREE.Vector3(0, 0, 1);
const ONE = new THREE.Vector3(1, 1, 1);

const t1 = new THREE.Vector3();
const t2 = new THREE.Vector3();
const bx = new THREE.Vector3();
const by = new THREE.Vector3();
const bz = new THREE.Vector3();
const qa = new THREE.Quaternion();
const qb = new THREE.Quaternion();

export function solveTwoBone(root, target, a, b, pole, outMid, outEnd) {
  const dir = t1.subVectors(target, root);
  let len = dir.length();
  if (len < 1e-5) dir.set(0, -1, 0);
  else dir.divideScalar(len);
  len = Math.min(Math.max(len, Math.abs(a - b) + 1e-3), a + b - 1e-3);
  const cosA = (a * a + len * len - b * b) / (2 * a * len);
  const sinA = Math.sqrt(Math.max(0, 1 - cosA * cosA));
  const pv = t2.copy(pole).addScaledVector(dir, -pole.dot(dir));
  if (pv.lengthSq() < 1e-8) pv.set(0, 0, 1).addScaledVector(dir, -dir.z);
  pv.normalize();
  outMid.copy(root).addScaledVector(dir, a * cosA).addScaledVector(pv, a * sinA);
  outEnd.copy(root).addScaledVector(dir, len);
}

// Parts are plain { matrix } records; mirrored limbs carry mirrored geometry instead of a
// negative scale, so every matrix here is a pure rotation plus translation.
function setSegment(obj, J, K, pole) {
  by.subVectors(J, K).normalize();
  bz.copy(pole).addScaledVector(by, -pole.dot(by));
  if (bz.lengthSq() < 1e-8) bz.set(0, 0, 1).addScaledVector(by, -by.z);
  bz.normalize();
  bx.crossVectors(by, bz);
  obj.matrix.makeBasis(bx, by, bz);
  obj.matrix.setPosition(J);
}

function setBasis(obj, pos, x, y) {
  bz.crossVectors(x, y);
  obj.matrix.makeBasis(x, y, bz);
  obj.matrix.setPosition(pos);
}

function setPose(obj, pos, q) {
  obj.matrix.compose(pos, q, ONE);
}

const tm = new THREE.Matrix4();
const rm = new THREE.Matrix4();

const V = () => new THREE.Vector3();

export class Rig {
  constructor(knight) {
    this.k = knight;
    this.w = {
      pelvis: V(), spine: V(), chest: V(), neck: V(), head: V(),
      qPelvis: new THREE.Quaternion(), qChest: new THREE.Quaternion(), qHead: new THREE.Quaternion(),
      shoulderR: V(), shoulderL: V(), elbowR: V(), elbowL: V(), wristR: V(), wristL: V(),
      hipR: V(), hipL: V(), kneeR: V(), kneeL: V(), ankleR: V(), ankleL: V(),
    };
    this.colliders = Array.from({ length: 12 }, () => ({ c: V(), r: 0.1 }));
    this.capeAnchorsWorld = knight.capeAnchors.map(() => V());
    this._pole = V();
    this._tmp = V();
    this._fwd = V();
  }

  update(P) {
    const w = this.w;
    const parts = this.k.parts;
    // Torso chain.
    w.qPelvis.setFromAxisAngle(UP, P.yaw + P.pelvisYaw);
    w.qPelvis.multiply(qa.setFromAxisAngle(AX, P.lean * 0.25 + P.pelvisPitch));
    w.qPelvis.multiply(qa.setFromAxisAngle(AZ, P.pelvisRoll));
    w.pelvis.set(P.root.x, P.root.y + P.hipY, P.root.z);
    setPose(parts.pelvis, w.pelvis, w.qPelvis);

    const qSpine = qb.copy(w.qPelvis);
    qSpine.multiply(qa.setFromAxisAngle(UP, P.twist * 0.45));
    qSpine.multiply(qa.setFromAxisAngle(AX, P.lean * 0.4));
    qSpine.multiply(qa.setFromAxisAngle(AZ, P.side * 0.5));
    w.spine.set(0, 0.1, 0).applyQuaternion(w.qPelvis).add(w.pelvis);
    w.qChest.copy(qSpine);
    w.qChest.multiply(qa.setFromAxisAngle(UP, P.twist * 0.55));
    w.qChest.multiply(qa.setFromAxisAngle(AX, P.lean * 0.45 + P.breath * 0.015));
    w.qChest.multiply(qa.setFromAxisAngle(AZ, P.side * 0.5));
    w.chest.set(0, 0.145, 0).applyQuaternion(qSpine).add(w.spine);
    setPose(parts.chest, w.chest, w.qChest);

    // Head tracks its target inside anatomical limits.
    w.neck.set(0, 0.225, -0.012).applyQuaternion(w.qChest).add(w.chest);
    const dl = this._tmp.subVectors(P.headTarget, w.neck).applyQuaternion(qa.copy(w.qChest).invert());
    const yaw = THREE.MathUtils.clamp(Math.atan2(dl.x, dl.z), -1.1, 1.1);
    const pitch = THREE.MathUtils.clamp(Math.atan2(-(dl.y - 0.08), Math.hypot(dl.x, dl.z)), -0.5, 0.8);
    w.qHead.copy(w.qChest);
    w.qHead.multiply(qa.setFromAxisAngle(UP, yaw + P.headYaw));
    w.qHead.multiply(qa.setFromAxisAngle(AX, pitch + P.headPitch));
    w.qHead.multiply(qa.setFromAxisAngle(AZ, P.headRoll));
    qb.copy(w.qChest).slerp(w.qHead, 0.5);
    w.head.set(0, 0.075, 0.012).applyQuaternion(qb).add(w.neck);
    setPose(parts.head, w.head, w.qHead);

    // Shoulders ride forward and up with the reach.
    w.shoulderR.set(-0.185, 0.17, -0.015).applyQuaternion(w.qChest).add(w.chest);
    w.shoulderL.set(0.185, 0.17, -0.015).applyQuaternion(w.qChest).add(w.chest);
    this.arm('R', P.handR, P);
    this.arm('L', P.handL, P);

    this.leg('R', P.feet[1], P);
    this.leg('L', P.feet[0], P);
    this.tassets();
    this.updateColliders();
    for (let i = 0; i < this.k.capeAnchors.length; i++) {
      this.capeAnchorsWorld[i].copy(this.k.capeAnchors[i]).applyQuaternion(w.qChest).add(w.chest);
    }
  }

  // hand = { grip: Vector3, x: Vector3, y: Vector3 } in world space (x towards knuckles, y along grip).
  arm(side, hand, P) {
    const w = this.w;
    const parts = this.k.parts;
    const R = side === 'R';
    const S = R ? w.shoulderR : w.shoulderL;
    const E = R ? w.elbowR : w.elbowL;
    const W = R ? w.wristR : w.wristL;
    const wristTarget = this._tmp.copy(hand.grip).addScaledVector(hand.x, -DIM.grip);
    const reach = S.distanceTo(wristTarget);
    const k = THREE.MathUtils.clamp((reach - 0.38) / 0.2, 0, 1);
    S.addScaledVector(t1.subVectors(wristTarget, S).normalize(), 0.035 * k);
    S.y += 0.02 * THREE.MathUtils.clamp((wristTarget.y - S.y) / 0.3, 0, 1);
    const eo = R ? 0 : P.elbowOut || 0;
    const pole = this._pole.set(R ? -0.6 : 0.6 + 0.5 * eo, -1 + 0.4 * eo, -0.35 + 0.8 * eo).applyQuaternion(w.qChest).normalize();
    solveTwoBone(S, wristTarget, DIM.upper, DIM.fore, pole, E, W);
    setSegment(R ? parts.upperArmR : parts.upperArmL, S, E, pole);
    setSegment(R ? parts.foreArmR : parts.foreArmL, E, W, pole);
    setBasis(R ? parts.handR : parts.handL, wristTarget, hand.x, hand.y);
  }

  // foot = { pos: ankle world position, yaw, pitch }.
  leg(side, foot, P) {
    const w = this.w;
    const parts = this.k.parts;
    const R = side === 'R';
    const H = R ? w.hipR : w.hipL;
    const K = R ? w.kneeR : w.kneeL;
    const A = R ? w.ankleR : w.ankleL;
    H.set(R ? -0.1 : 0.1, -0.06, 0).applyQuaternion(w.qPelvis).add(w.pelvis);
    const fwd = this._fwd.set(Math.sin(foot.yaw), 0, Math.cos(foot.yaw));
    const out = t2.set(R ? -1 : 1, 0, 0).applyQuaternion(w.qPelvis);
    const pole = this._pole.copy(fwd).addScaledVector(out, 0.22).addScaledVector(UP, -0.25 * (P.kneel || 0)).normalize();
    solveTwoBone(H, foot.pos, DIM.thigh, DIM.shin, pole, K, A);
    setSegment(R ? parts.thighR : parts.thighL, H, K, pole);
    setSegment(R ? parts.shinR : parts.shinL, K, A, pole);
    const cp = Math.cos(foot.pitch);
    const sp = Math.sin(foot.pitch);
    bz.copy(fwd).multiplyScalar(cp).addScaledVector(UP, sp);
    by.copy(UP).multiplyScalar(cp).addScaledVector(fwd, -sp);
    bx.crossVectors(by, bz);
    const f = R ? parts.footR : parts.footL;
    f.matrix.makeBasis(bx, by, bz);
    f.matrix.setPosition(foot.pos);
  }

  tassets() {
    const w = this.w;
    const parts = this.k.parts;
    const inv = qa.copy(w.qPelvis).invert();
    const sides = [
      [w.hipR, w.kneeR, parts.tassetR, this.k.tassetHinges[0]],
      [w.hipL, w.kneeL, parts.tassetL, this.k.tassetHinges[1]],
    ];
    for (const [H, K, t, hinge] of sides) {
      const d = t1.subVectors(K, H).applyQuaternion(inv);
      const pitch = Math.atan2(d.z, -d.y);
      const ang = THREE.MathUtils.clamp(-pitch * 0.65, -1.2, 0.35);
      t.matrix.copy(parts.pelvis.matrix).multiply(tm.makeTranslation(hinge.x, hinge.y, hinge.z)).multiply(rm.makeRotationX(ang));
    }
  }

  updateColliders() {
    const w = this.w;
    const c = this.colliders;
    const set = (i, v, r) => {
      c[i].c.copy(v);
      c[i].r = r;
    };
    set(0, t1.set(0, 0.02, -0.02).applyQuaternion(w.qChest).add(w.chest), 0.2);
    set(1, t1.set(0, 0.16, -0.03).applyQuaternion(w.qChest).add(w.chest), 0.17);
    set(2, t1.set(0, -0.08, -0.01).applyQuaternion(w.qPelvis).add(w.pelvis), 0.21);
    set(3, w.shoulderR, 0.12);
    set(4, w.shoulderL, 0.12);
    set(5, t1.addVectors(w.hipR, w.kneeR).multiplyScalar(0.5), 0.1);
    set(6, t1.addVectors(w.hipL, w.kneeL).multiplyScalar(0.5), 0.1);
    set(7, w.kneeR, 0.085);
    set(8, w.kneeL, 0.085);
    set(9, t1.addVectors(w.kneeR, w.ankleR).multiplyScalar(0.5), 0.075);
    set(10, t1.addVectors(w.kneeL, w.ankleL).multiplyScalar(0.5), 0.075);
    set(11, w.head, 0.16);
  }
}
