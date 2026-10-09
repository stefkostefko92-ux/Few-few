// What a replacement's survey finds in the machine room besides the room, the shaft and the drops (survey.ts, round 36;
// registry locale.fori, limitatore.posto): the existing governor on the floor — the checks take its footprint as they take
// a whole design's (m_free, m_route, m_quadro, m_gov, m_govfree), the plan draws it with its load P4, its ropes through the
// slab go down into the shaft (m_govdrop, round 37) —, the slab's existing openings, drawn dashed with their size, and
// whether the new support bears on one of them (m_holes). Room axes [mm]; pure.
import { letterSize, line, path, rect, type Box as DrawBox, type Entity, type Pt } from '@/drawing';
import { check } from '@/shaft/checks';
import type { HebLayout } from '@/shaft/heb';
import type { MachineSpec, RoomGeo } from '@/shaft/machine-room';
import { KV_VERT } from '@/shaft/norme-vert';
import type { Box } from '@/shaft/room-floor';
import { AT, gridNear, leaderFrom, letteringBox, tagBox } from '@/shaft/room-label';
import { reactionPoints } from '@/shaft/room-reactions';
import type { ShaftCheck } from '@/shaft/types';
import type { Survey } from './survey';

/** The surveyed governor's footprint; null: none surveyed. */
export function surveyGovernor(s: Pick<Survey, 'governor'>): Box | null {
  const g = s.governor;
  return g ? [g.x - g.W / 2, g.y - g.D / 2, g.x + g.W / 2, g.y + g.D / 2] : null;
}

/** The opening the existing governor's ropes go down through under its footprint, across its depth (the software's:
 *  its sheave's strands); null: none surveyed, or its ropes do not go through the slab. */
export function governorRopeBox(g: Survey['governor']): Box | null {
  return g?.ropes ? [g.x - 60, g.y - g.D / 2 + 20, g.x + 60, g.y + g.D / 2 - 20] : null;
}

/** The slab's existing openings as surveyed (their outlines, room axes). */
export const existingOpenings = (s: Pick<Survey, 'openings'>): Box[] => (s.openings ?? []).map((o): Box => [o.x - o.W / 2, o.y - o.D / 2, o.x + o.W / 2, o.y + o.D / 2]);

/** The slab's existing openings surveyed (with the governor's ropes' under its footprint when they go through the slab). */
export function surveyOpenings(s: Pick<Survey, 'openings' | 'governor'>): Box[] {
  const ropes = governorRopeBox(s.governor);
  return [...existingOpenings(s), ...(ropes ? [ropes] : [])];
}

/** m_govdrop (registry limitatore.posto): the existing governor stands over its rope, so the opening its ropes go down
 *  through lies over the shaft's inside (the shaft at R.shaftX, R.shaftY in the room): the least margin to the shaft's
 *  inner faces, at least 0 [mm]. Across a wall a warning (the opening is the software's: the strands may still drop
 *  inside), wholly outside the shaft a failure (a measure from the wrong wall); no ropes through the slab: no check. */
export function governorDropCheck(s: Pick<Survey, 'governor' | 'shaft' | 'room'>): ShaftCheck[] {
  const r = governorRopeBox(s.governor);
  if (!r) return [];
  const R = s.room, [x0, y0, x1, y1] = [R.shaftX, R.shaftY, R.shaftX + s.shaft.W, R.shaftY + s.shaft.D];
  const margin = Math.min(r[0] - x0, x1 - r[2], r[1] - y0, y1 - r[3]), across = r[0] < x1 && x0 < r[2] && r[1] < y1 && y0 < r[3];
  return [check('m_govdrop', margin >= 0, Math.round(margin), 0, 0, 'mm', across)];
}

/** The governor's name on the plan; the sides of its footprint (room axes: the rear wall at y = D). */
const GOV_NAME = 'Limitatore esistente';
type Side = 'rear' | 'front' | 'right' | 'left';
type Spot = { at: Pt; align: 'l' | 'c' | 'r' };

const boxOf = ([x0, y0, x1, y1]: Box): DrawBox => ({ x0, y0, x1, y1 });
const meets = (a: DrawBox, b: DrawBox): boolean => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
const grown = (b: DrawBox, d: number): DrawBox => ({ x0: b.x0 - d, y0: b.y0 - d, x1: b.x1 + d, y1: b.y1 + d });

/** The plan's entities of what the survey found: the governor's footprint with its name and P4, each existing opening
 *  dashed with «FORO ESISTENTE L×P»; the box of the governor with its lettering, and the tight boxes of its body, its name,
 *  its reference and the openings' lettering (as room-site.ts gives a whole design's). The name and P4 keep off the room's
 *  walls, the openings' lettering and `keep` (room axes: what stands on the floor round the governor), first on the side
 *  away from its free area `free` (room-ways.ts hatches it: round 37, the name lay on the area's size), then above, below,
 *  right or left of it — none clear, the nearest clear place over the room on a leader —, off `lettered` too and where
 *  it can off `dims` (the plan's lettering and dimension lines that go where they go whatever else is drawn: the
 *  panel's name and chains, the bedplate's chain); lettering measured as the plan draws it at its scale `k` (model
 *  millimetres to one of paper: room-view.ts, through RoomSite.governorAt), its gaps as wide on paper as at 1:25 (round
 *  37 review: measured at 1:25 on a plan drawn at 1:50, the name went over P4 and pushed the frame's row onto the
 *  openings' lettering). */
export function surveyFound(s: Pick<Survey, 'openings' | 'governor' | 'room'>, keep: readonly Box[] = [], free: Box | null = null, k = AT, lettered: readonly DrawBox[] = [], dims: readonly DrawBox[] = []): { entities: Entity[]; box: DrawBox | null; marks: DrawBox[] } {
  const out: Entity[] = [], marks: DrawBox[] = [], gov = surveyGovernor(s), R = s.room, f = k / AT;
  for (const [x0, y0, x1, y1] of existingOpenings(s)) {
    const text = `FORO ESISTENTE ${Math.round(x1 - x0)}×${Math.round(y1 - y0)}`, at: Pt = [(x0 + x1) / 2, y0 - 70 * f];
    out.push(path([[x0, y0], [x1, y0], [x1, y1], [x0, y1]], true, 'hidden'), path([[x0, y0], [x1, y1]], false, 'hidden'));
    out.push({ e: 'text', at, text, size: 1.4, align: 'c', halo: true });
    const l = letteringBox(at, text, 1.4, 'c', 0, false, k);
    marks.push({ x0: Math.min(x0, l.x0), y0: l.y0, x1: Math.max(x1, l.x1), y1 });
  }
  if (!gov) return { entities: out, box: null, marks };
  const [x0, y0, x1, y1] = gov, cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, h = letterSize(1.6) * k, gap = 60 * f, body = boxOf(gov);
  // the side away from its free area (none: over it, where the name always went)
  const away: Side = !free ? 'rear' : free[2] <= x0 ? 'right' : free[0] >= x1 ? 'left' : free[3] <= y0 ? 'rear' : 'front';
  // above or below it centred, from either end, past either corner (by a wall the centred name leaves the room at
  // 1:50); beside it level with its middle, its top or its bottom
  const level = (y: number): Spot[] => [{ at: [cx, y], align: 'c' }, { at: [x0, y], align: 'l' }, { at: [x1, y], align: 'r' }, { at: [x1 + gap, y], align: 'l' }, { at: [x0 - gap, y], align: 'r' }];
  const upright = (x: number, align: 'l' | 'r'): Spot[] => [cy - 0.35 * h, y1 - 0.7 * h, y0].map((y): Spot => ({ at: [x, y], align }));
  const spots: Readonly<Record<Side, Spot[]>> = { rear: level(y1 + gap), front: level(y0 - gap - h), right: upright(x1 + gap, 'l'), left: upright(x0 - gap, 'r') };
  const order: Side[] = [away, ...(['rear', 'front', 'right', 'left'] as const).filter((sd) => sd !== away)];
  const busy = [body, ...marks, ...keep.map(boxOf), ...(free ? [boxOf(free)] : []), ...lettered], inRoom = (b: DrawBox): boolean => b.x0 >= 0 && b.y0 >= 0 && b.x1 <= R.W && b.y1 <= R.D;
  // how much of a box (20 mm round it at 1:25) lies on what is there; out of the room, all of it
  const on = (b: DrawBox, taken: readonly DrawBox[]): number => (inRoom(b) ? taken.reduce((t, q) => {
    const g = grown(b, 20 * f);
    return t + (meets(g, q) ? (Math.min(g.x1, q.x1) - Math.max(g.x0, q.x0)) * (Math.min(g.y1, q.y1) - Math.max(g.y0, q.y0)) : 0);
  }, 0) : Infinity);
  // the first of the usual places clear of it all and of the dimension lines `dims` (each side's first ones first: as
  // before round 37's review), else clear of it all (a row's figures find room along it), else the nearest clear over
  // the room on a leader, else the usual one least on it
  const clear = <T extends { box: DrawBox }>(ps: readonly T[], taken: readonly DrawBox[]): T | undefined => ps.find((p) => on(p.box, taken) === 0);
  const least = <T extends { box: DrawBox }>(ps: readonly T[], taken: readonly DrawBox[]): T => ps.reduce((p, q) => (on(q.box, taken) < on(p.box, taken) ? q : p));
  const lettering = (p: Spot): Spot & { box: DrawBox } => ({ ...p, box: letteringBox(p.at, GOV_NAME, 1.6, p.align, 0, false, k) });
  const usual = [...order.map((sd) => spots[sd][0]), ...order.flatMap((sd) => spots[sd].slice(1))].map(lettering), room: DrawBox = { x0: 0, y0: 0, x1: R.W, y1: R.D }, mid = letteringBox([0, 0], GOV_NAME, 1.6, 'c', 0, false, k);
  const far = (): (Spot & { box: DrawBox })[] => gridNear(room, [cx, cy]).map(([x, y]) => {
    const at: Pt = [x, y - 0.35 * h];
    return { at, align: 'c', box: { x0: at[0] + mid.x0, y0: at[1] + mid.y0, x1: at[0] + mid.x1, y1: at[1] + mid.y1 } };
  });
  const all = [...busy, ...dims], near = clear(usual, all) ?? clear(usual, busy), name = near ?? clear(far(), all) ?? least(usual, all);
  // P4 out from a corner along its diagonal, else out from the middle of a side, farther each time, clear of the name
  // too, else the nearest clear over the room; its leader to that corner or side, or to the nearest point of the body
  const ends: Pt[] = [[x1, y1], [x0, y1], [x1, y0], [x0, y0], [x1, cy], [x0, cy], [cx, y1], [cx, y0]], onBody = (p: Pt): Pt => [Math.min(Math.max(p[0], x0), x1), Math.min(Math.max(p[1], y0), y1)];
  const tags = [160, 280, 400].flatMap((d) => ends.map((c) => {
    const at: Pt = [c[0] + Math.sign(c[0] - cx) * d * f, c[1] + Math.sign(c[1] - cy) * d * f];
    return { c, at, box: tagBox(at, 'P4', k) };
  }));
  const tagBusy = [...busy, name.box], tagAll = [...tagBusy, ...dims];
  const tag = clear(tags, tagAll) ?? clear(tags, tagBusy) ?? clear(gridNear(room, [cx, cy]).map((at) => ({ c: onBody(at), at, box: tagBox(at, 'P4', k) })), tagAll) ?? least(tags, tagAll);
  out.push(rect(x0, y0, x1, y1, 'outline', 'paper'), { e: 'text', at: name.at, text: GOV_NAME, size: 1.6, align: name.align, halo: true });
  if (!near) {
    const to = onBody([(name.box.x0 + name.box.x1) / 2, (name.box.y0 + name.box.y1) / 2]);
    out.push(line(leaderFrom(name.box, to), to, 'dim'));
  }
  out.push({ e: 'tag', at: tag.at, text: 'P4', to: tag.c });
  const p4 = tag.box;
  const box = [body, name.box, p4].reduce((a, b) => ({ x0: Math.min(a.x0, b.x0), y0: Math.min(a.y0, b.y0), x1: Math.max(a.x1, b.x1), y1: Math.max(a.y1, b.y1) }));
  return { entities: out, box, marks: [body, name.box, p4, ...marks] };
}

/** How far a point is from the rectangle's edge, negative inside it [mm]. */
function edgeGap(p: Pt, [x0, y0, x1, y1]: Box): number {
  const dx = Math.max(x0 - p[0], 0, p[0] - x1), dy = Math.max(y0 - p[1], 0, p[1] - y1);
  return dx > 0 || dy > 0 ? Math.hypot(dx, dy) : -Math.min(p[0] - x0, x1 - p[0], p[1] - y0, y1 - p[1]);
}

/** m_holes (soft: the opening can be closed): the new support's bearings at least KV_VERT.holeBearing from the edge of
 *  every existing opening of the slab; none surveyed: no check. */
export function holesCheck(G: RoomGeo, M: MachineSpec, openings: readonly Box[], heb: HebLayout | null = null): ShaftCheck[] {
  if (!openings.length) return [];
  const gap = Math.min(...reactionPoints(G, M, heb).flatMap((p) => openings.map((o) => edgeGap(p, o))));
  return [check('m_holes', gap >= KV_VERT.holeBearing, Math.round(gap), KV_VERT.holeBearing, 0, 'mm', true)];
}
