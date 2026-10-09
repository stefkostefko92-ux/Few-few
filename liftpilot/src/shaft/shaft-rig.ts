// What the lift's rope rig puts in the shaft, for the shaft's sheets and for the spaces on the car roof: the pulleys over
// the shaft of a machine below (hung under the slab, or standing in the pulley room over it) with the level runs between
// two of them and the runs down to the machine, the car's and the counterweight's pulleys of a 2:1 roping with their
// dead ends, the governor of a machine below on its bracket under the ceiling, the openings the ropes take through the
// slab. src/lib/lift/shaft-rig.ts makes it from the calculation and the machine (as the 3D's rig.ts places them); a
// shaft design alone has none (Layout.rig absent). Plan in the shaft's axes, heights from the lowest floor [mm]. Pure.
import type { Box } from '../drawing';
import { KV_VERT } from './norme-vert';

export type RigP2 = readonly [number, number];

/** A pulley turning in its vertical plane: its centre in plan, the unit direction of its plane, its axle's height, its
 *  radius, half its width over the cheeks that hold its axle. */
export interface RigPulley {
  c: RigP2;
  dir: RigP2;
  z: number;
  r: number;
  half: number;
}

export interface ShaftRig {
  /** the scheme of a machine below (lib/lift/bottom.ts), null with the machine above */
  scheme: 'head' | 'room' | 'under' | null;
  /** the pulleys over the shaft of a machine below (axles at their height): hung under the slab from their frames
   *  (`hung`), or standing on the pulley room's floor */
  head: readonly RigPulley[];
  hung: boolean;
  /** the level runs between two pulleys at 90°, at the height of the ropes' axis */
  runs: readonly { a: RigP2; b: RigP2; z: number }[];
  /** the runs down to the machine below: each pack's centre in plan, the ropes side by side along `across`, down to the
   *  sheave's axis (`downTo`) */
  down: readonly RigP2[];
  across: RigP2;
  downTo: number;
  /** half the width of the rope pack, the ropes' diameter [mm] */
  ropes: number;
  d: number;
  /** 2:1: the car's pulley over its crosshead and the counterweight's on its frame (`z`: the axle over the car floor,
   *  over the counterweight's underside); null with 1:1 */
  car: RigPulley | null;
  cw: RigPulley | null;
  /** 2:1: the dead ends, anchored under the slab — the car's side (P2) and the counterweight's (P3) — down to `z`, the
   *  bottom of their sockets */
  dead: readonly { at: RigP2; dir: RigP2; tag: 'P2' | 'P3'; z: number }[];
  /** the governor of a machine below on its bracket from the side wall under the ceiling: its axle's height; null when
   *  it stands in a room */
  governor: { z: number } | null;
  /** a machine below: where the ropes go through the slab over the shaft into a pulley room, across the depth of the
   *  shaft (section A-A's x) — none under hung pulleys; null with the machine above (the section's own opening) */
  holes: readonly (readonly [number, number])[] | null;
  /** the slab's underside and the car roof with the car at its highest position (section.ts), for the spaces on the
   *  roof under what hangs (roof.ts) */
  ceiling: number;
  roof: number;
}

/** Something fixed hanging over the shaft in plan (its box) and its lowest point [mm]. */
export interface Hanging {
  box: Box;
  z: number;
}

/** The box round a pulley in plan: Dp along its plane, its cheeks across it. */
export function pulleyBox(p: RigPulley): Box {
  const [dx, dy] = p.dir, ex = Math.abs(dx) * p.r + Math.abs(dy) * p.half, ey = Math.abs(dy) * p.r + Math.abs(dx) * p.half;
  return { x0: p.c[0] - ex, y0: p.c[1] - ey, x1: p.c[0] + ex, y1: p.c[1] + ey };
}

/** What hangs fixed under the slab of a rigged shaft, with its lowest point: the pulleys hung there (their rims), the
 *  level runs between them (the ropes' underside), the dead ends' sockets. Their boxes are the ones in plan. */
export function hangingOf(rig: ShaftRig | undefined): Hanging[] {
  if (!rig) return [];
  const out: Hanging[] = [];
  if (rig.hung) {
    for (const p of rig.head) out.push({ box: pulleyBox(p), z: p.z - p.r });
    for (const r of rig.runs) {
      out.push({ box: { x0: Math.min(r.a[0], r.b[0]) - rig.ropes, y0: Math.min(r.a[1], r.b[1]) - rig.ropes, x1: Math.max(r.a[0], r.b[0]) + rig.ropes, y1: Math.max(r.a[1], r.b[1]) + rig.ropes }, z: r.z - rig.d / 2 });
    }
  }
  // the sockets side by side across the dead end's plane, each about two ropes long along it
  for (const e of rig.dead) {
    const ex = Math.abs(e.dir[0]) * rig.d + Math.abs(e.dir[1]) * rig.ropes, ey = Math.abs(e.dir[1]) * rig.d + Math.abs(e.dir[0]) * rig.ropes;
    out.push({ box: { x0: e.at[0] - ex, y0: e.at[1] - ey, x1: e.at[0] + ex, y1: e.at[1] + ey }, z: e.z });
  }
  return out;
}

/** A rope pack at `m` in plan: half `along` across the ropes, half `wide` along `rig.across` (the ropes side by side);
 *  its corners in order round it. */
export function pack(rig: ShaftRig, m: RigP2, along: number, wide: number): RigP2[] {
  const [ax, ay] = rig.across, [bx, by] = [-ay, ax];
  return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([i, j]): RigP2 => [m[0] + i * along * bx + j * wide * ax, m[1] + i * along * by + j * wide * ay]);
}

/** The openings of the pit's slab where the ropes of a machine under the pit go through it: round each run's pack,
 *  KV_VERT.holeGap clear of it every way (registry locale.fori, as the slab over the shaft), the ropes side by side along
 *  `rig.across` — the plan of the pit and section A-A (rig-view.ts) and the 3D (lift3d/slab.ts) cut the same; none for
 *  the other schemes. */
export function pitSlabHoles(rig: ShaftRig): RigP2[][] {
  const g = KV_VERT.holeGap;
  return rig.scheme === 'under' ? rig.down.map((m) => pack(rig, m, rig.d / 2 + g, rig.ropes + g)) : [];
}
