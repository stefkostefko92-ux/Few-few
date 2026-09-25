// Footwork: feet stay planted until the body drifts from them, then step in arcs one at a time.
import * as THREE from 'three';
import { DIM } from './rig.js';

const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

export class FootPlanner {
  constructor() {
    this.feet = [0, 1].map(() => ({
      pos: new THREE.Vector3(),
      yaw: 0,
      pitch: 0,
      swinging: false,
      s: 0,
      dur: 0.3,
      lift: 0.08,
      from: new THREE.Vector3(),
      to: new THREE.Vector3(),
      fromYaw: 0,
      toYaw: 0,
      yOff: 0,
    }));
    this.onStep = null;
    this.swing = 0;
  }

  reset(desired) {
    this.feet.forEach((f, i) => {
      f.pos.copy(desired[i].pos);
      f.pos.y = DIM.ankle + desired[i].yOff;
      f.yaw = desired[i].yaw;
      f.pitch = desired[i].pitch;
      f.swinging = false;
    });
  }

  // desired[i] = { pos (ground point), yaw, yOff, pitch }; vel = root velocity (m/s).
  update(dt, desired, vel) {
    this.swing = 0;
    for (let i = 0; i < 2; i++) {
      const f = this.feet[i];
      if (!f.swinging) {
        f.yOff += (desired[i].yOff - f.yOff) * Math.min(1, dt * 10);
        f.pitch += (desired[i].pitch - f.pitch) * Math.min(1, dt * 10);
        f.pos.y = DIM.ankle + f.yOff;
        continue;
      }
      f.s = Math.min(1, f.s + dt / f.dur);
      const e = f.s * f.s * (3 - 2 * f.s);
      f.pos.lerpVectors(f.from, f.to, e);
      const arc = Math.sin(Math.PI * f.s);
      f.pos.y = DIM.ankle + f.yOff + f.lift * arc;
      f.yaw = f.fromYaw + wrap(f.toYaw - f.fromYaw) * e;
      f.pitch = arc * (-0.55 + 0.95 * f.s) + desired[i].pitch * e;
      this.swing += arc;
      if (f.s >= 1) {
        f.swinging = false;
        f.pitch = desired[i].pitch;
        if (this.onStep) this.onStep(f.pos, f.to.distanceTo(f.from));
      }
    }
    let best = -1;
    let bestErr = 0;
    for (let i = 0; i < 2; i++) {
      const f = this.feet[i];
      if (f.swinging) continue;
      const tx = desired[i].pos.x + vel.x * 0.14;
      const tz = desired[i].pos.z + vel.z * 0.14;
      const dist = Math.hypot(tx - f.pos.x, tz - f.pos.z);
      const dyaw = Math.abs(wrap(desired[i].yaw - f.yaw));
      const other = this.feet[1 - i];
      const urgent = dist > 0.42;
      if ((dist > 0.13 || dyaw > 0.5) && (!other.swinging || urgent)) {
        const err = dist + dyaw * 0.2;
        if (err > bestErr) {
          bestErr = err;
          best = i;
        }
      }
    }
    if (best >= 0) {
      const f = this.feet[best];
      const d = desired[best];
      f.from.copy(f.pos);
      f.to.set(d.pos.x + vel.x * 0.14, DIM.ankle + d.yOff, d.pos.z + vel.z * 0.14);
      f.from.y = f.to.y;
      const dist = f.to.distanceTo(f.from);
      f.dur = 0.2 + 0.22 * Math.min(dist / 0.6, 1);
      f.lift = 0.045 + 0.09 * Math.min(dist / 0.5, 1);
      f.fromYaw = f.yaw;
      f.toYaw = d.yaw;
      f.s = 0;
      f.swinging = true;
    }
  }
}
