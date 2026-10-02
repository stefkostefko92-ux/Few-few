// Panev's sliding supports SC (catalogue section 04, pp. 39-55): the rail's foot along the wall, its blade into the
// shaft. The SC is anchored to the wall through its flange (65 mm high, W deep plate folded off its top); the SG lies
// on its plate along the wall, its flange carrying the rail's foot, held by two N1 clips through the flange's slots.
// The SG slides along the wall (the printed "range regolazione": the rail's axis that far from either end of the SC,
// pp. 40-54) and away from it, its flange from 2 mm past the SC's edge out to where the montage drawings show it
// (pp. 41-55: 70, 88, 130 and 140 mm from the wall for SC 50, 60, 80 and 90). Pure: the plan draws it
// (plan-staffe-sc.ts), the 3D builds it (components/lift3d/staffe.ts).
import { seatRail, type SgLength } from './staffe';
import type { CwSupportCode } from './staffe-ids';

export interface ScSupport {
  code: CwSupportCode;
  /** plate depth from the wall and length along it [mm] */
  W: 50 | 60 | 80 | 90;
  L: 200 | 220;
  /** the rail's axis from the SC's end it is measured from [mm] */
  range: readonly [number, number];
  /** the back of the rail's foot (the SG flange's face) from the wall [mm] */
  gap: readonly [number, number];
  /** the SG it is paired with: width and length */
  sg: { w: 50 | 60 | 80; l: SgLength };
}

export const SC_SUPPORTS: readonly ScSupport[] = [
  { code: 'SC 50 200', W: 50, L: 200, range: [45, 210], gap: [52, 70], sg: { w: 50, l: 190 } },
  { code: 'SC 60 200', W: 60, L: 200, range: [45, 213], gap: [62, 88], sg: { w: 60, l: 190 } },
  { code: 'SC 80 200', W: 80, L: 200, range: [45, 215], gap: [82, 130], sg: { w: 80, l: 190 } },
  { code: 'SC 90 200', W: 90, L: 200, range: [45, 215], gap: [92, 140], sg: { w: 80, l: 190 } },
  { code: 'SC 50 220', W: 50, L: 220, range: [45, 235], gap: [52, 70], sg: { w: 50, l: 220 } },
  { code: 'SC 60 220', W: 60, L: 220, range: [45, 235], gap: [62, 88], sg: { w: 60, l: 220 } },
  { code: 'SC 80 220', W: 80, L: 220, range: [45, 255], gap: [82, 130], sg: { w: 80, l: 220 } },
  { code: 'SC 90 220', W: 90, L: 220, range: [45, 235], gap: [92, 140], sg: { w: 80, l: 220 } },
];

/** Slot runs along the SC's plate and flange [x0, x1] (pp. 40-55; the 170 of the made-to-measure SC 50 170, p. 61). */
export const SC_RUNS: Readonly<Record<170 | 200 | 220, { plate: readonly (readonly [number, number])[]; flange: readonly (readonly [number, number])[] }>> = {
  170: { plate: [[11, 50], [65, 105], [120, 159]], flange: [[10, 75], [95, 160]] },
  200: { plate: [[11, 61], [70, 130], [139, 189]], flange: [[10, 90], [110, 190]] },
  220: { plate: [[11, 70], [80, 140], [150, 209]], flange: [[10, 100], [120, 210]] },
};
export const SC_T = 4;

/** The row of the SC's plate (from the wall) the SG is bolted through, with its flange `gap` from the wall: SC 50 and
 *  60 have one row of slots, SC 80 and 90 two; the one inside the SG's slots, 5 mm in from their ends. */
export function scBoltRow(sc: ScSupport, gap: number): number {
  const rows = sc.W <= 60 ? [sc.W - 22] : [sc.W - 35, sc.W - 15.5], y1 = sc.sg.w - (sc.sg.w >= 80 ? 10 : 5), lo = gap - y1 + 5, hi = gap - 25;
  return rows.find((y) => y >= lo && y <= hi) ?? rows.reduce((a, b) => (Math.abs(b - (lo + hi) / 2) < Math.abs(a - (lo + hi) / 2) ? b : a));
}

/** An SC in place along its wall [mm in the wall's u]: the SC from s, the SG from a, the rail's axis c from the SG's
 *  start, its clips' seats; `slack`: the least room left on the wall, in the range and in the gap. */
export interface ScPlace { s: number; a: number; c: number; seats: [number, number][]; slack: number }

/** Where an SC goes for a rail whose axis is at u along the wall and its foot `gap` from it, the wall free from lo to
 *  hi along it (corners, door frames), the foot `half` wide each side: the place with the most room, or null when the
 *  SC cannot take the rail. The SG starts at most 10 mm before the SC and ends at most 70 mm past it (panev/3d's
 *  assembly), each clip's shank in a slot of its flange. */
export function scPlace(sc: ScSupport, u: number, gap: number, lo: number, hi: number, half: number): ScPlace | null {
  const { L } = sc, l = sc.sg.l, [r0, r1] = sc.range, inGap = Math.min(gap - sc.gap[0], sc.gap[1] - gap);
  if (inGap < 0) return null;
  // the place with the most room (the first of equals); the rail is seated on its SG there only, the seat not changing it
  let best: { s: number; aLo: number; aHi: number; slack: number } | null = null;
  for (let s = Math.ceil(Math.max(lo, u - r1)); s <= Math.min(hi - L, u - L + r1); s += 1) {
    // the rail's axis from the SC's nearer end, as the printed range measures it (the SC is ambidextrous)
    const fromEnd = Math.max(u - s, s + L - u), along = Math.min(s - lo, hi - L - s, r1 - fromEnd, fromEnd - r0);
    if (along < 0) continue;
    const aLo = Math.max(s - 10, lo), aHi = Math.min(s + L - l + 70, hi - l);
    if (aLo > aHi || u - aHi > l || u - aLo < 0) continue;
    const slack = Math.min(along, inGap);
    if (!best || slack > best.slack) best = { s, aLo, aHi, slack };
  }
  if (!best) return null;
  const seat = seatRail(l, l / 2, u - best.aHi, u - best.aLo, half);
  return { s: best.s, a: u - seat.c, c: seat.c, seats: seat.seats, slack: best.slack };
}

/** How near an SC comes to taking the rail [mm]: below 0 by how much it misses the gap or the room along the wall. */
export function scMiss(sc: ScSupport, u: number, gap: number, lo: number, hi: number): number {
  const r1 = sc.range[1], inGap = Math.min(gap - sc.gap[0], sc.gap[1] - gap);
  return Math.min(inGap, Math.min(hi - sc.L, u - sc.L + r1) - Math.max(lo, u - r1));
}
