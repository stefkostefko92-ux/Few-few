// The overspeed governor and the place of its rope in plan. The model by the rated speed after PFB's catalogue (product
// pages of pfb.it, read through search extracts on 2026-10-01, see research/argano-geared/): its sheave and rope, and
// the size of its frame. Only the LK200 has published dimensions (370 mm high, base 220 mm along the rope × 165 mm);
// the larger ones are drawn in its proportions. The governor goes on a side wall with neither a door nor the
// counterweight, its rope in the gap beside the car next to the car rail, the tension weight in the pit clamped to
// that rail. Plan in millimetres as in types.ts. Pure: the machine room plan draws it, the 3D builds it.
import type { Layout, Rail } from './types';

/** A governor: model, highest rated speed, sheave pitch radius and rope radius, the rim's half width, the axle's
 *  height over the base and the frame's top over the axle, the base's half sizes across the rope and along it [mm]. */
export interface Governor {
  model: string;
  vMax: number;
  R: number;
  rope: number;
  half: number;
  axle: number;
  top: number;
  baseA: number;
  baseW: number;
}

/** PFB's bidirectional governors by rated speed: LK200 Ø 200 rope 6 to 1,48 m/s, LK250 Ø 250 rope 6–8 to 1,74 m/s,
 *  LK300 Ø 300 rope 6–8 to 2,93 m/s; over that the R12BF (Ø 345, rope 8–10, to 4,00 m/s, rope-clamping, one way). */
export const GOVERNORS: readonly Governor[] = [
  { model: 'LK200', vMax: 1.48, R: 100, rope: 3, half: 15, axle: 240, top: 130, baseA: 82.5, baseW: 110 },
  { model: 'LK250', vMax: 1.74, R: 125, rope: 3, half: 17, axle: 285, top: 170, baseA: 101, baseW: 114 },
  { model: 'LK300', vMax: 2.93, R: 150, rope: 4, half: 20, axle: 330, top: 210, baseA: 120, baseW: 118 },
  { model: 'R12BF', vMax: 4, R: 172.5, rope: 4, half: 22, axle: 375, top: 240, baseA: 138, baseW: 125 },
];

/** The governor for a rated speed [m/s]: the smallest that takes it. */
export const govSize = (v: number): Governor => GOVERNORS.find((g) => v <= g.vMax + 1e-9) ?? GOVERNORS[GOVERNORS.length - 1];

/** How far the lever kind of tension weight reaches past its pulley's centre along the rope's plane [mm]: PFB R4K,
 *  700 mm over all with the pulley 255 mm from the hinge's end. */
export const LEVER_REACH = 445;

/** The tension weight [mm]: the lever's hinge past the clip, its bars' inner face and thickness; the weights in cast
 *  iron (7,2 kg/dm³) across × along the rope's plane × high — the lever's 113 × 150 × 185 ≈ 22 kg (PFB R4KE for the
 *  LK200), the vertical kind's 150 × 160 × 250 ≈ 43 kg (PFB R4R, 44 kg) — and the lever weight's middle, as far out
 *  as the lever reaches. */
export const TENSION = {
  hinge: 80, bar: 26, barT: 8, lever: [113, 150, 185], hang: [150, 160, 250], weightAt: LEVER_REACH - 150 / 2 - 40, leverKg: 22, hangKg: 44,
} as const;

export type FreeSide = 'left' | 'right';

/** Where the governor rope runs: x of its plane, the strand clamped to the car (y1) and the free one (y2); the
 *  governor, the car rail beside the rope, and whether the lever kind of tension weight fits the shaft. */
export interface GovernorSpot {
  side: FreeSide;
  x: number;
  y1: number;
  y2: number;
  G: Governor;
  rail: Rail;
  lever: boolean;
}

/** The side walls with neither an entrance nor the counterweight, left first. */
export function freeSides(L: Layout): FreeSide[] {
  return (['left', 'right'] as const).filter((s) => L.cwSide !== s && !L.doors.some((d) => d.wall === s));
}

/** Only for a central sling, on a side wall free of doors and of the counterweight, with room beside the car. */
export function governorSpot(L: Layout): GovernorSpot | null {
  if (L.frame.kind !== 'central') return null;
  const side = freeSides(L).at(-1);
  const rail = L.rails.find((r) => r.kind === 'car' && (side === 'left' ? r.dir === 'right' : r.dir === 'left'));
  if (!side || !rail) return null;
  const { W, D } = L.inputs, gap = side === 'left' ? L.car.x : W - (L.car.x + L.car.w), G = govSize(L.inputs.vertical.v);
  if (gap < 110) return null;
  const x = side === 'left' ? gap / 2 - 10 : W - gap / 2 + 10, y1 = rail.y + 145, y2 = y1 + 2 * G.R;
  return y2 + G.R < D - 80 ? { side, x, y1, y2, G, rail, lever: y1 + G.R + LEVER_REACH < D - 60 } : null;
}
