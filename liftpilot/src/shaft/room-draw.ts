// What the machine room's plan (room-view.ts) and section B-B (room-section-view.ts) share: the walls' thickness drawn,
// the points on the rope drop line, the slab's openings; a room's door open in plan (the machine's room below too:
// lib/tavole/below-view.ts). Pure.
import { path, type Entity, type Pt } from '../drawing';
import { slabHoles, type MachineSpec, type RoomGeo } from './machine-room';
import { KV_VERT } from './norme-vert';
import { ropeWidths } from './ropes';
import type { Box } from './room-floor';
import type { RoomSite } from './room-site';

export const WALL = 250;

/** Point on the rope drop line: u along it from the car drop, v across it. */
export const onDrop = (G: RoomGeo, u: number, v: number): Pt => [G.carDrop[0] + u * G.ux - v * G.uy, G.carDrop[1] + u * G.uy + v * G.ux];
export const quad = (G: RoomGeo, u0: number, v0: number, u1: number, v1: number): Pt[] => [onDrop(G, u0, v0), onDrop(G, u1, v0), onDrop(G, u1, v1), onDrop(G, u0, v1)];

/** The slab's openings with the car at either end of its travel. */
export const holesOf = (S: Pick<RoomSite, 'ends'>, M: MachineSpec, G: RoomGeo): ReturnType<typeof slabHoles> => slabHoles(M, G, G.room.slab, S.ends);

/** Where section B-B's cut — the drop line through the car's drop — crosses the slab's existing openings a survey found
 *  (RoomSite.openings, room axes): their stretches [u0, u1] along it within the room (an opening surveyed past a wall
 *  opens no slab in the wall's thickness: round 37 review), in order, with the opening's outline as surveyed (round 37:
 *  the slab was drawn solid across them). */
export function foundSpans(S: Pick<RoomSite, 'openings'>, G: RoomGeo): { u0: number; u1: number; box: Box }[] {
  const [cx, cy] = G.carDrop, R = G.room, span = (c: number, d: number, lo: number, hi: number): [number, number] | null => {
    if (lo >= hi) return null;
    if (Math.abs(d) < 1e-9) return c > lo && c < hi ? [-Infinity, Infinity] : null;
    const a = (lo - c) / d, b = (hi - c) / d;
    return [Math.min(a, b), Math.max(a, b)];
  };
  return (S.openings ?? []).flatMap((box) => {
    const [x0, y0, x1, y1] = [Math.max(box[0], 0), Math.max(box[1], 0), Math.min(box[2], R.W), Math.min(box[3], R.D)], sx = span(cx, G.ux, x0, x1), sy = span(cy, G.uy, y0, y1);
    if (!sx || !sy) return [];
    const u0 = Math.max(sx[0], sy[0]), u1 = Math.min(sx[1], sy[1]);
    return u1 - u0 > 1 ? [{ u0, u1, box }] : [];
  }).sort((p, q) => p.u0 - q.u0);
}

/** A slab opening in plan: its corners (room axes), its middle, its sides along and across the drop line, whether a
 *  pulley dips into it. */
export interface SlabOpening {
  /** along the drop line from the car's drop */
  u0: number;
  u1: number;
  pts: Pt[];
  centre: Pt;
  along: number;
  across: number;
  wheel: boolean;
}

/** The slab's openings round the ropes (and a pulley dipping into the slab) of the machine `M` (machine-room.ts
 *  slabHoles), KV_VERT.holeGap clear, with the hitches as deep as `S.ends` (RoomSite.ends). */
export function openingsOf(S: Pick<RoomSite, 'ends'>, M: MachineSpec, G: RoomGeo): SlabOpening[] {
  const w = ropeWidths(M.n, M.d);
  return holesOf(S, M, G).map((h) => {
    const a = (h.wheel ? Math.max(w.ropes, w.pulley) : w.ropes) + KV_VERT.holeGap;
    return { u0: h.u0, u1: h.u1, pts: [onDrop(G, h.u0, -a), onDrop(G, h.u1, -a), onDrop(G, h.u1, a), onDrop(G, h.u0, a)], centre: onDrop(G, (h.u0 + h.u1) / 2, 0), along: h.u1 - h.u0, across: 2 * a, wheel: h.wheel };
  });
}

/** The outer outline of the upstand round an opening, KV_VERT.kerbW thick (room axes; registry locale.fori). */
export const kerbOf = (G: RoomGeo, o: SlabOpening): Pt[] => {
  const k = KV_VERT.kerbW, a = o.across / 2 + k;
  return [onDrop(G, o.u0 - k, -a), onDrop(G, o.u1 + k, -a), onDrop(G, o.u1 + k, a), onDrop(G, o.u0 - k, a)];
};

/** How a room's drawing is laid out for the sheet it goes on (views.ts tries them in turn to keep 1:25): the door drawn
 *  shut in its frame (its swing would cost the plan its scale); section B-B with the door's and the panel's heights in
 *  one row, and its dimensions placed for 1:`scale` (their offsets kept on paper). */
export interface RoomDrawOpts {
  closedDoor?: boolean;
  compact?: boolean;
  /** the scale the view is drawn at when not 1:25: section B-B's dimensions placed for it, the plan's names and
   *  references measured at it (round 37) */
  scale?: number;
  /** the plan's rope drops dimensioned inside the shaft, not in a row outside (the plan keeps its scale; round 36) */
  dropsInside?: boolean;
  /** the paper the view has [mm]: a name, a reference or a note set outside the drawing takes no more of it than the
   *  scale leaves (round 37 review) */
  paper?: { w: number; h: number };
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
