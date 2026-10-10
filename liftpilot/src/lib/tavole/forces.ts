// Forces of the car on its guide rails for the data sheet (UNI EN 81-50:2020, 5.10): the rated load off the centre
// of the car by 1/8 of each side, the car's own offset from the rails (large on a cantilever sling), the impact factor
// of the safety gear. Fx acts across the line of the rails, on the faces of the blades, and all the rails share it;
// Fy acts along that line, on the tips, and half of them take it. The safety gear case governs (k1 ≥ 2 > k2 = 1,2).
// Registry: guide.spinte (src/shaft/norme-vert.ts).
import { KV_VERT } from '@/shaft/norme-vert';
import type { Layout } from '@/shaft/types';

const G = 9.81;

export type SafetyGear = 'progressive' | 'roller' | 'instantaneous';

export interface RailForces {
  /** [daN] */
  fx: number;
  fy: number;
  /** impact factor used */
  k: number;
  /** distance between the guide shoes [m] */
  h: number;
}

export const impactFactor = (gear: SafetyGear): number =>
  gear === 'instantaneous' ? KV_VERT.k1Instant : gear === 'roller' ? KV_VERT.k1Roller : KV_VERT.k1Progressive;

/** A point of the plan [mm] as offsets [m] from the rails' system: across their line (x) and along it (y). Central
 *  sling: the rails on the side walls, their line along the front wall at the frame's axis; cantilever: both rails on
 *  one side wall, their line along it. */
function offsets(L: Layout): (p: readonly [number, number]) => readonly [number, number] {
  const rails = L.rails.filter((r) => r.kind === 'car'), axis = L.frame.axis;
  if (L.frame.kind === 'central') {
    const mid = rails.reduce((s, r) => s + r.x, 0) / rails.length;
    return ([x, y]) => [Math.abs(y - axis) / 1000, Math.abs(x - mid) / 1000];
  }
  const mid = rails.reduce((s, r) => s + r.y, 0) / rails.length;
  return ([x, y]) => [Math.abs(x - axis) / 1000, Math.abs(y - mid) / 1000];
}

/** The car's rails, the distance between its guide shoes [m] and the offsets [m] of the car (P) and of the rated load
 *  (Q, 1/8 of the car off its centre) from the rails' system: across their line (x) and along it (y). */
function arms(L: Layout): { n: number; h: number; xP: number; yP: number; xQ: number; yQ: number } {
  const V = L.inputs.vertical, n = Math.max(2, L.rails.filter((r) => r.kind === 'car').length);
  const h = (V.frameTop + V.frameBelow) / 1000, e = KV_VERT.loadOffset, c = L.car;
  const [xP, yP] = offsets(L)([c.x + c.w / 2, c.y + c.h / 2]);
  // the load 1/8 of the car's side across the rails' line further: its depth on a central sling, its width on a cantilever
  return L.frame.kind === 'central'
    ? { n, h, xP, yP, xQ: xP + (L.B * e) / 1000, yQ: yP + (L.A * e) / 1000 }
    : { n, h, xP, yP, xQ: xP + (L.A * e) / 1000, yQ: yP + (L.B * e) / 1000 };
}

/** P: empty car, Q: rated load [kg]. */
export function railForces(L: Layout, P: number, Q: number, gear: SafetyGear): RailForces {
  const { n, h, xP, yP, xQ, yQ } = arms(L), k = Math.max(impactFactor(gear), KV_VERT.k2Running);
  const fx = (k * G * (Q * xQ + P * xP)) / (n * h) / 10;
  const fy = (k * G * (Q * yQ + P * yP)) / ((n / 2) * h) / 10;
  return { fx, fy, k, h };
}

/** The use of the lift the force on the car's sill follows (src/lib/plant.ts). */
export type LiftUse = 'passengers' | 'goods' | 'goodsHeavy';

/** The factor of the force on the car door's sill while loading: by the lift's use (UNI EN 81-20:2020, 5.7.2.3.6), or,
 *  the use not given, by the rated load Q [kg] (UNI EN 81-1:2008, G.2.5). */
export const sillFactor = (Q: number, use?: LiftUse): number =>
  use === 'passengers' ? KV_VERT.sillLoad : use === 'goods' ? KV_VERT.sillLoadHeavy : use === 'goodsHeavy' ? KV_VERT.sillLoadDevices
    : Q >= KV_VERT.sillHeavyQ ? KV_VERT.sillLoadHeavy : KV_VERT.sillLoad;

/** The forces on a rail [N] while the car is loaded at a floor: the empty car and the force Fs = factor·g·Q on the
 *  middle of the car door's sill, at each entrance in turn; no impact factor (UNI EN 81-20:2020, 5.7.2). */
export function loadingCases(L: Layout, P: number, Q: number, use?: LiftUse): readonly { fx: number; fy: number }[] {
  const { n, h, xP, yP } = arms(L), at = offsets(L), c = L.car, fs = sillFactor(Q, use) * G * Q;
  return L.doors.map((d) => {
    const u = (d.u0 + d.u1) / 2;
    const [xi, yi] = at(d.wall === 'front' ? [u, c.y] : d.wall === 'rear' ? [u, c.y + c.h] : d.wall === 'left' ? [c.x, u] : [c.x + c.w, u]);
    return { fx: (G * P * xP + fs * xi) / (n * h), fy: (G * P * yP + fs * yi) / ((n / 2) * h) };
  });
}

/** The forces on a rail with the impact factor k [N], the rated load off the centre across the rails' line (the first
 *  case) and along it (the second), as UNI EN 81-50:2020, 5.10 takes them in turn; the number of rails. */
export function loadCases(L: Layout, P: number, Q: number, k: number): { cases: readonly { fx: number; fy: number }[]; n: number } {
  const { n, h, xP, yP, xQ, yQ } = arms(L);
  const fx = (x: number): number => (k * G * (Q * x + P * xP)) / (n * h), fy = (y: number): number => (k * G * (Q * y + P * yP)) / ((n / 2) * h);
  return { cases: [{ fx: fx(xQ), fy: fy(yP) }, { fx: fx(xP), fy: fy(yQ) }], n };
}
