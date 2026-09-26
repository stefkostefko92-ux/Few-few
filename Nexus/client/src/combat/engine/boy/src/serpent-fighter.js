// 4b кръг 2 (Nexus порт, НЕ част от оригиналния boy) — движи SerpentRig от СЪЩАТА timeline/
// choreo машина като beast-fighter.js (виж бележката там за виртуалната "хватка" p/d/e); тук
// няма крака/gait — само root позиция + S-вълна време + rearUp (изправяне за атака).
import * as THREE from 'three';
import { rootOf, toWorld, dirToWorld, weaponAt } from './timeline.js';

class Spring {
  constructor(k = 55, zeta = 0.55) { this.x = 0; this.v = 0; this.k = k; this.c = 2 * Math.sqrt(k) * zeta; }
  step(dt) { const h = Math.min(dt, 1 / 30); this.v += (-this.k * this.x - this.c * this.v) * h; this.x += this.v * h; }
  reset() { this.x = 0; this.v = 0; }
}

const UP = new THREE.Vector3(0, 1, 0);

export class SerpentFighter {
  constructor(who, species, body) {
    this.who = who;
    this.S = species;
    this.rig = body.rig;
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
    this.seed = who === 'A' ? 0.6 : 2.6;
    this.lastT = -1;
  }

  react(kind, power) {
    if (kind === 'helm' || kind === 'bash' || kind === 'recoil') this.spr.flinch.v += 1.8 * power;
  }

  resetDynamics() { Object.values(this.spr).forEach((s) => s.reset()); this.lastT = -1; }
  landingTime() { return Infinity; }

  update(T, dt, other) {
    const who = this.who;
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
    this.P.breath = Math.sin((T + this.seed * 10) * 2.1) * 0.3;

    this.rig.update({
      root: root.pos,
      yaw: root.yaw,
      headTarget: this.headTarget,
      lunge: lungeW,
      biteOpen: lungeW,
      flinch,
      waveT: T + this.seed * 10,
      rearUp: THREE.MathUtils.clamp((W.crouch ?? 0) * 4 + lungeW * 0.7, 0, 1),
    });

    this.bladeBase.copy(this.rig.w.head);
    this.bladeTip.copy(this.rig.w.snoutTip);
    this.pushDir.set(0, 0, 0);
  }
}
