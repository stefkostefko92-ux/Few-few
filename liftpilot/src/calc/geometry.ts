// Wrap angle from the layout (research 5.3).
import { deg } from './math';
import type { Machine, Plant, WrapAngles } from './types';

/**
 * α with a deflector below the sheave. Outwards: simple bend, external tangent. Inwards: the rope passes the
 * deflector on the other side (reverse bend), internal tangent. null: the pulleys overlap.
 */
export function deflectorAngle(D: number, Dp: number, dx: number, h: number): { alpha: number; reverse: boolean } | null {
  const R0 = D / 2000, R1 = Dp / 2000, d = Math.hypot(dx, h);
  if (d < R0 + R1) return null;
  const psi = Math.atan2(dx, h), simple = psi - Math.asin((R0 - R1) / d);
  if (simple >= 0) return { alpha: 180 - deg(simple), reverse: false };
  return { alpha: 180 + deg(Math.asin((R0 + R1) / d) - psi), reverse: true };
}

/**
 * Lean from the vertical of a rope leaving a sheave of radius R0 for a hitch set s outwards (> 0) from the vertical
 * tangent and L below the sheave centre: exact tangent from the hitch to the sheave.
 */
export const ropeLean = (R0: number, s: number, L: number): number => {
  const x = R0 + s, y = Math.max(L, 0.1);
  return Math.atan2(x, y) - Math.asin(Math.min(1, R0 / Math.hypot(x, y)));
};

export function wrapAngles(I: Plant, M: Machine): WrapAngles {
  if (I.alphaMode === 'manual') return { B: I.alphaManual, T: I.alphaManual };
  if (I.layout === 'topDefl') {
    const g = deflectorAngle(M.D, I.Dp, I.dx, I.h); // invalid geometry is flagged when the inputs are read
    return g ? { B: g.alpha, T: g.alpha, reverse: g.reverse } : { B: 180, T: 180 };
  }
  if (I.layout === 'top' && I.drops > 0) {
    // direct pull: hitches stay at the existing drop spacing; a sheave of another diameter inclines the ropes
    const R0 = M.D / 2000, half = (I.drops - M.D) / 2000;
    const dc = I.dropAlign === 'car' ? 0 : half, dw = I.dropAlign === 'car' ? 2 * half : half;
    const ang = (Lc: number, Lw: number): number => 180 - deg(ropeLean(R0, dc, Lc) + ropeLean(R0, dw, Lw));
    return { B: ang(I.H + I.L0, I.L0), T: ang(I.L0, I.H + I.L0), dc, dw };
  }
  return { B: 180, T: 180 };
}
