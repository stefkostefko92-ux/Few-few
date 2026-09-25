// One knight: turns the evaluated stunt sheet into a living body (stance, footwork, reactions,
// weapon and shield placement, cape) every frame.
import * as THREE from 'three';
import { Rig, DIM } from './rig.js';
import { FootPlanner } from './feet.js';
import { rootOf, toWorld, dirToWorld, weaponAt, shieldAt, track1, DYNAMIC_AIMS, TARGETS } from './timeline.js';
import { SHIELD_WRIST } from './weapons.js';
import { captureFor, layerBody } from './mocap-body.js';
import { DISARM_T, launchFlight, flightPose } from './flight.js';
import * as C from './choreo.js';

const UP = new THREE.Vector3(0, 1, 0);

class Spring {
  constructor(k = 70, zeta = 0.45) {
    this.x = 0;
    this.v = 0;
    this.k = k;
    this.c = 2 * Math.sqrt(k) * zeta;
  }

  step(dt) {
    const h = Math.min(dt, 1 / 30);
    this.v += (-this.k * this.x - this.c * this.v) * h;
    this.x += this.v * h;
  }

  reset() {
    this.x = 0;
    this.v = 0;
  }
}

const perp = (v, axis, out) => out.copy(v).addScaledVector(axis, -v.dot(axis)).normalize();

export { DISARM_T };

export class Fighter {
  constructor(who, knight, weapon, cape, shield) {
    this.who = who;
    this.knight = knight;
    this.rig = new Rig(knight);
    this.weapon = weapon;
    this.cape = cape;
    this.shield = shield;
    this.feet = new FootPlanner();
    this.root = { pos: new THREE.Vector3(), yaw: 0 };
    this.rootAhead = { pos: new THREE.Vector3(), yaw: 0 };
    this.W = { p: new THREE.Vector3(), d: new THREE.Vector3(), e: new THREE.Vector3() };
    this.S = { w: new THREE.Vector3(), n: new THREE.Vector3() };
    this.grip = new THREE.Vector3();
    this.dir = new THREE.Vector3();
    this.edge = new THREE.Vector3();
    this.bladeBase = new THREE.Vector3();
    this.bladeTip = new THREE.Vector3();
    this.shieldCenter = new THREE.Vector3();
    this.shieldNormal = new THREE.Vector3();
    this.headTarget = new THREE.Vector3(0, 1.6, 0);
    this.spr = { lean: new Spring(55, 0.4), twist: new Spring(60, 0.45), side: new Spring(60, 0.45), headRoll: new Spring(80, 0.35), headYaw: new Spring(80, 0.35), push: new Spring(35, 0.7), recoil: new Spring(120, 0.5) };
    this.recoilDir = new THREE.Vector3();
    this.pushDir = new THREE.Vector3();
    this.desired = [0, 1].map(() => ({ pos: new THREE.Vector3(), yaw: 0, yOff: 0, pitch: 0 }));
    this.vel = new THREE.Vector3();
    this.handR = { grip: new THREE.Vector3(), x: new THREE.Vector3(1, 0, 0), y: new THREE.Vector3(0, 1, 0) };
    this.handL = { grip: new THREE.Vector3(), x: new THREE.Vector3(1, 0, 0), y: new THREE.Vector3(0, 1, 0) };
    this.P = { root: this.root.pos, shift: new THREE.Vector3(), yaw: 0, hipY: 0.9, pelvisYaw: 0, pelvisPitch: 0, pelvisRoll: 0, twist: 0, lean: 0, side: 0, breath: 0, headTarget: this.headTarget, headYaw: 0, headPitch: 0, headRoll: 0, handR: this.handR, handL: this.handL, feet: null, kneel: 0, elbowOut: 0 };
    // Captured body motion; the Warden moves as the actor's mirror image.
    this.body = captureFor(who);
    this.drives = {};
    this.mo = {};
    this.seed = who === 'A' ? 0.3 : 2.1;
    this.lastT = -1;
    this.flight = null;
    this._v = new THREE.Vector3();
    this._w = new THREE.Vector3();
  }

  // Reaction to a blow: magnitude in m/s and rad/s, direction in world space.
  react(kind, power, dirWorld) {
    const s = this.spr;
    if (kind === 'bash') {
      s.lean.v -= 3.2 * power;
      s.twist.v += 1.6 * power;
      s.headRoll.v += 2.5 * power;
      s.push.v += 2.4 * power;
      this.pushDir.copy(dirWorld).setY(0).normalize();
    } else if (kind === 'helm') {
      s.lean.v -= 2.4 * power;
      s.side.v += 1.8 * power;
      s.headRoll.v -= 6 * power;
      s.headYaw.v += 4 * power;
      s.push.v += 1.4 * power;
      this.pushDir.copy(dirWorld).setY(0).normalize();
    } else if (kind === 'block') {
      s.lean.v -= 0.9 * power;
      s.twist.v -= 0.6 * power;
    } else if (kind === 'recoil') {
      s.recoil.v += 1.3 * power;
      this.recoilDir.copy(dirWorld).normalize();
    }
  }

  resetDynamics() {
    Object.values(this.spr).forEach((s) => s.reset());
    this.lastT = -1;
  }

  handBasis(hand, grip, d, e, shoulder) {
    hand.grip.copy(grip);
    hand.y.copy(d);
    const approach = this._v.subVectors(grip, shoulder).normalize();
    const x = this._w.copy(e).multiplyScalar(0.6).addScaledVector(approach, 0.8);
    perp(x, d, hand.x);
  }

  update(T, dt, other) {
    const who = this.who;
    const jump = this.lastT < 0 || Math.abs(T - this.lastT) > 0.5;
    this.lastT = T;
    for (const s of Object.values(this.spr)) s.step(dt);

    rootOf(who, T, this.root);
    rootOf(who, T + 0.06, this.rootAhead);
    this.vel.subVectors(this.rootAhead.pos, this.root.pos).divideScalar(0.06);
    this.root.pos.addScaledVector(this.pushDir, this.spr.push.x * 0.25);
    const root = this.root;
    weaponAt(who, T, this.W);
    const W = this.W;
    const kneel = who === 'B' ? track1(C.B_KNEEL, T) : 0;
    const P = this.P;

    // Stance: neutral when relaxed, bladed fencing stance when crouched, kneeling at the end.
    const fight = THREE.MathUtils.clamp(W.crouch / 0.08, 0, 1);
    const leadL = W.lead === 'L';
    const sw = 1 + W.crouch * 1.5;
    const lerp = THREE.MathUtils.lerp;
    const feetLocal = [
      [lerp(-0.13, leadL ? -0.13 : -0.17, fight) * sw, lerp(0.06, leadL ? 0.3 : -0.28, fight) * sw, lerp(0.12, leadL ? 0.1 : 0.7, fight)],
      [lerp(0.13, leadL ? 0.17 : 0.13, fight) * sw, lerp(-0.06, leadL ? -0.28 : 0.3, fight) * sw, lerp(-0.12, leadL ? -0.7 : -0.1, fight)],
    ];
    if (kneel > 0) {
      feetLocal[0] = [lerp(feetLocal[0][0], -0.15, kneel), lerp(feetLocal[0][1], 0.34, kneel), lerp(feetLocal[0][2], 0.15, kneel)];
      feetLocal[1] = [lerp(feetLocal[1][0], 0.12, kneel), lerp(feetLocal[1][1], -0.52, kneel), lerp(feetLocal[1][2], -0.2, kneel)];
    }
    for (let i = 0; i < 2; i++) {
      const [r, f, yo] = feetLocal[i];
      toWorld(root, [r, 0, f], this.desired[i].pos);
      this.desired[i].yaw = root.yaw + yo;
      this.desired[i].yOff = i === 1 ? 0.035 * kneel : 0;
      this.desired[i].pitch = i === 1 ? -0.95 * kneel : 0;
    }
    if (jump) this.feet.reset(this.desired);
    this.feet.update(dt, this.desired, this.vel);
    P.feet = this.feet.feet;

    // Body drives: authored offsets + automatic coupling to where the hands are + reactions.
    const t = T + this.seed * 10;
    const breathAmp = track1(C.BREATH, T);
    P.breath = Math.sin(t * 2.1) * breathAmp;
    const pelvisBlade = (leadL ? -0.32 : 0.32) * fight;
    const autoTwist = THREE.MathUtils.clamp(-Math.atan2(W.p.x, W.p.z + 0.35) * 0.55, -0.7, 0.7);
    // Authored drives; the motion-captured layer is added on top once the hands are known.
    Object.assign(this.drives, {
      pelvisYaw: pelvisBlade,
      twist: W.tw + autoTwist - pelvisBlade * 0.75 + this.spr.twist.x,
      lean: W.lean + THREE.MathUtils.clamp((W.p.z - 0.3) * 0.45, -0.08, 0.2) + this.spr.lean.x + kneel * 0.25,
      side: this.spr.side.x,
      pelvisPitch: 0.08 * fight,
      pelvisRoll: 0,
      hipY: 0.935 - W.crouch - kneel * 0.37 - this.feet.swing * 0.012 + Math.sin(t * 2.1) * 0.004 * breathAmp,
      headRoll: this.spr.headRoll.x,
      headYaw: this.spr.headYaw.x,
      headPitch: 0,
    });
    this.body.sample(T, this.mo);
    P.yaw = root.yaw;
    P.kneel = kneel;
    this.headTarget.copy(other.rig.w.head);
    if (who === 'B') {
      const down = track1(C.B_LOOK_DOWN, T);
      if (down > 0) this.headTarget.lerp(toWorld(root, [0.1, 0.1, 1.1], this._v), down);
    }

    // Weapon in world space, with idle life, recoil and live re-aiming at the moment of impact.
    toWorld(root, [W.p.x, W.p.y, W.p.z], this.grip);
    dirToWorld(root, [W.d.x, W.d.y, W.d.z], this.dir);
    dirToWorld(root, [W.e.x, W.e.y, W.e.z], this.edge);
    const idle = 1 - W.strike;
    this.dir.x += Math.sin(t * 1.3) * 0.02 * idle;
    this.dir.z += Math.cos(t * 1.1) * 0.02 * idle;
    this.dir.normalize();
    this.grip.addScaledVector(this.recoilDir, this.spr.recoil.x * 0.12);
    for (const aim of DYNAMIC_AIMS) {
      if (aim.who !== who) continue;
      const wgt = Math.exp(-(((T - aim.t) / 0.2) ** 2));
      if (wgt < 0.01) continue;
      const live = toWorld(other.root, TARGETS[aim.target], this._v);
      live.y += other.rig.w.head.y - (other.root.pos.y + 1.62);
      this.grip.addScaledVector(live.sub(aim.world), wgt);
    }
    perp(this.edge, this.dir, this.edge);

    const w = this.rig.w;
    this.handBasis(this.handR, this.grip, this.dir, this.edge, w.shoulderR);
    if (who === 'A') {
      const gl = this._w.copy(this.grip).addScaledVector(this.dir, -0.125);
      this.handBasis(this.handL, gl.clone(), this.dir, this.edge, w.shoulderL);
      P.elbowOut = 0;
    } else {
      shieldAt(T, this.S);
      const wrist = toWorld(root, [this.S.w.x, this.S.w.y, this.S.w.z], this._w);
      const fore = this._v.subVectors(wrist, w.elbowL);
      if (fore.lengthSq() < 1e-4) fore.set(1, 0, 0);
      fore.normalize();
      this.handL.x.copy(fore);
      perp(UP, fore, this.handL.y);
      this.handL.grip.copy(wrist).addScaledVector(fore, DIM.grip);
      P.elbowOut = 0.9;
    }
    // The captured motion yields where it would pull a shoulder out of reach of its hand.
    const k = 1 - kneel;
    layerBody(P, this.drives, this.mo, k, root.yaw);
    this.rig.update(P);
    const gap = this.reachGap();
    if (gap > 0.012) {
      layerBody(P, this.drives, this.mo, k * Math.max(0, 1 - (gap - 0.012) / 0.03), root.yaw);
      this.rig.update(P);
      if (this.reachGap() > 0.012) {
        layerBody(P, this.drives, this.mo, 0, root.yaw);
        this.rig.update(P);
      }
    }
    if (who === 'B') this.placeShield(root);
    this.placeWeapon(T);
    this.bladeBase.copy(this.grip).addScaledVector(this.dir, this.weapon.bladeBase);
    this.bladeTip.copy(this.grip).addScaledVector(this.dir, this.weapon.bladeBase + this.weapon.bladeLen);
  }

  // How far the IK wrists fall short of their targets (the larger of the two hands).
  reachGap() {
    const w = this.rig.w;
    const r = this._v.copy(this.handR.grip).addScaledVector(this.handR.x, -DIM.grip).distanceTo(w.wristR);
    const l = this._v.copy(this.handL.grip).addScaledVector(this.handL.x, -DIM.grip).distanceTo(w.wristL);
    return Math.max(r, l);
  }

  placeShield(root) {
    const w = this.rig.w;
    const xs = this._v.subVectors(w.wristL, w.elbowL).normalize();
    const n = dirToWorld(root, [this.S.n.x, this.S.n.y, this.S.n.z], this.shieldNormal);
    perp(n, xs, n);
    const ys = this._w.crossVectors(n, xs);
    const m = this.shield.part.matrix;
    m.makeBasis(xs, ys, n);
    const o = this.shieldCenter.copy(w.wristL).addScaledVector(xs, -SHIELD_WRIST.x).addScaledVector(ys, -SHIELD_WRIST.y).addScaledVector(n, -SHIELD_WRIST.z);
    m.setPosition(o);
  }

  // 4a.2: кой боец изпуска оръжието и кога вече идват от EVENTS ({type:'disarm', against}),
  // не от фиксираните 'B'/DISARM_T на демото — генерираните двубои могат да разоръжат всяка
  // от двете страни. Липсва ли такова събитие (все още), пада на оригиналното поведение.
  disarmInfo() {
    const ev = C.EVENTS.find((e) => e.type === 'disarm');
    return { who: ev?.against ?? 'B', t: ev?.t ?? DISARM_T };
  }

  placeWeapon(T) {
    const m = this.weapon.part.matrix;
    const { who: disarmWho, t: disarmT } = this.disarmInfo();
    if (this.who === disarmWho && T > disarmT) {
      this.flight ??= launchFlight(disarmWho, disarmT);
      flightPose(this.flight, T - disarmT, m, this.grip, this.dir);
    } else {
      const z = this._v.crossVectors(this.edge, this.dir);
      m.makeBasis(this.edge, this.dir, z);
      m.setPosition(this.grip);
    }
  }

  landingTime() {
    return this.flight ? this.disarmInfo().t + this.flight.tl : Infinity;
  }
}
