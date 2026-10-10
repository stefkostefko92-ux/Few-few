// 4b кръг 2 (Nexus порт, НЕ част от оригиналния boy) — сегментирана змийска верига: без крака,
// S-вълна при пълзене, изправя предната половина + удар напред при атака (P.lunge). Всеки
// сегмент е {matrix}, четен от RigidBatcher — същия принцип като BeastRig (beast-rig.js), само
// без leg IK (solveTwoBone не участва тук — тялото Е крайниците).
import * as THREE from 'three';

const UP = new THREE.Vector3(0, 1, 0);
const AX = new THREE.Vector3(1, 0, 0);
const ONE = new THREE.Vector3(1, 1, 1);
const t1 = new THREE.Vector3();
const t2 = new THREE.Vector3();
const bx = new THREE.Vector3();
const qa = new THREE.Quaternion();
const qb = new THREE.Quaternion();

const V = () => new THREE.Vector3();
const P = () => ({ matrix: new THREE.Matrix4() });
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

export class SerpentRig {
  constructor(species) {
    this.S = species;
    this.parts = { head: P(), jaw: P() };
    for (let i = 0; i < species.segCount; i++) this.parts[`seg${i}`] = P();
    this.w = { head: V(), snoutTip: V(), pelvis: V(), spine: V(), chest: V(), kneeR: V(), shoulderR: V(), shoulderL: V(), qHead: new THREE.Quaternion() };
    // Aliases for the human-shaped FX/camera code that expects rig.w.{chest,pelvis,kneeR,...}.
    this.points = Array.from({ length: species.segCount + 1 }, () => V());
    this.colliders = Array.from({ length: 5 }, () => ({ c: V(), r: 0.1 }));
    this.capeAnchorsWorld = [];
  }

  // P: { root(pos), yaw, headTarget, lunge, biteOpen, flinch, waveT, rearUp }
  update(P) {
    const S = this.S;
    const w = this.w;
    const pts = this.points;
    const n = S.segCount;
    const fwd = t1.set(Math.sin(P.yaw), 0, Math.cos(P.yaw));
    const right = t2.set(fwd.z, 0, -fwd.x);
    const rearUp = P.rearUp ?? 0;
    for (let i = 0; i <= n; i++) {
      const u = i / n;
      const taper = i === 0 ? S.segProfile[0] : S.segProfile[Math.min(n - 1, i - 1)];
      const wave = Math.sin((P.waveT || 0) * S.waveSpeed - i * S.waveK) * S.waveAmp * taper * (1 - rearUp * 0.7);
      const rise = rearUp * S.rearLift * smooth(S.rearPivot, 1, u) * S.segLen * n * 0.55;
      pts[i].copy(P.root).addScaledVector(fwd, i * S.segLen).addScaledVector(right, wave).addScaledVector(UP, rise + S.segR * 0.5);
    }
    for (let i = 0; i < n; i++) {
      const a = pts[i];
      const b = pts[i + 1];
      const tangent = t1.subVectors(b, a).normalize();
      bx.crossVectors(UP, tangent);
      if (bx.lengthSq() < 1e-6) bx.set(1, 0, 0);
      bx.normalize();
      const up2 = t2.crossVectors(tangent, bx).normalize();
      const mid = new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5);
      this.parts[`seg${i}`].matrix.makeBasis(bx, up2, tangent).setPosition(mid);
      if (i === n - 1) w.head.copy(b);
      if (i === Math.floor(n * 0.5)) w.spine.copy(mid);
      if (i === 1) w.pelvis.copy(mid);
    }
    // Head: aims at headTarget (opponent) within a cone, extra reach on lunge.
    const headBase = pts[n];
    const toTarget = t1.subVectors(P.headTarget, headBase);
    const baseYaw = Math.atan2(toTarget.x, toTarget.z);
    const pitch = THREE.MathUtils.clamp(Math.atan2(-toTarget.y, Math.hypot(toTarget.x, toTarget.z)), -0.6, 0.7);
    w.qHead.setFromAxisAngle(UP, baseYaw);
    w.qHead.multiply(qa.setFromAxisAngle(AX, pitch));
    const reach = S.snoutLen + (P.lunge || 0) * S.snoutLen * 2.2;
    const dir = t2.set(0, 0, 1).applyQuaternion(w.qHead);
    w.head.copy(headBase).addScaledVector(dir, reach * 0.3);
    this.parts.head.matrix.compose(w.head, w.qHead, ONE);
    w.snoutTip.copy(w.head).addScaledVector(dir, S.snoutLen + reach * 0.5);
    const jawQ = qb.copy(w.qHead).multiply(qa.setFromAxisAngle(AX, (P.biteOpen || 0) * 0.7));
    this.parts.jaw.matrix.compose(w.head.clone().addScaledVector(dir, S.snoutLen * 0.4), jawQ, ONE);
    w.chest.copy(w.spine);
    w.kneeR.copy(w.pelvis);
    w.shoulderR.copy(w.spine);
    w.shoulderL.copy(w.spine);
    this.updateColliders();
  }

  updateColliders() {
    const w = this.w;
    const c = this.colliders;
    const S = this.S;
    const set = (i, v, r) => { c[i].c.copy(v); c[i].r = r; };
    set(0, this.points[Math.floor(this.S.segCount * 0.25)], S.segR);
    set(1, w.pelvis, S.segR);
    set(2, w.spine, S.segR);
    set(3, w.head, S.headR);
    set(4, w.snoutTip, S.snoutR);
  }
}
