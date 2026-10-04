// The overspeed governor and the place of its rope in plan. The model by the rated speed after PFB's range, or one of
// PFB's, Bode's, Dynatech's, Wittur's or Montanari's the engineer picks: its sheave and rope, and the size of its frame
// (research/argano-geared/18-porte-limitatori-tenditori-tutti.md, read on 2026-10-02). PFB's heights, axles and bases
// are those printed on the drawings of its manuals (download.pfb.it); the LK200-LK315 share one drawing, with the axle
// 165 mm over the base and two heights not explained (230 and 415: the larger is taken), and the base of a dealer's
// listing. Bode's GB 7 and GB 8 and Dynatech's VEGA 200 from their drawings hosted by a dealer; Wittur's (no dimension
// published) and Montanari's (search extracts) are drawn in the software's proportions. The governor goes on a side
// wall with neither a door nor the counterweight, its rope in the gap beside the car next to the car rail, the tension
// weight in the pit clamped to that rail. Plan in millimetres as in types.ts. Pure: the machine room plan draws it, the
// 3D builds it.
import type { Layout, Rail } from './types';

export type GovernorBrand = 'PFB' | 'Bode' | 'Dynatech' | 'Wittur' | 'Montanari';

/** A governor: maker, model, highest rated speed, sheave pitch radius and rope radius, the rim's half width, the
 *  axle's height over the base and the frame's top over the axle, the base's half sizes across the rope and along it
 *  [mm]. */
export interface Governor {
  brand: GovernorBrand;
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

/** A governor without published dimensions, in the software's proportions from its sheave's diameter (370 mm high for
 *  Ø 200: the dealers' height of PFB's LK200 and the «C» of Montanari's RQ 250 and RQ 300): Ø dia, rope Ø ropeD, rated
 *  speeds up to vMax; `h` its published height over all, when there is one. */
const scaled = (brand: GovernorBrand, model: string, vMax: number, dia: number, ropeD: number, h?: number): Governor => {
  const k = dia - 200, axle = 240 + 0.9 * k, top = 130 + 0.8 * k, f = h ? h / (axle + top) : 1;
  return { brand, model, vMax, R: dia / 2, rope: ropeD / 2, half: 15 + 0.05 * k, axle: axle * f, top: top * f, baseA: 82.5 + 0.375 * k, baseW: 110 + 0.08 * k };
};

/** A governor as its maker's drawing gives it: the height over all, the axle over the base and the base [mm] (its long
 *  side along the sheave's plane, as on the LK200: the drawings do not always say which side is which). */
const drawn = (brand: GovernorBrand, model: string, vMax: number, dia: number, ropeD: number, h: number, axle: number, base: readonly [number, number]): Governor =>
  ({ ...scaled(brand, model, vMax, dia, ropeD), axle, top: h - axle, baseW: base[0] / 2, baseA: base[1] / 2 });

/** The highest rated speed whose tripping speed, at least 115 % of it, a governor reaching `vTrip` [m/s] gives. */
const fromTrip = (vTrip: number): number => Math.floor((vTrip / 1.15) * 100) / 100;

/** PFB's governors by rated speed: LK200 Ø 200 rope 6 to 1,48 m/s, LK250 Ø 250 rope 6–8 to 1,74 m/s, LK300 Ø 300 rope
 *  6–8 to 2,93 m/s; over that the R12BF (Ø 345, rope 8–10, to 4,00 m/s, rope-clamping, one way). The rest can be
 *  picked: PFB's LX, LK120, R1, R3LR, R5, R6, R10BF; Bode's GB 7 and GB 8 (EU type examinations EU-OG 068 and 069; the
 *  rated speed from the highest tripping speed, of the GB 8 the drawing's 1,49 m/s rather than the brochure's 2,04);
 *  Dynatech's VEGA 200 (sold in Italy by Donati); Wittur's OL20, OL35, EOS and OL100 (OL20's base from a copy of its
 *  manual); Montanari's RQ-A 200/250/300 and RC 200/300 (the family's rated speeds 0,15–3,0 and 1,60–4,2 m/s: the limit
 *  of each size is not published), NOR Ø 300 to 1,50 m/s, RG 200 to 0,30 m/s (an older range). */
export const GOVERNORS: readonly Governor[] = [
  drawn('PFB', 'LK200', 1.48, 200, 6, 415, 165, [220, 165]), drawn('PFB', 'LK250', 1.74, 250, 6, 415, 165, [220, 165]),
  drawn('PFB', 'LK300', 2.93, 300, 8, 415, 165, [220, 165]), drawn('PFB', 'R12BF', 4, 345, 8, 524, 337, [520, 116]),
  drawn('PFB', 'LX120', 2, 120, 6, 178, 70.5, [146, 71]), drawn('PFB', 'LK120', 2, 120, 4, 270, 71, [180, 71]),
  drawn('PFB', 'LX150', 2.34, 150, 6, 274, 86, [140, 76]), drawn('PFB', 'LX180', 2.17, 180, 6, 322, 107, [140, 76]),
  drawn('PFB', 'LX200', 2.3, 200, 6, 349, 110, [190, 76]), drawn('PFB', 'R1 200', 1.83, 200, 6, 344, 190.5, [285, 80]),
  drawn('PFB', 'R1 250', 1.96, 250, 6, 344, 190.5, [285, 80]), drawn('PFB', 'LK315', 2.81, 315, 8, 415, 165, [220, 130]),
  drawn('PFB', 'R10BF', 2.35, 315, 8, 488, 303, [460, 196]), drawn('PFB', 'R1-LR', 2.23, 300, 8, 344, 190.5, [285, 80]),
  drawn('PFB', 'R3LR', 1.73, 250, 6, 348, 157, [196, 115]), drawn('PFB', 'R5', 1.55, 200, 6, 261, 120, [204, 150]),
  drawn('PFB', 'R6', 2.09, 300, 8, 335, 168, [238, 150]),
  drawn('Bode', 'GB 7', fromTrip(3.43), 300, 8, 360, 205, [325, 165]), drawn('Bode', 'GB 8', fromTrip(1.49), 200, 6, 315, 205, [221, 170]),
  drawn('Dynatech', 'VEGA 200', 2.4, 200, 6, 332, 199.5, [200, 117]),
  { ...scaled('Wittur', 'OL20', 1.75, 180, 6), baseW: 95, baseA: 62.5 }, scaled('Wittur', 'OL35', 3, 200, 6), scaled('Wittur', 'EOS', 2.5, 200, 6),
  scaled('Wittur', 'EOS 300', 2.5, 300, 8), scaled('Wittur', 'OL100', 10, 304, 8),
  scaled('Montanari', 'RQ-A 200', 3, 200, 6), scaled('Montanari', 'RQ-A 250', 3, 250, 6), scaled('Montanari', 'RQ-A 300', 3, 300, 8),
  scaled('Montanari', 'RC 200', 4.2, 200, 6), scaled('Montanari', 'RC 300', 4.2, 300, 8),
  scaled('Montanari', 'NOR', 1.5, 300, 8), scaled('Montanari', 'RG 200', 0.3, 200, 6),
];

/** The governor for a rated speed [m/s]: the model chosen when it takes the speed, else the smallest of the LK series
 *  (and the R12BF) that does. */
export const govSize = (v: number, model?: string): Governor => {
  const chosen = model ? GOVERNORS.find((g) => g.model === model) : undefined;
  return chosen && v <= chosen.vMax + 1e-9 ? chosen : GOVERNORS.slice(0, 4).find((g) => v <= g.vMax + 1e-9) ?? GOVERNORS[3];
};

/** How far the lever kind of tension weight reaches past its pulley's centre along the rope's plane [mm]: 700 mm over
 *  all (dimension "A" of the PFB R4KE for the LK200 in a reseller's listing, its meaning not stated) with the pulley
 *  255 mm from the hinge's end — the software's choice, no source (registry ingombri.limitatore). */
export const LEVER_REACH = 445;

/** The tension weight [mm]: the lever's hinge past the clip, its bars' inner face and thickness; the weights in cast
 *  iron (7,2 kg/dm³) across × along the rope's plane × high — the lever's 113 × 150 × 185 ≈ 22 kg (the masses are PFB's
 *  for the LK200; 113 is dimension "C" of the R4KE in a reseller's listing, 150 and 185 are chosen to give the mass),
 *  the vertical kind's 150 × 160 × 250 ≈ 43 kg (PFB R4R, 44 kg; sizes chosen to give the mass) — and the lever
 *  weight's middle, as far out as the lever reaches. */
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
  const { W, D } = L.inputs, gap = side === 'left' ? L.car.x : W - (L.car.x + L.car.w), G = govSize(L.inputs.vertical.v, L.inputs.governor);
  if (gap < 110) return null;
  const x = side === 'left' ? gap / 2 - 10 : W - gap / 2 + 10, y1 = rail.y + 145, y2 = y1 + 2 * G.R;
  return y2 + G.R < D - 80 ? { side, x, y1, y2, G, rail, lever: y1 + G.R + LEVER_REACH < D - 60 } : null;
}
