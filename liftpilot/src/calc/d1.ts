// UNI 10411-1:2024, appendix D (D.1): the stability of the suspension ropes against slipping, which a modification
// under UNI 10411-1 shows when it changes the ratio of the loads hung on the car side and on the counterweight side
// (6.1, with D.2 and the buffers to UNI EN 81-20 5.8): (T1/T2)·C1·C2 ≤ e^(f·α), with the static pulls on the two sides of
// the traction sheave in two cases — the car at the lowest landing with 125 % of the rated load, the empty car at the
// highest —, C1 = (gn + a)/(gn − a) with the car's braking deceleration a, never under the minimum of the rated speed's
// band (over the last band computed, never under K.c1Min), C2 by the groove, f by the groove with μ = 0,09. Not part of
// compute(): the static pulls are taken from the same rope model (model.ts walk) with compute's arithmetic for its
// loading cases, so the golden results and the machine proposal do not change. With the result (round 46 final check),
// as information for the soggetto della verifica: the deceleration C1's band minimum stands for and the limit
// deceleration up to which the condition still holds, a = gn·(C1 − 1)/(C1 + 1). Registry: modifica.d1. Pure.
import { K } from './norme';
import { G, rad, ratio } from './math';
import { wrapAngles } from './geometry';
import { ropeModel } from './model';
import type { EndPosition, Groove, Machine, Plant } from './types';

/** C1's minimum at the rated speed `v` [m/s]: its band's (each band's lower bound excluded, its upper one included);
 *  over the last band C1 is computed case by case and never under K.c1Min. */
export function c1Min(v: number): number {
  const band = K.c1Bands.find(([top]) => v <= top + 1e-9);
  return band ? band[1] : K.c1Min;
}

/** C1 = (gn + a)/(gn − a), never under the minimum of the speed band; a deceleration of gravity or more: none holds. */
export const c1Of = (v: number, a: number): number => (a < G ? Math.max((G + a) / (G - a), c1Min(v)) : Infinity);

/** The braking deceleration a C1 stands for, the inverse of (gn + a)/(gn − a): a = gn·(C1 − 1)/(C1 + 1) [m/s²]. */
export const aOfC1 = (c1: number): number => (G * (c1 - 1)) / (c1 + 1);

/** C2 by how the groove's profile changes with wear: a wedge (V) groove 1,2; a semicircular one 1 (with the undercut, as
 *  D.1 gives it; without, the same — the software's reading). */
export const c2Of = (gr: Groove): number => (gr.type === 'VH' || gr.type === 'VN' ? K.c2Wedge : K.c2Undercut);

/** f of D.1 with μ = K.muD1: a semicircular groove 4μ·(1 − sin(β/2))/(π − β − sin β) (β = 0 without the undercut), a
 *  wedge groove μ/sin(γ/2); a V groove not hardened, which has its undercut, the smaller of the two (on the safe side, as
 *  UNI EN 81-50 5.11.2.3.1 takes the undercut of such a groove). */
export function fD1(gr: Groove): number {
  const mu = K.muD1, b = gr.type === 'U' ? 0 : rad(gr.beta || 0);
  const semi = (4 * mu * (1 - Math.sin(b / 2))) / (Math.PI - b - Math.sin(b));
  if (gr.type === 'U' || gr.type === 'UU') return semi;
  const wedge = mu / Math.sin(rad(gr.gamma || 0) / 2);
  return gr.type === 'VN' ? Math.min(wedge, semi) : wedge;
}

/** One case of D.1: the car at the lowest landing with 125 % of the rated load ('b') or empty at the highest ('t'). */
export interface D1Case {
  pos: EndPosition;
  /** wrap angle [rad], e^(f·α) */
  alpha: number;
  efa: number;
  /** the static pulls on the two sides of the sheave, the larger first [N] */
  T1: number;
  T2: number;
  ratio: number;
  /** (T1/T2)·C1·C2 */
  lhs: number;
  /** lhs over e^(f·α): over 1 the condition is not met */
  util: number;
}

export interface D1Result {
  /** the rated speed [m/s] and the braking deceleration [m/s²] C1 is taken at, C1's minimum at that speed */
  v: number;
  a: number;
  c1Min: number;
  /** the deceleration C1's minimum stands for, aOfC1(c1Min) [m/s²]: taking C1 at the band's minimum assumes the car
   *  brakes no harder than this (round 46 final check: information for the soggetto della verifica) */
  aMin: number;
  C1: number;
  C2: number;
  mu: number;
  f: number;
  cases: readonly [D1Case, D1Case];
  /** the case with the higher utilisation */
  worst: D1Case;
  /** the largest C1 that still meets the condition, e^(f·α)/((T1/T2)·C2) in the worse of the two cases (0 with a slack
   *  side) */
  c1Lim: number;
  /** the braking deceleration up to which D.1 still holds, aOfC1(c1Lim) [m/s²], for the soggetto della verifica to
   *  compare with the one measured at the brake test; null when not even C1's minimum meets it (no deceleration does).
   *  Information only: the check stays at C1 (round 46 final check, norms lens) */
  aLim: number | null;
}

/** D.1 of the installation `I` and the machine `M`; `a` the car's braking deceleration [m/s²] (by default the
 *  calculation's: the deceleration of its emergency braking check, Plant.ae — registry modifica.d1). */
export function d1Of(I: Plant, M: Machine, a: number = I.ae): D1Result {
  const { Mcw, path, walk } = ropeModel(I, M), wa = wrapAngles(I, M), f = fD1(M.groove), C1 = c1Of(I.v, a), C2 = c2Of(M.groove);
  const one = (pos: EndPosition): D1Case => {
    // the pulls as compute()'s loading cases take them: walk() of each side, static
    const p = path(pos === 'b'), alpha = rad(pos === 'b' ? wa.B : wa.T), load = pos === 'b' ? K.loadTestFactor * I.Q : 0;
    const Tc = walk(I.P + load, 0, p.car), Tw = walk(Mcw, 0, p.cwt), efa = Math.exp(f * alpha), q = ratio(Tc, Tw), lhs = q * C1 * C2;
    return { pos, alpha, efa, T1: Math.max(Tc, Tw), T2: Math.min(Tc, Tw), ratio: q, lhs, util: lhs / efa };
  };
  const b = one('b'), t = one('t'), min = c1Min(I.v);
  // the limit C1 of each case: the condition met with equality (a slack side, ratio ∞: none)
  const lim = (c: D1Case): number => (Number.isFinite(c.ratio) && c.ratio > 0 ? c.efa / (c.ratio * C2) : 0), c1Lim = Math.min(lim(b), lim(t));
  return { v: I.v, a, c1Min: min, aMin: aOfC1(min), C1, C2, mu: K.muD1, f, cases: [b, t], worst: t.util > b.util ? t : b,
    c1Lim, aLim: c1Lim >= min - 1e-12 ? aOfC1(c1Lim) : null };
}
