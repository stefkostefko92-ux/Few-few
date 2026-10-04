// Panev's landing-door brackets (catalogue pp. 14-18): the fixing bracket B anchored to the wall below the opening and
// the support plate A bolted to its rib through the joint and the lock, under the sill, of the same section. The plate
// is cut to the sill's depth on site (p. 05: "l'elemento di supporto può essere tagliato a misura"); the software puts
// one pair every 400 mm of the opening, at least three, the end ones 10 mm in from its edges. Without a choice the
// strongest pair, A 65 170 7 + B 65 320 (5 mm, ±8°). Over the door the same pair turned upside down carries the
// suspension (p. 04: the brackets hold the sill "o l'elemento portante della porta di piano"; the mounting is the
// software's): B on the wall over the opening with its joint at the foot, A's platform on the suspension's top,
// which hangs from it on bolts through A's holes; along the suspension, by the same rule. Where the floor above is near
// enough for its sill's pairs to stand at the same heights, an upper pair falling on one of them moves beside it. Pure:
// the 3D builds them (components/lift3d/staffe.ts), the section draws them (section-staffe.ts), the bill of materials
// counts them.
import { HEADER, SILL_H, headerSpan } from './sill';
import { DOOR_PAIRS, type DoorPairId } from './staffe-ids';
import type { DoorLayout, ShaftInputs } from './types';

export type DoorSection = 65 | 45 | 37;

/** A support plate A as built (panev/3d/src/catalog.js): length × width, its sill slots across (count) or two along. */
export interface PlateA { code: string; section: DoorSection; length: number; width: number; slots: 'cross' | 'long'; count: number }

export const PLATES_A: Readonly<Record<string, PlateA>> = {
  'A 65 170 7': { code: 'A 65 170 7', section: 65, length: 170, width: 75, slots: 'cross', count: 7 },
  'A 45 170 7': { code: 'A 45 170 7', section: 45, length: 170, width: 70, slots: 'cross', count: 7 },
  'A 45 175 2': { code: 'A 45 175 2', section: 45, length: 175, width: 60, slots: 'long', count: 2 },
  'A 37 150 7': { code: 'A 37 150 7', section: 37, length: 150, width: 70, slots: 'cross', count: 6 },
  'A 37 170 2': { code: 'A 37 170 2', section: 37, length: 170, width: 60, slots: 'long', count: 2 },
};

export interface DoorPair {
  id: DoorPairId;
  a: PlateA;
  /** the bracket B: its code and length [mm] */
  b: { code: string; length: 220 | 320 };
}

export function doorPair(id: DoorPairId): DoorPair {
  const [a, b] = id.split(' + '), length = b.endsWith('320') ? 320 : 220;
  return { id, a: PLATES_A[a], b: { code: b, length } };
}

export const DOOR_PAIR_DEFAULT: DoorPairId = DOOR_PAIRS[0];

/** The pair of the design's landing doors: the one chosen, else the default. */
export const doorPairOf = (I: ShaftInputs): DoorPair => doorPair(I.panev?.door ?? DOOR_PAIR_DEFAULT);

/** Brackets under one sill from u0 to u1 along the wall [mm]: one every 400 mm, at least three. */
export const doorBracketCount = (u0: number, u1: number): number => Math.max(3, Math.ceil((u1 - u0) / 400) + 1);

/** Where the pairs over a landing door `d` (its landing layout) stand along its wall of length `len`: the
 *  suspension's span 10 mm in from its ends [mm]. */
export function topBracketSpan(d: DoorLayout, len: number): readonly [number, number] {
  const [lo, hi] = headerSpan(d, len);
  return [lo + 10, hi - 10];
}

/** Along-wall positions of the pairs from u0 to u1 [mm]: one every 400 mm, at least three, the end ones at u0 and u1. */
export function bracketsAlong(u0: number, u1: number): number[] {
  const n = doorBracketCount(u0, u1);
  return Array.from({ length: n }, (_, i) => u0 + ((u1 - u0) * i) / (n - 1));
}

/** Rib 15 of B by section (pp. 14-18): full width down to `full` from the top, then a taper to `foot`; joint hole
 *  `pivot` below the top at `col` from the wall, locking slot `drop` below it; the fixing face `face` wide, sheet `t`. */
export const B_SECTIONS = {
  65: { t: 5, rib: 65, face: 65, full: 160, foot: 20, pivot: 20, col: 33.5, drop: 115, lock: 35, lockAt: 34 },
  45: { t: 5, rib: 45, face: 60, full: 138, foot: 15, pivot: 18, col: 23.5, drop: 95, lock: 26, lockAt: 25 },
  37: { t: 4, rib: 37, face: 60, full: 134, foot: 20, pivot: 16, col: 20, drop: 85, lock: 20, lockAt: 21 },
} as const;

/** Rib 16 of A (x from the wall end along the platform, y down from the mould line): strip, chamfer, the leg bolted
 *  to rib 15 of B; its holes [x, y, slot length] (pp. 14-18). */
export const A_LEGS = {
  65: { t: 5, strip: 30, chamfer: [80, 50, 60], legIn: [50, 165], legOut: [10, 165], holes: [[30, 33, 22], [30, 149, 22]] },
  45: { t: 5, strip: 29, chamfer: [64, 40, 69], legIn: [29, 140], legOut: [8, 140], holes: [[19, 31, 0], [19, 125, 14]] },
  37: { t: 4, strip: 25, chamfer: [49, 28, 69], legIn: [27, 120], legOut: [4, 120], holes: [[15, 25, 0], [15, 110, 14]] },
} as const;

/** A pair in place under a sill whose underside is at `sillBottom` [mm]: B's bottom (its length up from there), the
 *  joint bolt's height, A's top (under the sill) and its wall end's distance from the wall (the joint hole's column on
 *  B's rib less its distance along A), as the 3D places them. */
export function pairPose(p: DoorPair, sillBottom: number): { base: number; pivot: number; aTop: number; aWall: number } {
  const s = B_SECTIONS[p.a.section], g = A_LEGS[p.a.section], L = p.b.length, [hx, hy] = g.holes[0];
  const pivot = L - s.pivot, aY = pivot - (g.t - hy), base = sillBottom - (aY + g.t);
  return { base, pivot: base + pivot, aTop: sillBottom, aWall: s.col - hx };
}

/** How far A's platform reaches from the wall when cut to the sill's depth (4 mm short of its nosing), and whether the
 *  plate is long enough to reach that far [mm]. */
export function plateReach(p: PlateA, depth: number): { offset: number; cut: number; short: boolean } {
  const offset = B_SECTIONS[p.section].col - A_LEGS[p.section].holes[0][0], need = Math.round(depth - offset - 4);
  return { offset, cut: Math.min(need, p.length), short: need > p.length };
}

/** The pairs over a landing door `d` at the level zf, on its wall of length `len`, along the suspension (topBracketSpan).
 *  `up`: the level of the floor above when its door is on the same wall; if its sill's pairs reach down to the heights
 *  of these, a pair falling on one of them (closer than B's face and 10 mm) moves beside it, on the nearer side within
 *  the span. Along-wall positions [mm]. */
export function topBracketsAt(p: DoorPair, d: DoorLayout, len: number, zf: number, up?: number): number[] {
  const [u0, u1] = topBracketSpan(d, len), at = bracketsAlong(u0, u1), { base, aTop } = pairPose(p, 0), h = aTop - base;
  if (up === undefined || zf + d.height + HEADER.top + h <= up - SILL_H - h) return at;
  const below = bracketsAlong(d.u0 + 10, d.u1 - 10), gap = B_SECTIONS[p.a.section].face + 10;
  return at.map((u) => {
    const hit = below.find((b) => Math.abs(b - u) < gap);
    if (hit === undefined) return u;
    return [hit - gap, hit + gap].filter((x) => x >= u0 && x <= u1).sort((x, y) => Math.abs(x - u) - Math.abs(y - u))[0] ?? u;
  });
}
