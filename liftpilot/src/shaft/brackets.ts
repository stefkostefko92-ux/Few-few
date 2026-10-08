// The brackets along a guide rail (registry guide.staffe): one every pitch of rail, one more at the start and one at
// the end; the first and the last at their distances from the rail's ends, the others evenly between, each moved
// clear of the fishplate of a joint. Pure: the data sheet counts them, the plan labels them, the 3D places them.
import { KV_VERT } from './norme-vert';
import { FISHPLATES, type RailType } from './rails';
import type { Section } from './section';
import type { Layout } from './types';

/** Rails come in lengths of 5 m from the pit floor: a joint with its fishplate every 5 m [mm]. */
export const RAIL_LENGTH = 5000;
/** A bracket's middle over the height it is placed at, and its clearance from a fishplate's end [mm]. */
const MID = 75, CLEAR = 90;

/** The rails stand from the pit floor up to just under the slab over the shaft [mm] (registry foglio.stime). */
export const railSpan = (S: Section): readonly [number, number] => [S.pitFloor, S.ceiling - KV_VERT.railTopGap];

/** Brackets of one rail `len` mm long: one every `pitch`, plus the first and the last. */
export const bracketCount = (len: number, pitch: number = KV_VERT.bracketPitch): number => Math.floor(len / pitch + 1e-9) + 2;

/** Heights of the brackets of a rail standing from z0 to z1 [mm]: as many as bracketCount says, the first and the last
 *  at their distances from the ends, the others evenly between; one that would sit on a joint's fishplate moves to
 *  just past its end, on its own side. */
export function bracketHeights(z0: number, z1: number, type: RailType, pitch?: number): number[] {
  const len = z1 - z0, n = bracketCount(len, pitch);
  const a = z0 + Math.min(KV_VERT.bracketFirst, len / 3), b = Math.max(a, z1 - Math.min(KV_VERT.bracketLast, len / 3));
  const keep = FISHPLATES[type].l / 2 + CLEAR, joints: number[] = [];
  for (let j = z0 + RAIL_LENGTH; j < z1; j += RAIL_LENGTH) joints.push(j);
  return Array.from({ length: n }, (_, i) => {
    const z = n > 1 ? a + ((b - a) * i) / (n - 1) : a, j = joints.find((x) => Math.abs(z + MID - x) < keep);
    return j === undefined ? z : j + (z + MID >= j ? keep : -keep) - MID;
  });
}

/** The pitches of the rail brackets the data of the installation declare [mm]; absent: the rule's. */
export interface BracketPitches {
  car?: number;
  cw?: number;
}

/** The layout with the pitches of the data of the installation, for whatever counts or places the brackets. */
export const withPitches = (L: Layout, p: BracketPitches | null | undefined): Layout =>
  p && (p.car || p.cw) ? { ...L, ...(p.car ? { carBracketPitch: p.car } : {}), ...(p.cw ? { cwBracketPitch: p.cw } : {}) } : L;

/** The intervals between the brackets of a rail, in order [mm]. */
export const bracketSpans = (hs: readonly number[]): number[] => hs.slice(1).map((z, i) => z - (hs[i] ?? z));

/** The longest interval between two brackets actually mounted on a rail from z0 to z1 [mm]: the l of the rails' check
 *  (UNI EN 81-50:2020, 5.10) and the one figure sheet 1 prints for the brackets' spacing; 0 with fewer than two. */
export const maxBracketSpan = (z0: number, z1: number, type: RailType, pitch?: number): number =>
  Math.max(0, ...bracketSpans(bracketHeights(z0, z1, type, pitch)));

/** The lengths a rail from z0 to z1 is made of: 5 m each from the pit floor, the last cut to what is left; the joints
 *  (each with its fishplate) between them [mm]. */
export function railPieces(z0: number, z1: number): { pieces: number[]; joints: number[] } {
  const pieces: number[] = [], joints: number[] = [];
  for (let z = z0; z < z1 - 1e-9; z += RAIL_LENGTH) {
    pieces.push(Math.min(RAIL_LENGTH, z1 - z));
    if (z > z0) joints.push(z);
  }
  return { pieces, joints };
}
