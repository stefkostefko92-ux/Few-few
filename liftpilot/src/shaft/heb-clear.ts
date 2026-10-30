// What the HEB beams on the shaft's walls keep clear of (heb.ts, registry locale.putrelle.vano): the ropes through the
// slab (and the governor's), KV_VERT.hebRopeGap; the upstands round the slab's openings (registry locale.fori) — the
// beams stand on their bearing plates HEB_PAD over the slab, lower than an upstand, so in plan they stay off it (m_hebkerb,
// round 36). Distances in plan, room axes [mm]; pure.
import type { HebLayout, HebShaft } from './heb';
import type { MachineSpec, RoomGeo } from './machine-room';
import { PROFILES } from './profiles';
import { kerbOf, openingsOf } from './room-draw';

type Pt = readonly [number, number];

/** The outer outlines of the upstands round the slab's openings for the machine `M` (room-draw.ts kerbOf), the hitches
 *  as deep as `S.ends` puts them (room axes). */
export const upstands = (G: RoomGeo, M: MachineSpec, S: Pick<HebShaft, 'ends'>): Pt[][] => openingsOf(S, M, G).map((o) => kerbOf(G, o));

/** An outline's extent along and across beams along `along` (0: x, 1: y). */
export const extentOf = (pts: readonly Pt[], along: number): { a: [number, number]; c: [number, number] } => {
  const as = pts.map((p) => p[along]), cs = pts.map((p) => p[1 - along]);
  return { a: [Math.min(...as), Math.max(...as)], c: [Math.min(...cs), Math.max(...cs)] };
};

/** The signed distance of a point from a beam's outline in plan (negative inside) [mm]. */
export function fromBeam(p: Pt, lay: Pick<HebLayout, 'dir' | 'profile' | 'ends'>, axis: number): number {
  const along = lay.dir === 'x' ? 0 : 1, half = PROFILES[lay.profile].b / 2;
  const dA = Math.max(lay.ends[0] - p[along], 0, p[along] - lay.ends[1]), dC = Math.abs(p[1 - along] - axis) - half;
  return dA > 0 ? Math.hypot(dA, Math.max(dC, 0)) : dC;
}

/** The signed distance of an outline (an upstand) from a beam's in plan (negative: under it) [mm]: the beams run past
 *  the shaft, the upstands lie in it, so their extents across the beams tell. */
export function outlineFromBeam(pts: readonly Pt[], lay: Pick<HebLayout, 'dir' | 'profile' | 'ends'>, axis: number): number {
  const along = lay.dir === 'x' ? 0 : 1, half = PROFILES[lay.profile].b / 2, e = extentOf(pts, along);
  const dA = Math.max(lay.ends[0] - e.a[1], 0, e.a[0] - lay.ends[1]), dC = Math.max(e.c[0] - axis - half, axis - half - e.c[1]);
  return dA > 0 ? Math.hypot(dA, Math.max(dC, 0)) : dC;
}
