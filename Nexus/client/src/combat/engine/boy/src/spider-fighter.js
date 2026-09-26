// 4b кръг 2 (Nexus порт, НЕ част от оригиналния boy) — движи SpiderRig от СЪЩАТА timeline/choreo
// машина (виж beast-fighter.js бележката за виртуалната "хватка"). 8-крак походка: редуват се
// четни/нечетни крака (опростен tripod gait), стъпалата следват legAnchors, не фиксирана стойка.
import * as THREE from 'three';
import { rootOf, toWorld, dirToWorld, weaponAt } from './timeline.js';
import { SPIDER_BONES } from './spider-geo.js';

class Spring {
  constructor(k = 60, zeta = 0.5) { this.x = 0; this.v = 0; this.k = k; this.c = 2 * Math.sqrt(k) * zeta; }
  step(dt) { const h = Math.min(dt, 1 / 30); this.v += (-this.k * this.x - this.c * this.v) * h; this.x += this.v * h; }
  reset() { this.x = 0; this.v = 0; }
}

const UP = new THREE.Vector3(0, 1, 0);
const SIDE = [-1, -1, -1, -1, 1, 1, 1, 1];
const ROW = [0, 1, 2, 3, 0, 1, 2, 3];

export class SpiderFighter {
  constructor(who, species, body) {
    this.who = who;
    this.S = species;
    this.rig = body.rig;
    this.skin = body.skin;
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
    this.shieldNormal = UP.clone();
    this.shieldCenter = new THREE.Vector3();
    this.feet = { onStep: null };
    this.cape = { mesh: new THREE.Group(), step() {} };
    this.P = { breath: 0 };
    this.spr = { flinch: new Spring() };
    this.pushDir = new THREE.Vector3();
    this.seed = who === 'A' ? 0.8 : 2.8;
    this.lastT = -1;
    this._legs = Array.from({ length: 8 }, () => ({ pos: new THREE.Vector3(), yaw: 0, pitch: 0 }));
  }

  react(kind, power) {
    if (kind === 'helm' || kind === 'bash' || kind === 'recoil') this.spr.flinch.v += 2 * power;
  }

  resetDynamics() { Object.values(this.spr).forEach((s) => s.reset()); this.lastT = -1; }
  landingTime() { return Infinity; }

  planLegs(root, T) {
    const S = this.S;
    const speed = Math.min(1, this.vel.length() / 1.0);
    const phase0 = T * S.gaitHz * 6.2832;
    for (let i = 0; i < 8; i++) {
      const side = SIDE[i];
      const row = ROW[i];
      const spread = S.cephaloR * 1.7 + row * 0.02;
      const fwdOff = (1.5 - row) * S.legLen * 0.28;
      const phase = phase0 + (i % 2 === 0 ? 0 : Math.PI);
      const lift = speed > 0.03 ? Math.max(0, Math.sin(phase)) * 0.045 * (0.3 + speed) : 0;
      toWorld(root, [side * spread, 0, fwdOff], this._legs[i].pos);
      this._legs[i].pos.y = lift;
      this._legs[i].yaw = root.yaw;
      this._legs[i].pitch = 0;
    }
  }

  update(T, dt, other) {
    const who = this.who;
    const S = this.S;
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
    const flinch = THREE.MathUtils.clamp(this.spr.flinch.x * 0.4, 0, 1);
    const t = T + this.seed * 10;
    this.P.breath = Math.sin(t * 2.4) * 0.4 + 0.5;
    this.planLegs(root, T);

    this.rig.update({
      root: root.pos,
      yaw: root.yaw,
      hipY: S.hipY * (1 - (W.crouch ?? 0) * 0.4 - flinch * 0.1),
      breath: this.P.breath,
      headTarget: this.headTarget,
      lunge: lungeW,
      biteOpen: lungeW,
      flinch,
      legs: this._legs,
    });

    this.bladeBase.copy(this.rig.w.head);
    this.bladeTip.copy(this.rig.w.snoutTip);
    this.pushDir.set(0, 0, 0);
    this.syncSkin();
  }

  // Виж beast-fighter.js syncSkin() бележката — идентичен принцип, само 26 кости (цефало/
  // коремче/8×3 крак сегмента, spider-geo.js SPIDER_BONES).
  syncSkin() {
    const skin = this.skin;
    if (!skin) return;
    const parts = this.rig.parts;
    for (const name of SPIDER_BONES) {
      const bone = skin.bones[name];
      if (bone) bone.matrix.copy(parts[name].matrix);
    }
    skin.mesh.updateMatrixWorld(true);
  }
}
