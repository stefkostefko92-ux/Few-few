// Motion of the car from one floor to another: a jerk-limited ("S") profile with the rated speed, the design
// acceleration and a jerk (registry sim.profilo). When the trip is too short to reach them, the highest speed that
// fits, found by bisection. Seven segments of constant jerk, integrated exactly. Pure.

export interface ProfilePoint {
  /** distance from the start [m], speed [m/s], acceleration [m/s²], all along the direction of travel */
  x: number;
  v: number;
  a: number;
}

export interface Profile {
  /** total time [s] and distance [m] */
  T: number;
  d: number;
  /** highest speed and acceleration reached */
  vPeak: number;
  aPeak: number;
  /** end of the acceleration and start of the deceleration [s] */
  tAcc: number;
  tDec: number;
  at(t: number): ProfilePoint;
}

interface Seg {
  t0: number;
  dt: number;
  j: number;
  x0: number;
  v0: number;
  a0: number;
}

/** Jerk ramp, constant acceleration and jerk ramp from rest up to the speed v. */
function accelPhase(v: number, a: number, j: number): { tj: number; ta: number; ap: number } {
  if (v * j >= a * a) return { tj: a / j, ta: v / a - a / j, ap: a };
  const tj = Math.sqrt(v / j);
  return { tj, ta: 0, ap: j * tj };
}

/** Distance to reach v from rest: the speed curve is symmetric about its middle, so the mean speed is v/2. */
const accelDistance = (v: number, a: number, j: number): number => {
  const { tj, ta } = accelPhase(v, a, j);
  return (v * (2 * tj + ta)) / 2;
};

function point(s: Seg, t: number): ProfilePoint {
  const u = Math.min(Math.max(t - s.t0, 0), s.dt);
  return {
    x: s.x0 + s.v0 * u + (s.a0 * u * u) / 2 + (s.j * u * u * u) / 6,
    v: s.v0 + s.a0 * u + (s.j * u * u) / 2,
    a: s.a0 + s.j * u,
  };
}

export function motionProfile(d: number, vMax: number, aMax: number, jMax: number): Profile {
  if (!(d > 1e-9) || !(vMax > 0) || !(aMax > 0) || !(jMax > 0)) {
    return { T: 0, d: 0, vPeak: 0, aPeak: 0, tAcc: 0, tDec: 0, at: () => ({ x: 0, v: 0, a: 0 }) };
  }
  let vp = vMax;
  if (2 * accelDistance(vMax, aMax, jMax) > d) {
    let lo = 0, hi = vMax;
    for (let k = 0; k < 80; k++) {
      const m = (lo + hi) / 2;
      if (2 * accelDistance(m, aMax, jMax) > d) hi = m;
      else lo = m;
    }
    vp = lo;
  }
  const { tj, ta, ap } = accelPhase(vp, aMax, jMax);
  const tc = Math.max(0, (d - 2 * accelDistance(vp, aMax, jMax)) / vp);
  const plan: [number, number][] = [[tj, jMax], [ta, 0], [tj, -jMax], [tc, 0], [tj, -jMax], [ta, 0], [tj, jMax]];
  const segs: Seg[] = [];
  let t0 = 0, x0 = 0, v0 = 0, a0 = 0;
  for (const [dt, j] of plan) {
    const s: Seg = { t0, dt, j, x0, v0, a0 };
    segs.push(s);
    const end = point(s, t0 + dt);
    t0 += dt;
    x0 = end.x;
    v0 = end.v;
    a0 = end.a;
  }
  const T = t0;
  return {
    T, d, vPeak: vp, aPeak: ap, tAcc: 2 * tj + ta, tDec: T - (2 * tj + ta),
    at(t) {
      if (t <= 0) return { x: 0, v: 0, a: 0 };
      if (t >= T) return { x: d, v: 0, a: 0 };
      const s = segs.find((g) => t < g.t0 + g.dt) ?? segs[segs.length - 1];
      return point(s, t);
    },
  };
}
