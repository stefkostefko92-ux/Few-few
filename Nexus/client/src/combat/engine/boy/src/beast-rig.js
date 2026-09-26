// 4b (Nexus порт, НЕ част от оригиналния boy) — процедурен риг на четириног звяр (плъх/глиган/
// вълк — beast-config.js). Същия принцип като rig.js (Rig): части = { matrix: Matrix4 }, четени
// директно от RigidBatcher; IK на краката преизползва solveTwoBone от rig.js (чист вход/изход,
// анатомично неутрален — работи еднакво добре за ръка и за лапа).
import * as THREE from 'three';
import { solveTwoBone } from './rig.js';

const UP = new THREE.Vector3(0, 1, 0);
const AX = new THREE.Vector3(1, 0, 0);
const AZ = new THREE.Vector3(0, 0, 1);
const ONE = new THREE.Vector3(1, 1, 1);
const MIRROR_X = new THREE.Vector3(-1, 1, 1);
const t1 = new THREE.Vector3();
const t2 = new THREE.Vector3();
const bx = new THREE.Vector3();
const by = new THREE.Vector3();
const bz = new THREE.Vector3();
const qa = new THREE.Quaternion();
const qb = new THREE.Quaternion();

const V = () => new THREE.Vector3();
const P = () => ({ matrix: new THREE.Matrix4() });

// Poses a limb segment: origin at the proximal joint J, local -Y points at the distal joint K
// (mesh is authored hanging down from y=0 to y=-length — same convention as rig.js setSegment).
function setSegment(part, J, K, pole) {
  by.subVectors(J, K).normalize();
  bz.copy(pole).addScaledVector(by, -pole.dot(by));
  if (bz.lengthSq() < 1e-8) bz.set(0, 0, 1).addScaledVector(by, -by.z);
  bz.normalize();
  bx.crossVectors(by, bz);
  part.matrix.makeBasis(bx, by, bz);
  part.matrix.setPosition(J);
}
function setPose(part, pos, q, s = ONE) {
  part.matrix.compose(pos, q, s);
}

export class BeastRig {
  constructor(species) {
    this.S = species;
    this.parts = {
      pelvis: P(), spine: P(), head: P(), jaw: P(), earL: P(), earR: P(),
      tailA: P(), tailB: P(), tailC: P(),
      frontUpperR: P(), frontLowerR: P(), frontPawR: P(),
      frontUpperL: P(), frontLowerL: P(), frontPawL: P(),
      rearUpperR: P(), rearLowerR: P(), rearPawR: P(),
      rearUpperL: P(), rearLowerL: P(), rearPawL: P(),
      ...(species.wings ? { wingL: P(), wingR: P() } : {}),
    };
    this.w = {
      pelvis: V(), spine: V(), head: V(), snoutTip: V(),
      shoulderR: V(), shoulderL: V(), hipR: V(), hipL: V(),
      qPelvis: new THREE.Quaternion(), qSpine: new THREE.Quaternion(), qHead: new THREE.Quaternion(),
    };
    // Aliases so the human-shaped FX/camera code (events.js/world.js splashOnArmour) that reads
    // rig.w.chest / rig.w.kneeR keeps working unmodified against a quadruped rig.
    this.w.chest = this.w.spine;
    this.w.kneeR = this.w.hipR;
    this.colliders = Array.from({ length: 6 }, () => ({ c: V(), r: 0.1 }));
    this.capeAnchorsWorld = [];
    this._tmp = V();
    this._pole = V();
    this._fwd = V();
  }

  // P: { root(pos), yaw, hipY, spineBend, breath, headTarget, lunge, biteOpen, flinch, tailWag,
  //      earAlert, feet:[{pos,yaw,pitch} x4 order fR,fL,rR,rL] }
  update(P) {
    const S = this.S;
    const w = this.w;
    const p = this.parts;
    const flinch = P.flinch || 0;
    w.qPelvis.setFromAxisAngle(UP, P.yaw);
    w.qPelvis.multiply(qa.setFromAxisAngle(AX, -0.08 * flinch));
    w.pelvis.set(P.root.x, P.root.y + P.hipY, P.root.z);
    setPose(p.pelvis, w.pelvis, w.qPelvis);

    const fwd = this._fwd.set(0, 0, 1).applyQuaternion(w.qPelvis);
    const arch = (P.spineBend || 0) + Math.sin((P.breath || 0) * Math.PI) * 0.03;
    w.spine.copy(w.pelvis).addScaledVector(fwd, S.bodyLen * 0.62).addScaledVector(UP, arch);
    w.qSpine.copy(w.qPelvis);
    w.qSpine.multiply(qa.setFromAxisAngle(AX, -arch * 1.4 - 0.05 * (P.lunge || 0)));
    setPose(p.spine, w.spine, w.qSpine);

    // Head/neck: looks at headTarget within an anatomical cone, lunges forward when attacking.
    const neckBase = t1.copy(w.spine).addScaledVector(fwd, S.bodyLen * 0.3).addScaledVector(UP, S.neckLen * 0.3);
    const toTarget = this._tmp.subVectors(P.headTarget, neckBase).applyQuaternion(qa.copy(w.qSpine).invert());
    const yaw = THREE.MathUtils.clamp(Math.atan2(toTarget.x, toTarget.z), -0.9, 0.9);
    const pitch = THREE.MathUtils.clamp(Math.atan2(-toTarget.y, Math.hypot(toTarget.x, toTarget.z)), -0.7, 0.6);
    w.qHead.copy(w.qSpine);
    w.qHead.multiply(qa.setFromAxisAngle(UP, yaw));
    w.qHead.multiply(qa.setFromAxisAngle(AX, pitch));
    const reach = S.neckLen + (P.lunge || 0) * S.reach * 0.55;
    w.head.copy(neckBase).addScaledVector(t2.set(0, 0, 1).applyQuaternion(w.qHead), reach);
    setPose(p.head, w.head, w.qHead);
    w.snoutTip.copy(w.head).addScaledVector(t2.set(0, 0, 1).applyQuaternion(w.qHead), S.snoutLen + S.reach * 0.15);

    const jawQ = qa.copy(w.qHead).multiply(qb.setFromAxisAngle(AX, (P.biteOpen || 0) * 0.62));
    setPose(p.jaw, w.head.clone().addScaledVector(t2.set(0, 0, 1).applyQuaternion(w.qHead), S.snoutLen * 0.3), jawQ);

    const earAlert = P.earAlert ?? 1 - flinch * 0.7;
    for (const [part, side] of [[p.earL, -1], [p.earR, 1]]) {
      const q = qa.copy(w.qHead).multiply(qb.setFromAxisAngle(AX, -0.3 - 0.5 * earAlert)).multiply(qb.setFromAxisAngle(UP, side * 0.35));
      setPose(part, w.head.clone().addScaledVector(UP, S.headR * 0.7).addScaledVector(t2.set(1, 0, 0).applyQuaternion(w.qHead), side * S.headR * 0.5), q);
    }

    this.tail(P, fwd);
    this.leg('frontR', w.shoulderR.copy(w.spine).addScaledVector(fwd, S.bodyLen * 0.32).addScaledVector(t2.set(1, 0, 0).applyQuaternion(w.qSpine), -S.bodyR * 0.7), P.feet[0], S.legLen * 0.56, S.legLen * 0.44, p.frontUpperR, p.frontLowerR, p.frontPawR, fwd);
    this.leg('frontL', w.shoulderL.copy(w.spine).addScaledVector(fwd, S.bodyLen * 0.32).addScaledVector(t2.set(1, 0, 0).applyQuaternion(w.qSpine), S.bodyR * 0.7), P.feet[1], S.legLen * 0.56, S.legLen * 0.44, p.frontUpperL, p.frontLowerL, p.frontPawL, fwd);
    this.leg('rearR', w.hipR.copy(w.pelvis).addScaledVector(fwd, -S.bodyLen * 0.34).addScaledVector(t2.set(1, 0, 0).applyQuaternion(w.qPelvis), -S.bodyR * 0.65), P.feet[2], S.legLen * 0.5, S.legLen * 0.5, p.rearUpperR, p.rearLowerR, p.rearPawR, fwd);
    this.leg('rearL', w.hipL.copy(w.pelvis).addScaledVector(fwd, -S.bodyLen * 0.34).addScaledVector(t2.set(1, 0, 0).applyQuaternion(w.qPelvis), S.bodyR * 0.65), P.feet[3], S.legLen * 0.5, S.legLen * 0.5, p.rearUpperL, p.rearLowerL, p.rearPawL, fwd);
    if (S.wings) this.wings(P, fwd);
    this.updateColliders();
  }

  // Дракон: две мембранни "крила" на раменете — flap (0=прибрани до тялото, 1=разперени) плюс
  // бавно махане в purely покой (реещ полет илюзия), по-бързо при lunge (атака).
  wings(P, fwd) {
    const w = this.w;
    const p = this.parts;
    const flap = (P.wingFlap ?? 0.35) + Math.sin((P.tailWag || 0) * 2.4) * 0.12 * (1 - (P.lunge || 0));
    const out = t2.set(1, 0, 0);
    for (const [part, side] of [[p.wingL, -1], [p.wingR, 1]]) {
      out.set(side, 0, 0).applyQuaternion(w.qSpine);
      const spread = 0.25 + flap * 1.1;
      // Геометрията на крилото е моделирана по +X. Лявото се огледва (scale.x = -1), а ъгълът
      // вдига +X НАГОРЕ (side * spread) — със знак минус двете крила висяха под тялото като завеса.
      const q = qa.copy(w.qSpine)
        .multiply(qb.setFromAxisAngle(AZ, side * spread))
        .multiply(qb.setFromAxisAngle(UP, -side * 0.15));
      const root = w.spine.clone().addScaledVector(fwd, this.S.bodyLen * 0.22).addScaledVector(out, this.S.bodyR * 0.75).addScaledVector(UP, this.S.bodyR * 0.3);
      setPose(part, root, q, side < 0 ? MIRROR_X : ONE);
    }
  }

  tail(P, fwd) {
    const S = this.S;
    const w = this.w;
    const p = this.parts;
    const wag = P.tailWag || 0;
    const tuck = P.flinch || 0;
    let base = w.pelvis.clone().addScaledVector(fwd, -S.bodyLen * 0.55).addScaledVector(UP, S.bodyR * 0.3);
    let q = qa.copy(w.qPelvis);
    const segLen = S.tailLen / 3;
    const parts = [p.tailA, p.tailB, p.tailC];
    for (let i = 0; i < 3; i++) {
      const sway = Math.sin(wag * 6.2 + i * 1.1) * (0.25 + i * 0.12) * (1 - tuck * 0.6);
      q = qb.copy(q).multiply(qa.setFromAxisAngle(UP, sway)).multiply(qa.setFromAxisAngle(AX, 0.18 + tuck * 0.5));
      setPose(parts[i], base, q);
      base = base.clone().addScaledVector(t2.set(0, 0, -1).applyQuaternion(q), segLen);
    }
  }

  // foot = { pos: world ankle target, yaw, pitch }. Same two-bone solve as the knight rig.
  leg(name, anchor, foot, a, b, upperPart, lowerPart, pawPart, fwd) {
    const mid = this._tmp2 || (this._tmp2 = new THREE.Vector3());
    const end = this._tmp3 || (this._tmp3 = new THREE.Vector3());
    const pole = this._pole.copy(fwd).addScaledVector(UP, -0.4).normalize();
    solveTwoBone(anchor, foot.pos, a, b, pole, mid, end);
    setSegment(upperPart, anchor, mid, pole);
    setSegment(lowerPart, mid, end, pole);
    const cp = Math.cos(foot.pitch);
    const sp = Math.sin(foot.pitch);
    bz.copy(fwd).multiplyScalar(cp).addScaledVector(UP, sp);
    by.copy(UP).multiplyScalar(cp).addScaledVector(fwd, -sp);
    bx.crossVectors(by, bz);
    pawPart.matrix.makeBasis(bx, by, bz);
    pawPart.matrix.setPosition(foot.pos);
  }

  updateColliders() {
    const w = this.w;
    const c = this.colliders;
    const S = this.S;
    const set = (i, v, r) => { c[i].c.copy(v); c[i].r = r; };
    set(0, w.pelvis, S.bodyR * 1.1);
    set(1, w.spine, S.bodyR);
    set(2, w.head, S.headR);
    set(3, w.shoulderR, S.bodyR * 0.5);
    set(4, w.shoulderL, S.bodyR * 0.5);
    set(5, w.snoutTip, S.snoutR);
  }
}
