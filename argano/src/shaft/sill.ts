// The entrances' sills and door tracks, shared by the drawings and the 3D: the extruded aluminium section of a sill (a
// walking face with fine ribs, a groove under each door track for the panels' shoes, the rounded nosing toward the
// gap) and where the panels run: the landing door's tracks set back from its sill's edge at the landing's depth, the
// car door's from the edge of its sill. Millimetres; v across the door's wall from its inner face, z up. Pure.
import type { DoorLayout } from './types';

export interface Tracks { fast: number; slow: number }

/** Door panels' thickness [mm]: landing and car. */
export const LANDING_PANEL = 26, CAR_PANEL = 24;

/** The tracks of a landing door, set back from the edge of its sill at the landing's depth: the fast panel by the gap,
 *  the slow one by the wall (50 and 12 mm at the usual 80 mm). */
export const landingTracks = (depth: number): Tracks => ({ fast: depth - 30, slow: depth - 68 });

/** The tracks of a car door from the edge of its sill v0 (the landing's depth and the sill gap). */
export const carTracks = (v0: number): Tracks => ({ fast: v0 + 10, slow: v0 + 46 });

/** The centre planes of the tracks a door runs on, for the grooves of the sill. */
export const trackPlanes = (d: DoorLayout, tr: Tracks, t: number): number[] => (d.kind === 'C2' ? [tr.fast + t / 2] : [tr.fast + t / 2, tr.slow + t / 2]);

// height of the extrusion, groove width and depth, rib pitch and depth [mm]
export const SILL_H = 24, GROOVE = 11, GROOVE_D = 14;
const RIB = 4, RIB_D = 0.9;

/** The section across a sill from v0 (inner edge) to v1 (nosing), top at 0, as [v, z] points; a groove at each of
 *  `grooves`. `flip`: the nosing at v0 instead (a car sill faces the landing, toward the wall). */
export function sillSection(v0: number, v1: number, grooves: readonly number[], flip: boolean): [number, number][] {
  const m = (v: number, z: number): [number, number] => [flip ? v0 + v1 - v : v, z];
  const gs = flip ? grooves.map((g) => v0 + v1 - g) : grooves;
  const pts: [number, number][] = [m(v0, -SILL_H), m(v1 - 3, -SILL_H), m(v1, -SILL_H + 3), m(v1, -3), m(v1 - 3, 0)];
  // the walking face from the nosing back to the inner edge: ribs, broken by the grooves
  const cuts = gs.map((g) => [g - GROOVE / 2, g + GROOVE / 2] as const).sort((a, b) => b[0] - a[0]);
  let v = v1 - 6;
  for (const [g0, g1] of [...cuts, [v0 - 1, v0] as const]) {
    for (; v - RIB > g1 + 2; v -= RIB) pts.push(m(v - RIB / 4, 0), m(v - RIB / 2, -RIB_D), m(v - (3 * RIB) / 4, 0));
    if (g1 < v0 + 1) break;
    pts.push(m(g1 + 1, 0), m(g1, -1), m(g1, -GROOVE_D), m(g0, -GROOVE_D), m(g0, -1), m(g0 - 1, 0));
    v = g0 - 3;
  }
  pts.push(m(v0, 0));
  return pts;
}
