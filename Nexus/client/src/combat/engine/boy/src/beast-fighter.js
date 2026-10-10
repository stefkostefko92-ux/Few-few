// 4b (Nexus порт, НЕ част от оригиналния boy) — движи BeastRig от СЪЩАТА timeline/choreo
// машина като fighter.js (weaponAt/rootOf от timeline.js): звярът няма ръка/меч, но choreo-gen*
// вече третира B_KEYS/aim/parry като абстрактна "крайна точка" (тук: захапка) — виж
// choreo-gen-attack.js beastAimTable(). Публичният интерфейс огледва Fighter достатъчно, за да
// го приемат непроменени world.js/events.js/director.js/main.js (виж коментарите долу за всяко
// поле, четено извън този файл).
import * as THREE from 'three';
import { BeastRig } from './beast-rig.js';
import { rootOf, toWorld, dirToWorld, weaponAt } from './timeline.js';
import { QUAD_BONES } from './beast-geo.js';

class Spring {
  constructor(k = 60, zeta = 0.5) { this.x = 0; this.v = 0; this.k = k; this.c = 2 * Math.sqrt(k) * zeta; }
  step(dt) { const h = Math.min(dt, 1 / 30); this.v += (-this.k * this.x - this.c * this.v) * h; this.x += this.v * h; }
  reset() { this.x = 0; this.v = 0; }
}

const UP = new THREE.Vector3(0, 1, 0);

export class BeastFighter {
  constructor(who, species, beastBody) {
    this.who = who;
    this.S = species;
    this.rig = beastBody.rig;
    // 4b кръг 2: skin.mesh/bones (beast-geo.js buildSkin) — торсото е THREE.SkinnedMesh, огъва
    // се тук всеки кадър от rig.w (виж update() долу), не през RigidBatcher.
    this.skin = beastBody.skin;
    // 4b: director.js/shot-builder.js четат това, за да свалят камерата/целта до звяра, вместо
    // да я рамкират на човешки ръст (виж beast-config.js standHeight по вид).
    this.standHeight = species.standHeight;
    this.root = { pos: new THREE.Vector3(), yaw: 0 };
    this.rootAhead = { pos: new THREE.Vector3(), yaw: 0 };
    this.vel = new THREE.Vector3();
    this.W = { p: new THREE.Vector3(), d: new THREE.Vector3(), e: new THREE.Vector3() };
    this.grip = new THREE.Vector3();
    this.dir = new THREE.Vector3(0, 0, 1);
    this.headTarget = new THREE.Vector3();
    this.bladeBase = new THREE.Vector3();
    this.bladeTip = new THREE.Vector3();
    // events.js reads shieldNormal/shieldCenter only for ev.type==='shield', which never fires
    // for a beast defender (hasShieldKit is always false for a beast kit) — kept as inert stubs
    // purely so an accidental future code path finds real Vector3s instead of undefined.
    this.shieldNormal = UP.clone();
    this.shieldCenter = new THREE.Vector3();
    this.feet = { onStep: null };
    this.cape = { mesh: new THREE.Group(), step() {} };
    this.P = { breath: 0 };
    this.spr = { flinch: new Spring(45, 0.55), kick: new Spring(70, 0.4) };
    this.pushDir = new THREE.Vector3();
    this.seed = who === 'A' ? 0.4 : 2.4;
    this.lastT = -1;
    this._feet = [0, 1, 2, 3].map(() => ({ pos: new THREE.Vector3(), yaw: 0, pitch: 0 }));
  }

  react(kind, power) {
    const s = this.spr;
    if (kind === 'helm' || kind === 'bash') { s.flinch.v += 2.6 * power; s.kick.v += 2.2 * power; }
    else if (kind === 'recoil' || kind === 'block') { s.flinch.v += 1.4 * power; }
  }

  resetDynamics() {
    Object.values(this.spr).forEach((s) => s.reset());
    this.lastT = -1;
  }

  landingTime() { return Infinity; } // a beast has nothing to disarm — events.js loop no-ops.

  // Four stance feet in the beast's own frame: [frontR, frontL, rearR, rearL]. Diagonal trot
  // (frontR+rearL vs frontL+rearR) driven by story time, not an accumulator — stateless, so a
  // scrub/jump never leaves the gait mid-stride out of phase with the body.
  planFeet(root, T, crouch) {
    const S = this.S;
    const sw = S.bodyR + S.legR * 1.4;
    const widen = 1 + crouch * 0.35;
    const local = [
      [-sw * widen, S.bodyLen * 0.3],
      [sw * widen, S.bodyLen * 0.3],
      [-sw * 0.92 * widen, -S.bodyLen * 0.32],
      [sw * 0.92 * widen, -S.bodyLen * 0.32],
    ];
    const speed = Math.min(1, this.vel.length() / 1.2);
    const phase0 = T * S.gaitHz * 6.2832;
    for (let i = 0; i < 4; i++) {
      const [x, z] = local[i];
      const phase = phase0 + (i === 0 || i === 3 ? 0 : Math.PI);
      const lift = speed > 0.04 ? Math.max(0, Math.sin(phase)) * 0.06 * speed : 0;
      toWorld(root, [x, 0, z], this._feet[i].pos);
      this._feet[i].pos.y = lift;
      this._feet[i].yaw = root.yaw;
      this._feet[i].pitch = 0;
    }
  }

  update(T, dt, other) {
    const who = this.who;
    const S = this.S;
    const jump = this.lastT < 0 || Math.abs(T - this.lastT) > 0.5;
    this.lastT = T;
    for (const s of Object.values(this.spr)) s.step(dt);

    rootOf(who, T, this.root);
    rootOf(who, T + 0.06, this.rootAhead);
    this.vel.subVectors(this.rootAhead.pos, this.root.pos).divideScalar(0.06);
    const root = this.root;

    weaponAt(who, T, this.W);
    const W = this.W;
    toWorld(root, [W.p.x, W.p.y, W.p.z], this.grip);
    dirToWorld(root, [W.d.x, W.d.y, W.d.z], this.dir);

    const strike = THREE.MathUtils.clamp(W.strike, 0, 1);
    const lungeW = THREE.MathUtils.smoothstep(strike, 0.12, 0.85);
    this.headTarget.copy(other.rig.w.head).lerp(this.grip, lungeW);

    const t = T + this.seed * 10;
    this.planFeet(root, T, W.crouch ?? 0.08);
    const flinch = THREE.MathUtils.clamp(this.spr.flinch.x * 0.4 + this.spr.kick.x * 0.25, 0, 1);
    const breath = Math.sin(t * 2.3) * 0.4 + 0.5;
    this.P.breath = breath;

    this.rig.update({
      root: root.pos,
      yaw: root.yaw,
      hipY: S.hipY * (1 - (W.crouch ?? 0) * 0.6 - flinch * 0.15),
      spineBend: Math.sin(t * 2.3) * 0.012 * S.scale + lungeW * 0.03,
      breath,
      headTarget: this.headTarget,
      lunge: lungeW,
      biteOpen: lungeW,
      flinch,
      tailWag: t * (jump ? 0 : 1),
      earAlert: 1 - flinch * 0.6,
      feet: this._feet,
      wingFlap: S.wings ? 0.3 + Math.max(0, Math.sin(t * S.gaitHz * 1.4)) * 0.35 + lungeW * 0.4 : 0,
    });

    this.bladeBase.copy(this.rig.w.head);
    this.bladeTip.copy(this.rig.w.snoutTip);
    this.pushDir.set(0, 0, 0);
    this.syncSkin();
  }

  // GPU linear-blend skinning: пишем СВЕТОВНИ матрици направо в bone.matrix (костите нямат
  // родител — mesh-ът остава identity, виж beast-geo.js buildOrganicBody/QUAD_BONES), после
  // форсираме updateMatrixWorld() СЕГА (не чакаме следващия renderer traversal) —
  // животоспасяващо за тестове/детерминистичен seek(), където няма render loop между кадрите.
  // 4b кръг 3: вече 20 кости (цялото тяло, не само таз/гръбнак/глава) — копираме direkt
  // rig.parts[name].matrix (същата матрица, която RigidBatcher четеше преди за твърдите крака/
  // опашка/уши piece-ове), няма нужда да композираме отделно w.*.
  syncSkin() {
    const skin = this.skin;
    if (!skin) return;
    const parts = this.rig.parts;
    for (const name of QUAD_BONES) {
      const bone = skin.bones[name];
      if (bone) bone.matrix.copy(parts[name].matrix);
    }
    skin.mesh.updateMatrixWorld(true);
  }
}
