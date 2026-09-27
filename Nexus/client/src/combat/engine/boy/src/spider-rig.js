// 4b кръг 2 (Nexus порт, НЕ част от оригиналния boy) — паяк: цефалотораx + коремче (2 твърди
// парчета, не сплайн-лято тяло — два ясно различими "блоба" вече четат органично без загуба на
// време за скининг), 8 стави крака с 2-bone IK (преизползва solveTwoBone от rig.js — същия
// принцип като BeastRig, само 4 чифта вместо 2).
import * as THREE from 'three';
import { solveTwoBone } from './rig.js';

const UP = new THREE.Vector3(0, 1, 0);
const AX = new THREE.Vector3(1, 0, 0);
const ONE = new THREE.Vector3(1, 1, 1);
const t1 = new THREE.Vector3();
const t2 = new THREE.Vector3();
const bx = new THREE.Vector3();
const by = new THREE.Vector3();
const bz = new THREE.Vector3();
const qa = new THREE.Quaternion();
const qb = new THREE.Quaternion();

const V = () => new THREE.Vector3();
const P = () => ({ matrix: new THREE.Matrix4() });

function setSegment(part, J, K, pole) {
  by.subVectors(J, K).normalize();
  bz.copy(pole).addScaledVector(by, -pole.dot(by));
  if (bz.lengthSq() < 1e-8) bz.set(0, 0, 1).addScaledVector(by, -by.z);
  bz.normalize();
  bx.crossVectors(by, bz);
  part.matrix.makeBasis(bx, by, bz);
  part.matrix.setPosition(J);
}

// Ъгли на 8-те крака около цефалотораx-а: 4 чифта, от предно-странично до задно-странично.
const LEG_ANGLES = [-1.1, -0.55, 0.1, 0.65];

export class SpiderRig {
  constructor(species) {
    this.S = species;
    this.parts = { cephalo: P(), abdomen: P(), jawL: P(), jawR: P() };
    for (let i = 0; i < 8; i++) { this.parts[`legUpper${i}`] = P(); this.parts[`legLower${i}`] = P(); this.parts[`legPaw${i}`] = P(); }
    this.w = {
      head: V(), snoutTip: V(), pelvis: V(), spine: V(), chest: V(), kneeR: V(),
      shoulderR: V(), shoulderL: V(), qHead: new THREE.Quaternion(),
    };
    this.legAnchors = Array.from({ length: 8 }, () => V());
    this.colliders = Array.from({ length: 4 }, () => ({ c: V(), r: 0.1 }));
    this.capeAnchorsWorld = [];
    this._pole = V();
    // 4b QA (кръг 2, поправка): `fwd`/`local` НЕ трябва да делят t1/t2 с останалата update() —
    // t1 се презаписва по-надолу (toTarget, jaw), което тихо чупеше fwd за целия крачен цикъл
    // (всичките 8 крака хвърляше на ~1 юнит от тялото, на земята — паякът рендираше само 2
    // "балона" без нито един видим крак). Собствени полета, по конвенцията на BeastRig._fwd.
    this._fwd = V();
    this._local = V();
    // cephaloPos се чете чак в крачния цикъл, след КАТО t2 вече е преизползван 4+ пъти
    // (shoulderR/L, jaw dir) — трябваше собствен вектор, не псевдоним на споделен scratch.
    this._cephaloPos = V();
  }

  // P: { root(pos), yaw, hipY, headTarget, lunge, biteOpen, flinch, legs:[8 x {pos,yaw,pitch}] }
  update(P) {
    const S = this.S;
    const w = this.w;
    const p = this.parts;
    const flinch = P.flinch || 0;
    const q = qa.setFromAxisAngle(UP, P.yaw);
    const fwd = this._fwd.set(0, 0, 1).applyQuaternion(q);
    const cephaloPos = this._cephaloPos.set(P.root.x, P.root.y + P.hipY, P.root.z).addScaledVector(fwd, S.abdomenR * 0.6);
    p.cephalo.matrix.compose(cephaloPos, q, ONE);
    w.spine.copy(cephaloPos);
    w.chest.copy(cephaloPos);
    w.shoulderR.copy(cephaloPos).addScaledVector(t2.set(1, 0, 0).applyQuaternion(q), S.cephaloR);
    w.shoulderL.copy(cephaloPos).addScaledVector(t2.set(-1, 0, 0).applyQuaternion(q), S.cephaloR);

    const abdomenPos = cephaloPos.clone().addScaledVector(fwd, -(S.cephaloR + S.waistLen + S.abdomenR * 0.7));
    const bob = Math.sin((P.breath || 0) * Math.PI) * 0.008;
    abdomenPos.y += bob - flinch * 0.02;
    const qAbd = qb.copy(q).multiply(qa.setFromAxisAngle(AX, -0.12 - flinch * 0.2));
    p.abdomen.matrix.compose(abdomenPos, qAbd, ONE);
    w.pelvis.copy(abdomenPos);
    w.kneeR.copy(abdomenPos);

    // Head/bite target — fangs at the front of the cephalothorax, tracks headTarget like BeastRig.
    const headBase = cephaloPos.clone().addScaledVector(fwd, S.cephaloR * 0.85);
    const toTarget = t1.subVectors(P.headTarget, headBase).applyQuaternion(qb.copy(q).invert());
    const yaw = THREE.MathUtils.clamp(Math.atan2(toTarget.x, toTarget.z), -0.7, 0.7);
    const pitch = THREE.MathUtils.clamp(Math.atan2(-toTarget.y, Math.hypot(toTarget.x, toTarget.z)), -0.5, 0.5);
    w.qHead.copy(q).multiply(qa.setFromAxisAngle(UP, yaw)).multiply(qa.setFromAxisAngle(AX, pitch));
    const reach = S.fangLen + (P.lunge || 0) * S.fangLen * 2.5;
    const dir = t2.set(0, 0, 1).applyQuaternion(w.qHead);
    w.head.copy(headBase);
    w.snoutTip.copy(headBase).addScaledVector(dir, S.headR * 0.6 + reach);
    const open = (P.biteOpen || 0) * 0.35;
    for (const [part, side] of [[p.jawL, -1], [p.jawR, 1]]) {
      const jq = qb.copy(w.qHead).multiply(qa.setFromAxisAngle(UP, side * (0.25 + open)));
      part.matrix.compose(headBase.clone().addScaledVector(dir, S.headR * 0.5).addScaledVector(t1.set(side, 0, 0).applyQuaternion(w.qHead), S.headR * 0.3), jq, ONE);
    }

    for (let i = 0; i < 8; i++) {
      const side = i < 4 ? -1 : 1;
      const angle = LEG_ANGLES[i % 4];
      const local = this._local.set(Math.sin(angle) * S.cephaloR * side * -1, 0, Math.cos(angle) * S.cephaloR).applyQuaternion(q);
      const anchor = this.legAnchors[i].copy(cephaloPos).add(local).addScaledVector(t2.set(side, 0, 0).applyQuaternion(q), S.cephaloR * 0.55);
      this.leg(i, anchor, P.legs[i], fwd);
    }
    this.updateColliders();
  }

  leg(i, anchor, foot, fwd) {
    const S = this.S;
    const p = this.parts;
    const mid = this._tmp2 || (this._tmp2 = new THREE.Vector3());
    const end = this._tmp3 || (this._tmp3 = new THREE.Vector3());
    const pole = this._pole.copy(fwd).addScaledVector(UP, -0.3).normalize();
    const a = S.legLen * 0.52;
    const b = S.legLen * 0.48;
    solveTwoBone(anchor, foot.pos, a, b, pole, mid, end);
    setSegment(p[`legUpper${i}`], anchor, mid, pole);
    setSegment(p[`legLower${i}`], mid, end, pole);
    p[`legPaw${i}`].matrix.makeBasis(bx, by, bz).setPosition(foot.pos);
  }

  updateColliders() {
    const w = this.w;
    const c = this.colliders;
    const S = this.S;
    const set = (i, v, r) => { c[i].c.copy(v); c[i].r = r; };
    set(0, w.spine, S.cephaloR);
    set(1, w.pelvis, S.abdomenR);
    set(2, w.head, S.headR * 0.6);
    set(3, w.snoutTip, S.headR * 0.2);
  }
}
