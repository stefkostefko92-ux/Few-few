// What the machine room's plan (room-view.ts) and section B-B (room-section-view.ts) share: the walls' thickness drawn,
// the points on the rope drop line, the slab's openings; a room's door open in plan (the machine's room below too:
// lib/tavole/below-view.ts). Pure.
import { path, type Entity, type Pt } from '../drawing';
import { slabHoles, type MachineSpec, type RoomGeo } from './machine-room';
import type { RoomSite } from './room-site';

export const WALL = 250;

/** Point on the rope drop line: u along it from the car drop, v across it. */
export const onDrop = (G: RoomGeo, u: number, v: number): Pt => [G.carDrop[0] + u * G.ux - v * G.uy, G.carDrop[1] + u * G.uy + v * G.ux];
export const quad = (G: RoomGeo, u0: number, v0: number, u1: number, v1: number): Pt[] => [onDrop(G, u0, v0), onDrop(G, u1, v0), onDrop(G, u1, v1), onDrop(G, u0, v1)];

/** The slab's openings with the car at either end of its travel. */
export const holesOf = (S: RoomSite, M: MachineSpec, G: RoomGeo): ReturnType<typeof slabHoles> => slabHoles(M, G, G.room.slab, S.ends);

/** How a room's drawing is laid out for the sheet it goes on (views.ts tries them in turn to keep 1:25): the door drawn
 *  shut in its frame (its swing would cost the plan its scale); section B-B with the door's and the panel's heights in
 *  one row, and its dimensions placed for 1:`scale` (their offsets kept on paper). */
export interface RoomDrawOpts {
  closedDoor?: boolean;
  compact?: boolean;
  scale?: number;
}

/** A room's door, opening outward (UNI EN 81-20 5.2.3.3 a), drawn open 90° in plan: the steel leaf from its hinge at the
 *  `at` end of the opening on the wall's outer face, its swing back to the far jamb (thin), the frame's jambs in the
 *  opening; `shut`: the leaf in the frame, no swing. `to(a, o)`: the plan point `a` along the door's wall and `o` out
 *  from the room's inner face; `t` the wall's thickness, `w` the opening. Its reach out from the inner face [mm] for the
 *  drawing's bounds. */
export function doorSwing(to: (a: number, o: number) => Pt, at: number, w: number, t: number, shut = false): { entities: Entity[]; reach: number } {
  const jamb = 50, leaf = 40, r = w - 2 * jamb, hinge = at + jamb;
  const box = (a0: number, o0: number, a1: number, o1: number, st: 'thin' | 'outline', fill?: 'paper'): Entity => path([to(a0, o0), to(a1, o0), to(a1, o1), to(a0, o1)], true, st, fill);
  const jambs = [box(at, t - 60, at + jamb, t, 'thin'), box(at + w - jamb, t - 60, at + w, t, 'thin')];
  if (shut) return { entities: [...jambs, box(hinge, t - 10 - leaf, hinge + r, t - 10, 'outline', 'paper')], reach: t };
  const arc: Pt[] = [];
  for (let i = 0; i <= 18; i++) {
    const q = (i / 18) * (Math.PI / 2);
    arc.push(to(hinge + r * Math.cos(q), t + r * Math.sin(q)));
  }
  return { entities: [...jambs, path(arc, false, 'thin'), box(hinge, t, hinge + leaf, t + r, 'outline', 'paper')], reach: t + r };
}
