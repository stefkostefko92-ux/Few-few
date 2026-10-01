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

/** P: empty car, Q: rated load [kg]. */
export function railForces(L: Layout, P: number, Q: number, gear: SafetyGear): RailForces {
  const V = L.inputs.vertical, rails = L.rails.filter((r) => r.kind === 'car'), n = Math.max(2, rails.length);
  const k = Math.max(impactFactor(gear), KV_VERT.k2Running), h = (V.frameTop + V.frameBelow) / 1000, e = KV_VERT.loadOffset;
  const c = L.car, cx = c.x + c.w / 2, cy = c.y + c.h / 2;
  // offsets of the car [m] from the rails' system: along their line (y) and across it (x), with the load's 1/8 more
  let xP: number, yP: number, xQ: number, yQ: number;
  if (L.frame.kind === 'central') {
    // rails on the side walls: their line runs along the front wall, at the car's middle depth
    const mid = rails.reduce((s, r) => s + r.x, 0) / rails.length;
    yP = Math.abs(cx - mid) / 1000;
    xP = Math.abs(cy - L.frame.axis) / 1000;
    yQ = yP + (L.A * e) / 1000;
    xQ = xP + (L.B * e) / 1000;
  } else {
    // cantilever: both rails on one side wall, their line along it; the car hangs off that line
    const mid = rails.reduce((s, r) => s + r.y, 0) / rails.length;
    xP = Math.abs(cx - L.frame.axis) / 1000;
    yP = Math.abs(cy - mid) / 1000;
    xQ = xP + (L.A * e) / 1000;
    yQ = yP + (L.B * e) / 1000;
  }
  const fx = (k * G * (Q * xQ + P * xP)) / (n * h) / 10;
  const fy = (k * G * (Q * yQ + P * yP)) / ((n / 2) * h) / 10;
  return { fx, fy, k, h };
}
