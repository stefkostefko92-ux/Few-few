// Where the ropes run, for the 3D: the plane through the car's and the counterweight's rope drops (u along it from
// the car drop, y up, metres), the sheave of the machine, the diverting pulley, the car and counterweight pulleys of a
// 2:1 roping, and the rope as belt elements for a car floor at s and a counterweight plate at w. Machine above: the
// sheave's car side right over the car drop (as in the drawings of the machine room). Machine below: the machine in a
// room past the wall behind the counterweight, two pulleys under the slab, the rope led down along that wall (the
// guides are drawn as bends). Pure.
import { deflectorAngle } from '@/calc/geometry';
import { section, type Layout } from '@/shaft';
import { KL } from './norme';
import type { BeltEl } from './belt';
import type { LiftDerived } from './derive';

export interface Wheel {
  role: 'sheave' | 'deflector' | 'top' | 'carPulley' | 'cwPulley';
  u: number;
  y: number;
  r: number;
}

export interface RopeRig {
  /** car drop in plan [mm], unit direction toward the counterweight drop, spacing of the drops [m] */
  origin: readonly [number, number];
  dir: readonly [number, number];
  calata: number;
  /** the machine: its sheave (centre, radius) and whether it stands below */
  sheave: Wheel;
  bottom: boolean;
  /** wheels at rest (the car and counterweight pulleys move with s and w: see elements) */
  wheels: readonly Wheel[];
  /** height of the machine room floor, or of the bottom room floor [m] */
  roomFloor: number;
  /** where the wall behind the counterweight is along the drop line [m] (bottom machine) */
  wallAt: number;
  elements(s: number, w: number): BeltEl[];
}

/** Where a ray from p along d leaves the rectangle [0, W] × [0, D] (distance). */
function exitAlong(p: readonly [number, number], d: readonly [number, number], W: number, D: number): number {
  const ts: number[] = [];
  if (d[0] > 1e-9) ts.push((W - p[0]) / d[0]);
  if (d[0] < -1e-9) ts.push(-p[0] / d[0]);
  if (d[1] > 1e-9) ts.push((D - p[1]) / d[1]);
  if (d[1] < -1e-9) ts.push(-p[1] / d[1]);
  return ts.length ? Math.min(...ts) : 0;
}

export function ropeRig(dv: LiftDerived): RopeRig {
  const L: Layout = dv.layout, S = section(L), V = L.inputs.vertical, { I, N } = dv.analysis.ctx;
  const car = [L.car.x + L.car.w / 2, L.car.y + L.car.h / 2] as const, cw = [L.cw.x + L.cw.w / 2, L.cw.y + L.cw.h / 2] as const;
  const cal = Math.hypot(cw[0] - car[0], cw[1] - car[1]) || 1, dir = [(cw[0] - car[0]) / cal, (cw[1] - car[1]) / cal] as const;
  const cm = cal / 1000, R0 = N.D / 2000, Rp = I.Dp / 2000, two = I.r === 2;
  const ceiling = S.ceiling / 1000, slab = (L.inputs.room?.slab ?? 250) / 1000, bottom = I.layout === 'bottom';
  const roomFloor = bottom ? 0 : ceiling + slab;
  // the car side of the rope rises at u0, the counterweight side comes down at u1
  const u0 = two ? Rp : 0, u1 = two ? cm - Rp : cm;
  const deadY = ceiling - 0.05;
  const carHitch = (s: number): number => s + V.frameTop / 1000;
  const cwHitch = (w: number): number => w + V.cwH / 1000 + 0.06;
  const carStart = (s: number): BeltEl[] => (two
    ? [{ kind: 'pt', u: -Rp, y: deadY }, { kind: 'wheel', u: 0, y: carHitch(s) + Rp + 0.03, r: Rp, cw: false }]
    : [{ kind: 'pt', u: 0, y: carHitch(s) }]);
  const cwEnd = (w: number): BeltEl[] => (two
    ? [{ kind: 'wheel', u: cm, y: cwHitch(w) + Rp, r: Rp, cw: false }, { kind: 'pt', u: cm + Rp, y: deadY }]
    : [{ kind: 'pt', u: cm, y: cwHitch(w) }]);
  const wallAt = (exitAlong(car, dir, L.inputs.W, L.inputs.D)) / 1000;

  let sheave: Wheel, fixed: Wheel[], mid: BeltEl[];
  if (!bottom) {
    sheave = { role: 'sheave', u: u0 + R0, y: roomFloor + (KL.sheaveAxisPerD * N.D) / 1000, r: R0 };
    fixed = [sheave];
    mid = [{ kind: 'wheel', u: sheave.u, y: sheave.y, r: R0, cw: true }];
    if (I.layout === 'topDefl') {
      const R1 = Rp, rev = deflectorAngle(N.D, I.Dp, I.dx, I.h)?.reverse ?? false;
      const pulley: Wheel = { role: 'deflector', u: rev ? u1 + R1 : u1 - R1, y: sheave.y - I.h, r: R1 };
      fixed.push(pulley);
      mid.push({ kind: 'wheel', u: pulley.u, y: pulley.y, r: R1, cw: !rev });
    }
  } else {
    // the two runs down to the machine in the gap between the counterweight's back and the wall, clear of both
    const cwBack = cm + L.inputs.cwDepth / 2000, gap = Math.max(0, wallAt - cwBack);
    const yTop = ceiling - Rp - 0.12, ug = wallAt - 0.3 * gap, ug2 = wallAt - 0.7 * gap, yM = (KL.sheaveAxisPerD * N.D) / 1000;
    const wall = L.inputs.wall / 1000;
    sheave = { role: 'sheave', u: wallAt + wall + 0.35 + R0, y: yM, r: R0 };
    const A: Wheel = { role: 'top', u: u0 + Rp, y: yTop, r: Rp }, B: Wheel = { role: 'top', u: u1 + Rp, y: yTop, r: Rp };
    fixed = [sheave, A, B];
    mid = [
      { kind: 'wheel', u: A.u, y: A.y, r: Rp, cw: true },
      { kind: 'pt', u: ug, y: yTop + Rp }, { kind: 'pt', u: ug, y: yM + R0 },
      { kind: 'wheel', u: sheave.u, y: sheave.y, r: R0, cw: true },
      { kind: 'pt', u: ug2, y: yM - R0 }, { kind: 'pt', u: ug2, y: yTop + Rp - 0.05 },
      { kind: 'wheel', u: B.u, y: B.y, r: Rp, cw: false },
    ];
  }
  return {
    origin: car, dir, calata: cm, sheave, bottom, wheels: fixed, roomFloor, wallAt,
    elements: (s, w) => [...carStart(s), ...mid, ...cwEnd(w)],
  };
}
