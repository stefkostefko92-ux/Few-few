// The rails' development cut into columns at the joints (rails-dev.ts draws them; the rails' sheet chooses the scale and
// how many columns a sheet takes): each column from a joint to a joint — the first from under the pit's slab, the last
// up over the slab over the shaft —, drawn from a little under the last bracket below the joint it starts at, so that
// its chains go on from there: every interval between two brackets and every length of rail is dimensioned in one
// column only, as one chain from the pit floor would. Pure.
import { railSpan } from './brackets';
import { designPieces, railHeights, wallCarRail } from './rail-brackets';
import { section } from './section';
import type { Layout, Rail } from './types';

/** The slabs' thickness drawn under the pit and over the shaft [mm]. */
export const DEV_SLAB = 220;

export interface DevColumn {
  /** the joints it starts and ends at; null: the first starts at the pit, the last ends at the top */
  from: number | null;
  to: number | null;
  /** the heights it draws [mm] */
  lo: number;
  hi: number;
}

/** The two rails the development shows: a car rail anchored to a wall (a side counterweight's bridge carries the other)
 *  and a counterweight rail. */
export function devRails(L: Layout): Rail[] {
  const car = wallCarRail(L), cw = L.rails.find((r) => r.kind === 'cw');
  return [...(car ? [car] : []), ...(cw ? [cw] : [])];
}

/** The heights the development spans: from under the pit's slab to over the slab over the shaft [mm]. */
export function devSpan(L: Layout): readonly [number, number] {
  const S = section(L);
  return [S.pitFloor - DEV_SLAB, S.ceiling + DEV_SLAB];
}

/** The columns of the development, each at most `cap` mm of the rails tall where it can be; `pad`: how far a column
 *  runs on past the joint it ends at and under the last bracket below the joint the next starts at [mm]. One column when
 *  it all fits. */
export function devColumns(L: Layout, cap = Infinity, pad = 0): DevColumn[] {
  const [b, t] = devSpan(L), { joints } = designPieces(L), hs = devRails(L).map((r) => railHeights(L, r));
  // where a column starting at joint j is drawn from: under the last bracket of each rail below it
  const startOf = (j: number): number => Math.min(j, ...hs.map((h) => h.filter((z) => z < j).at(-1) ?? j)) - pad;
  const out: DevColumn[] = [];
  let lo = b, from: number | null = null;
  while (t - lo > cap + 1e-6) {
    const after = joints.filter((j) => from === null || j > from + 1e-6), j = after.filter((x) => x + pad - lo <= cap + 1e-6).at(-1) ?? after[0];
    if (j === undefined) break;
    out.push({ from, to: j, lo, hi: j + pad });
    from = j;
    lo = startOf(j);
  }
  out.push({ from, to: null, lo, hi: t });
  return out;
}

/** The points of a rail's two chains in a column: its brackets' (from the pit floor in the first column, from the last
 *  bracket under the joint it starts at in the others; up to the rail's top in the last) and its lengths' (from joint to
 *  joint, the rail's ends in the first and the last) [mm]. */
export function columnChains(L: Layout, r: Rail, c: DevColumn): { brackets: number[]; lengths: number[] } {
  const [z0, z1] = railSpan(section(L)), hs = railHeights(L, r), { joints } = designPieces(L);
  const inside = (z: number): boolean => (c.from === null || z >= c.from) && (c.to === null || z < c.to);
  const before = c.from === null ? z0 : hs.filter((z) => c.from !== null && z < c.from).at(-1);
  const brackets = [...(before === undefined ? [] : [before]), ...hs.filter(inside), ...(c.to === null ? [z1] : [])];
  const lengths = [c.from ?? z0, ...joints.filter((j) => (c.from === null || j > c.from + 1e-6) && (c.to === null || j < c.to - 1e-6)), c.to ?? z1];
  return { brackets, lengths };
}
