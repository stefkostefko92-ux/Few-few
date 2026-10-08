// What the pit needs besides the buffers (UNI EN 81-20:2020, 5.2.1.5.1, 5.2.2.4 and annex F; registries fossa.accesso,
// fossa.comandi, fossa.posizioni): the access ladder in the well (a pit up to 2500 mm deep) and the pit's control box —
// the stop, the socket and the well light's switch — by the door of the lowest floor, each against a wall as near that
// door's clear opening as it may stand clear of the car with its sills and operators, the counterweight and its screen,
// the rails with their brackets, the landing door, the buffers, the refuge space and the governor's tension weight; the
// ladder within 600 mm of the opening's edge (annex F, F.5 c)), the box's stop within 750 mm (5.2.1.5.1 a)). The plan of
// the pit draws them with their places, the pit's detail of section A-A with their heights; where none fits, the
// drawings leave it out and sheet 1's note says where it must go. Pure.
import { chain, line, path, type Box, type Entity, type Pt } from '../drawing';
import { governorSpot, TENSION } from './governor';
import { landingOf } from './landing';
import { KV_VERT } from './norme-vert';
import { doorOpDepthOf } from './operator';
import { bufferFoot, bufferPlan, pitSpace } from './pit';
import { onWall, quad } from './plan-walls';
import { RAILS } from './rails';
import { cwScreen } from './screen';
import { section } from './section';
import type { DoorLayout, Layout, Wall } from './types';

const WALLS: readonly Wall[] = ['front', 'left', 'right', 'rear'];
/** the search step along a wall and the least gap kept from anything in the way [mm] */
const STEP = 10, GAP = 15;
/** the least height of a door operator's underside over the kit's top, the car on its compressed buffers, for the kit to
 *  stand under it (registry fossa.posizioni) [mm] */
const OP_CLEAR = 100;

export interface PitItem {
  wall: Wall;
  /** its middle along the wall (the wall's own u), its width along it and its depth from it [mm] */
  u: number;
  w: number;
  d: number;
  box: Box;
  /** from the nearer edge of the access door's clear opening to its middle on the wall's face [mm] */
  reach: number;
}

export interface PitKit {
  /** the door of the lowest floor the pit is entered from, and its clear opening's edges on the wall's face */
  door: DoorLayout;
  edges: readonly [Pt, Pt];
  /** a ladder in the well (pit up to 2500 mm) and where it stands, null when the pit needs a door or none fits */
  ladderAllowed: boolean;
  ladder: PitItem | null;
  box: PitItem | null;
  /** over the lowest landing: the (upper) stop and the light's switch [mm]; a pit over 1600 mm has a second, lower stop */
  stop: number;
  light: number;
  twoStops: boolean;
}

const bboxOf = (pts: readonly Pt[]): Box => ({
  x0: Math.min(...pts.map((p) => p[0])), y0: Math.min(...pts.map((p) => p[1])), x1: Math.max(...pts.map((p) => p[0])), y1: Math.max(...pts.map((p) => p[1])),
});
const overlaps = (a: Box, b: Box): boolean => a.x0 < b.x1 + GAP && b.x0 < a.x1 + GAP && a.y0 < b.y1 + GAP && b.y0 < a.y1 + GAP;

/** What the ladder and the box keep clear of in plan: the car with its sills and — where the car on its compressed
 *  buffers brings them down to the kit's top — its door operators, the counterweight with its screen, each rail with its
 *  bracket out to its wall, the buffers' footprints, the refuge space, the governor's tension weight and rope; for the
 *  box (over the landing) the landing doors' whole width, for the ladder (in the pit) their sills. */
function obstacles(L: Layout, over: boolean): Box[] {
  const I = L.inputs, c = L.car, v0 = I.landingDepth + I.sillGap, out: Box[] = [{ x0: c.x, y0: c.y, x1: c.x + c.w, y1: c.y + c.h }];
  // the operators hang over the car's doors: their underside at the car's lowest against the ladder's or the box's top
  const K = KV_VERT, top = Math.max(K.ladderOverSill, K.lightAt + K.pitBoxH / 2), opLow = I.doorHeight - section(L).moveDown;
  for (const d of L.doors) {
    out.push(bboxOf(quad(L, d.wall, d.u0 - 40, v0, d.u1 + 40, v0 + I.carDoorDepth + I.carWall)));
    if (opLow <= top + OP_CLEAR) out.push(bboxOf(quad(L, d.wall, d.op0, v0, d.op1, v0 + doorOpDepthOf(I))));
    const l = landingOf(d);
    out.push(bboxOf(over ? quad(L, d.wall, d.frame0, 0, d.frame1, I.landingDepth) : quad(L, d.wall, l.u0 - 60, 0, l.u1 + 60, I.landingDepth + 10)));
  }
  const s = cwScreen(L);
  out.push({ x0: L.cw.x, y0: L.cw.y, x1: L.cw.x + L.cw.w, y1: L.cw.y + L.cw.h }, bboxOf(quad(L, s.wall, s.u0, s.v0, s.u1, s.v1)));
  for (const r of L.rails) {
    const t = RAILS[r.kind === 'car' ? I.carRail : I.cwRail], half = t.b / 2 + 60;
    const [dx, dy] = r.dir === 'right' ? [1, 0] : r.dir === 'left' ? [-1, 0] : r.dir === 'back' ? [0, 1] : [0, -1];
    const foot: Pt = [r.x - dx * t.h, r.y - dy * t.h], wall: Pt = r.bracketAxis === 'x' ? [r.bracketTo, foot[1]] : [foot[0], r.bracketTo];
    out.push(bboxOf([[r.x - dy * half, r.y - dx * half], [r.x + dy * half, r.y + dx * half], [foot[0] - dy * half, foot[1] - dx * half], [foot[0] + dy * half, foot[1] + dx * half]]));
    out.push(bboxOf([[foot[0] - 100, foot[1] - 100], [foot[0] + 100, foot[1] + 100], [wall[0] - 100, wall[1] - 100], [wall[0] + 100, wall[1] + 100]]));
  }
  if (!over) {
    const base = I.vertical.carBufferBase;
    for (const b of bufferPlan(L).spots) {
      const f = b.kind === 'car' ? bufferFoot(base) : Math.max(b.r, bufferFoot(I.vertical.cwBufferBase));
      out.push({ x0: b.c[0] - f, y0: b.c[1] - f, x1: b.c[0] + f, y1: b.c[1] + f });
    }
    out.push(pitSpace(L));
  }
  const g = governorSpot(L);
  if (g) {
    const reach = Math.max(g.G.R, TENSION.weightAt + TENSION.lever[1]) + 60;
    out.push({ x0: g.x - g.G.half - 80, y0: Math.min(g.y1, g.rail.y) - reach, x1: g.x + g.G.half + 80, y1: Math.max(g.y2, g.rail.y) + reach });
  }
  return out;
}

/** The free place nearest the opening's edges for an item w wide and d deep against a wall, within `limit` of them. */
function place(L: Layout, edges: readonly Pt[], w: number, d: number, limit: number, keep: readonly Box[]): PitItem | null {
  const { W, D } = L.inputs;
  let best: PitItem | null = null;
  for (const wall of WALLS) {
    const len = wall === 'front' || wall === 'rear' ? W : D;
    for (let u = w / 2; u <= len - w / 2 + 1e-9; u += STEP) {
      const at = onWall(L, wall, u, 0), reach = Math.min(...edges.map((e) => Math.hypot(at[0] - e[0], at[1] - e[1])));
      if (reach > limit || (best && reach >= best.reach - 1e-9)) continue;
      const box = bboxOf(quad(L, wall, u - w / 2, 0, u + w / 2, d));
      if (!keep.some((k) => overlaps(box, k))) best = { wall, u, w, d, box, reach };
    }
  }
  return best;
}

/** The access door of the pit: the lowest floor's entrance A, else its B. */
function accessDoor(L: Layout): DoorLayout {
  const f = L.inputs.vertical.floors[0], open = L.doors.filter((d) => f?.door.includes(d.side));
  return open.find((d) => d.side === 'A') ?? open[0] ?? L.doors[0];
}

const kits = new WeakMap<Layout, PitKit>();

export function pitKit(L: Layout): PitKit {
  const known = kits.get(L);
  if (known) return known;
  const K = KV_VERT, pit = L.inputs.vertical.pit, door = accessDoor(L), l = landingOf(door);
  const edges: readonly [Pt, Pt] = [onWall(L, door.wall, l.u0, 0), onWall(L, door.wall, l.u1, 0)];
  const ladderAllowed = pit <= K.pitLadderMax, twoStops = pit > K.stopPitOne;
  const ladder = ladderAllowed ? place(L, edges, K.ladderW, K.ladderD, K.ladderUse, obstacles(L, false)) : null;
  const box = place(L, edges, K.pitBoxW, K.pitBoxD, K.pitReach, [...obstacles(L, true), ...(ladder ? [ladder.box] : [])]);
  // the stop between 400 mm over the landing and 2000 mm over the pit floor (one stop), or 1000 mm over the landing (two)
  const stop = twoStops ? K.stopUpper : Math.max(K.stopOverLanding, Math.min(K.stopAt, K.stopOverPit - pit));
  const kit: PitKit = { door, edges, ladderAllowed, ladder, box, stop, light: Math.max(K.lightAt, K.lightOver), twoStops };
  kits.set(L, kit);
  return kit;
}

/** The kit in the plan of the pit: the ladder with its rungs seen from above, the box, their names, and where each stands
 *  along its wall from the corner nearer the door (references: the software's places within the standard's reach). */
export function pitKitPlan(L: Layout): Entity[] {
  const k = pitKit(L), out: Entity[] = [];
  const item = (it: PitItem, name: string, dimText: string): void => {
    const P = (u: number, v: number): Pt => onWall(L, it.wall, u, v), along = it.wall === 'front' || it.wall === 'rear';
    out.push(path(quad(L, it.wall, it.u - it.w / 2, 0, it.u + it.w / 2, it.d), true, 'outline', 'paper'));
    if (name === 'SCALA') for (const s of [-1, 1]) out.push(line(P(it.u + s * (it.w / 2 - 35), 0), P(it.u + s * (it.w / 2 - 35), it.d), 'thin'));
    else out.push(path(quad(L, it.wall, it.u - it.w / 2 + 25, it.d - 25, it.u + it.w / 2 - 25, it.d), true, 'thin', 'dark'));
    out.push({ e: 'text', at: P(it.u, it.d + 70), text: name, size: 1.6, align: 'c', angle: along ? 0 : 90, halo: true });
    // from the end of the wall nearer the door's opening to the item's middle
    const ends = along ? [0, L.inputs.W] : [0, L.inputs.D], e0 = Math.abs(it.u - ends[0]) <= Math.abs(it.u - ends[1]) ? ends[0] : ends[1];
    const across = (v: number): number => (along ? P(0, v)[1] : P(0, v)[0]), corner = across(0), face = across(it.d);
    out.push(chain({ dir: along ? 'x' : 'y', pts: e0 < it.u ? [e0, it.u] : [it.u, e0], at: across(it.d + 160), from: e0 < it.u ? [corner, face] : [face, corner], text: [dimText] }));
  };
  if (k.ladder) item(k.ladder, 'SCALA', 'Scala {v}');
  if (k.box) item(k.box, 'STOP · PRESA · LUCE', 'Pulsantiera {v}');
  return out;
}

/** The kit in the pit's detail of section A-A (a cut along the depth, the plan's y across the sheet): the ladder from the
 *  pit floor to the sill with its rungs, the box's stop and light switch at their heights; the ones on the far wall half
 *  dashed (behind the cut). */
export function pitKitSection(L: Layout, P: (x: number, z: number) => Pt, pitFloor: number): Entity[] {
  const k = pitKit(L), out: Entity[] = [], cut = L.car.x + L.car.w / 2;
  const behind = (b: Box): boolean => (b.x0 + b.x1) / 2 > cut;
  if (k.ladder) {
    const b = k.ladder.box, st = behind(b) ? 'hidden' : 'thin';
    out.push(path([P(b.y0, pitFloor), P(b.y1, pitFloor), P(b.y1, 0), P(b.y0, 0)], true, st));
    for (let z = pitFloor + 280; z < -100; z += 280) out.push(line(P(b.y0, z), P(b.y1, z), st));
    out.push({ e: 'text', at: P((b.y0 + b.y1) / 2, pitFloor + 140), text: 'SCALA', size: 1.6, align: 'c', halo: true });
  }
  if (k.box) {
    const b = k.box.box, st = behind(b) ? 'hidden' : 'outline', h = KV_VERT.pitBoxH;
    for (const [z, name] of [[k.stop, 'STOP'], [k.light, 'LUCE']] as const) {
      out.push(path([P(b.y0, z - h / 2), P(b.y1, z - h / 2), P(b.y1, z + h / 2), P(b.y0, z + h / 2)], true, st, 'paper'));
      // its height over the lowest landing (a reference: the software's within the standard's band)
      out.push({ e: 'text', at: P(b.y1 + 40, z - 20), text: `${name} +${Math.round(z)}`, size: 1.6, align: 'l', halo: true });
    }
  }
  return out;
}
