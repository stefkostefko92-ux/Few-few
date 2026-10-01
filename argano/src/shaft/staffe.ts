// Panev's counterweight-guide supports as the 2026 catalogue pairs and sets them (panev/docs/catalogo-staffe-panev-2026.pdf
// in the monorepo, pp. 20-59): the support SU or SD anchored to the wall (its flange 65 mm high, the plate folded off its top), the SG
// guide bracket bolted along its arm, the rail clamped to the SG's flange by two forged N1 clips whose shanks stand in
// the flange's slots. Which support takes a rail at a distance from its wall, and where on the SG the rail sits. Pure:
// the plan draws them (plan-view.ts), the 3D builds them (components/lift3d/staffe.ts).
import type { HeadWalls, Rail, ShaftInputs, Wall } from './types';

export type V2 = [number, number];

export const SUPPORT_H = 65;

/** Plate outlines in (x along the wall, y out from it), the arm last (pp. 21-55); flange slots [x0, x1]. */
export const PLATES = {
  SU: { flange: 220, span: 220, arm: [160, 220], outline: (Lp: number): V2[] => [[0, 0], [0, 20], [130, 50], [160, 110], [160, Lp], [220, Lp], [220, 0]], slots: [[11, 83], [95, 193]] },
  SD150: { flange: 150, span: 90, arm: [30, 90], outline: (Lp: number): V2[] => [[0, 0], [0, 30], [30, 110], [30, Lp], [90, Lp], [90, 0]], slots: [[10, 61], [105, 145]] },
  SD220: { flange: 220, span: 160, arm: [100, 160], outline: (Lp: number): V2[] => [[0, 0], [0, 30], [70, 50], [100, 110], [100, Lp], [160, Lp], [160, 0]], slots: [[11, 83], [161, 215]] },
} as const;
export type ArmKind = keyof typeof PLATES;

/** SG W L (pp. 57-59): transverse Ø10 slot stations on the plate, 20 mm pitch from 15 mm in at each end. */
export const STATIONS: Record<130 | 150 | 170 | 190 | 220, readonly number[]> = {
  130: [15, 35, 55, 75, 95, 115],
  150: [15, 35, 55, 95, 115, 135],
  170: [15, 35, 55, 85, 115, 135, 155],
  190: [15, 35, 55, 75, 115, 135, 155, 175],
  220: [15, 35, 55, 75, 110, 145, 165, 185, 205],
};
export type SgLength = keyof typeof STATIONS;
export const SG_FLANGE = 50, SG_T = 4, SG_SLOT = 11; // the flange slots take the clips' M10 shanks

/** Flange slots 10 mm in from each end, 8 mm webs: two up to 150 mm, from 170 mm a 73 mm one between two shorter. */
export function flangeRuns(L: number): V2[] {
  if (L <= 150) {
    const s = (L - 28) / 2;
    return [[10, 10 + s], [18 + s, L - 10]];
  }
  const sh = (L - 109) / 2;
  return [[10, 10 + sh], [18 + sh, 91 + sh], [99 + sh, L - 10]];
}

/** The forged N1 clip [mm]: its nose over the rail's foot and its heel on the bracket, width, shank. */
export const N1 = { nose: 19.5, heel: 16.5, width: 20, tip: 14, top: 14, foot: 5, relief: 0.8, pad: -7, shank: 25 } as const;

/** Adjustment range printed on each support's page (pp. 20-38), and the SG it is paired with. */
export const SUPPORTS: readonly { kind: ArmKind; Lp: 160 | 180 | 200; range: readonly [number, number]; sg: SgLength }[] = [
  { kind: 'SU', Lp: 160, range: [45, 155], sg: 150 }, { kind: 'SU', Lp: 180, range: [45, 195], sg: 170 }, { kind: 'SU', Lp: 200, range: [45, 215], sg: 190 },
  { kind: 'SD220', Lp: 160, range: [50, 155], sg: 150 }, { kind: 'SD220', Lp: 180, range: [45, 195], sg: 170 }, { kind: 'SD220', Lp: 200, range: [45, 215], sg: 190 },
  { kind: 'SD150', Lp: 160, range: [45, 155], sg: 150 }, { kind: 'SD150', Lp: 180, range: [45, 195], sg: 170 }, { kind: 'SD150', Lp: 200, range: [45, 215], sg: 190 },
];

/** Where the rail sits on an SG `l` long: c from its start, the place nearest `want` in [lo, hi] where both clips'
 *  shanks stand in the flange's slots (5 mm in from their ends) and their heels stay on the SG, each clip as near
 *  35 mm from the rail's centre as its slot allows (the foot `half` wide each side). */
export function seatRail(l: number, want: number, lo: number, hi: number, half: number): { c: number; seats: [number, number][] } {
  const runs = flangeRuns(l), min = half - N1.pad + 0.5, max = half + N1.nose - 4;
  const miss = (s: number, side: number): number => {
    const heel = s + side * N1.heel;
    return Math.min(...runs.map(([a, b]) => Math.max(a + 5 - s, s - (b - 5), 0))) + Math.max(0, -heel, heel - l);
  };
  const clipAt = (c: number, side: number): { d: number; m: number; score: number } => {
    let pick = { d: min, m: Infinity, score: Infinity };
    for (let d = min; d <= max + 1e-9; d += 0.5) {
      const m = miss(c + side * d, side), score = m * 1000 + Math.abs(d - 35);
      if (score < pick.score) pick = { d, m, score };
    }
    return pick;
  };
  let best = { c: 0, seats: [[-1, min], [1, min]] as [number, number][], score: Infinity };
  for (let c = Math.max(0, lo); c <= Math.min(l, hi) + 1e-9; c += 0.5) {
    const [a, b] = [clipAt(c, -1), clipAt(c, 1)], score = (a.m + b.m) * 1000 + Math.abs(c - want);
    if (score < best.score) best = { c, seats: [[-1, a.d], [1, b.d]], score };
  }
  return best;
}

export type Support = (typeof SUPPORTS)[number];

/** A support's code in the catalogue: SU 220 160, SD 150 180, SD 220 200… */
export const supportCode = (s: Support): string => `${s.kind === 'SU' ? 'SU 220' : s.kind === 'SD150' ? 'SD 150' : 'SD 220'} ${s.Lp}`;

/** The least room a support's plate needs on the wall behind the rail's foot (SD 150) [mm]. */
export const PANEV_BACK = Math.min(...SUPPORTS.map((s) => PLATES[s.kind].arm[1] + 10));

/** The support for a rail `reach` mm from the wall, with `back` mm free on the wall behind its foot and `ahead` in
 *  front of it (an SD's flange runs on past the arm), or null. */
export function supportFor(reach: number, back: number, ahead: number): Support | null {
  return SUPPORTS.find((s) => reach >= s.range[0] && reach <= s.range[1] && PLATES[s.kind].arm[1] + 10 <= back && PLATES[s.kind].flange - PLATES[s.kind].arm[1] + 10 <= ahead) ?? null;
}

/** A counterweight rail on its wall: the wall, the back of the rail's foot along it, the rail's axis from the wall
 *  (`reach`), whether the blade points toward lower u (`mirror`), how far behind the main floor's face of the wall the
 *  bracket's wall is (`inset`: the back of a niche; below 0 a wall that stands in at the head) and the room on the wall
 *  behind the foot and in front of it (inside the niche: `span` along the wall). Null when the blade does not run
 *  along the wall: the catalogue's supports carry the rail's foot square to it. `h`: blade height; `head`: the walls
 *  where they stand in the headroom (head.ts), else as at the main floor. */
function onItsWall(r: Rail, h: number, W: number, D: number, span?: readonly [number, number], head?: HeadWalls) {
  const across = r.bracketAxis === 'y', along = across ? r.dir === 'left' || r.dir === 'right' : r.dir === 'back' || r.dir === 'front';
  const far = across ? D : W, high = r.bracketTo > far / 2, inset = high ? r.bracketTo - far : -r.bracketTo;
  if (!along || inset < -1) return null;
  const wall: Wall = across ? (high ? 'rear' : 'front') : high ? 'right' : 'left';
  const sign = r.dir === 'right' || r.dir === 'back' ? 1 : -1, [lo, hi] = span ?? [0, across ? W : D];
  const shift = head?.[wall] ?? 0, foot = (across ? r.x : r.y) - sign * h, reach = Math.abs(r.bracketTo - (across ? r.y : r.x)) - shift;
  const back = sign > 0 ? foot - lo : hi - foot;
  return { wall, foot, reach, mirror: sign < 0, inset: Math.max(0, inset) - shift, back, ahead: hi - lo - back };
}

/** Where a counterweight rail's Panev support goes, with the support: the shortest whose printed range takes the rail's
 *  distance from its wall (or from the back of its niche) and whose plate fits on the wall; null when none does. */
export function cwSupport(r: Rail, h: number, W: number, D: number, span?: readonly [number, number], head?: HeadWalls): { wall: Wall; foot: number; reach: number; mirror: boolean; sup: Support; inset: number } | null {
  const g = onItsWall(r, h, W, D, span, head), sup = g && supportFor(g.reach, g.back, g.ahead);
  return g && sup ? { wall: g.wall, foot: g.foot, reach: g.reach, mirror: g.mirror, sup, inset: g.inset } : null;
}

/** How well the catalogue takes a rail [mm]: the tightest margin (range, room for the plate) of the support chosen;
 *  when none fits, below 0 by how much the nearest misses; null when its blade does not run along its wall. */
export function supportMargin(r: Rail, h: number, W: number, D: number, span?: readonly [number, number], head?: HeadWalls): number | null {
  const g = onItsWall(r, h, W, D, span, head);
  if (!g) return null;
  const margin = (s: Support): number => Math.min(g.reach - s.range[0], s.range[1] - g.reach, g.back - (PLATES[s.kind].arm[1] + 10), g.ahead - (PLATES[s.kind].flange - PLATES[s.kind].arm[1] + 10));
  const sup = supportFor(g.reach, g.back, g.ahead);
  return sup ? margin(sup) : Math.max(...SUPPORTS.map(margin));
}

/** The brackets of the counterweight rails the design uses: Panev's supports unless generic ones are chosen. */
export const cwBracketsOf = (I: ShaftInputs): 'panev' | 'generic' => I.cwBrackets ?? 'panev';
