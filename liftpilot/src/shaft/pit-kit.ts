// What the pit needs besides the buffers (UNI EN 81-20:2020, 5.2.1.5.1, 5.2.2.4 and annex F; registries fossa.accesso,
// fossa.comandi, fossa.posizioni): the access ladder in the well (a pit up to 2500 mm deep) and the pit's control box —
// the stop, the socket and the well light's switch — by the door of the lowest floor, each against a wall as near that
// door's clear opening as it may stand clear of the car with its sills and operators, the counterweight and its screen
// with all it closes off, the rails with their brackets, the landing door, the governor's rope and, in the pit, the
// buffers, the refuge space and the governor's tension weight; the ladder within 600 mm of the opening's edge (annex F,
// F.5 c)), the box's stop within 750 mm (5.2.1.5.1 a)), a deep pit's lower stop under the box. The ladder's stiles reach
// KV_VERT.ladderOverSill over the sill in use (F.2.3): it keeps clear of the landing doors' frames with their panels
// stacked, as the box does, and in the pit of the sills with the plate under them; where no such place is within reach,
// it stands under the stacked panels with its stiles ending at the sill, and sheet 1's note asks for a handhold up to
// that height instead (F.2.3: or other handholds). Its rungs from the one flush with the sill (F.5 d)) down at
// KV_VERT.ladderPitch. The pit's lamp in the free place nearest the door under the landing (only the 3D draws it: the
// drawings leave the well's lighting to the electrical design). The plan of the pit draws them with their places, the
// pit's detail of section A-A with their heights, the 3D (lift3d/pit.ts) builds them from here; where none fits, the
// drawings leave it out and sheet 1's note says where it must go. Pure.
import { chain, letterSize, line, path, type Box, type Entity, type Pt } from '../drawing';
import { governorSpot, TENSION } from './governor';
import { landingOf, landingZone } from './landing';
import { firstClear } from './lettering-place';
import { KV_VERT } from './norme-vert';
import { doorOpDepthOf } from './operator';
import { bufferFoot, bufferPlan, pitSpace } from './pit';
import { onWall, quad } from './plan-walls';
import { RAILS } from './rails';
import { cwScreen } from './screen';
import { section } from './section';
import { TAG_SCALE, letteringBoxes } from './tag-place';
import type { DoorLayout, Layout, Wall } from './types';

const WALLS: readonly Wall[] = ['front', 'left', 'right', 'rear'];
/** the search step along a wall and the least gap kept from anything in the way [mm] */
const STEP = 10, GAP = 15;
/** the least height of a door operator's underside over the kit's top, the car on its compressed buffers, for the kit to
 *  stand under it (registry fossa.posizioni) [mm] */
const OP_CLEAR = 100;
/** in the plan at 1:25, an item's name this far from its face and its dimension's row this far past the name (the
 *  dimension's lettering, on the wall's side of an upright line or over a level one, then keeps clear of the name); a
 *  name with its dimension that much further from the wall when the first row is taken [mm] (as much paper at a larger
 *  scale) */
const NAME_AT = 70, DIM_PAST = 150, KIT_ROW = 250;
/** the pit's lamp (the software's, the 3D's only): its fitting along the wall, from it and high; its middle this far
 *  over the pit floor, and at least this far under the lowest landing [mm] */
const LAMP = { w: 180, d: 60, h: 90, over: 1000, under: 300 } as const;

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
  /** the ladder's stiles' top over the lowest landing in use: KV_VERT.ladderOverSill, or 0 under the stacked panels of a
   *  landing door (a handhold up to that height instead) [mm] */
  ladderTop: number;
  box: PitItem | null;
  /** over the lowest landing: the (upper) stop and the light's switch [mm]; a pit over 1600 mm has a second, lower stop */
  stop: number;
  light: number;
  twoStops: boolean;
  /** the lower stop of a pit over 1600 mm, under the box, its top at the most over the pit floor (reached from the pit's
   *  refuge): its middle over the lowest landing [mm]; null with one stop */
  lowStop: number | null;
  /** the pit's lamp (the 3D's only), its fitting's size and its middle over the lowest landing [mm]; null where none fits */
  lamp: (PitItem & { h: number; at: number }) | null;
}

const bboxOf = (pts: readonly Pt[]): Box => ({
  x0: Math.min(...pts.map((p) => p[0])), y0: Math.min(...pts.map((p) => p[1])), x1: Math.max(...pts.map((p) => p[0])), y1: Math.max(...pts.map((p) => p[1])),
});
const overlaps = (a: Box, b: Box): boolean => a.x0 < b.x1 + GAP && b.x0 < a.x1 + GAP && a.y0 < b.y1 + GAP && b.y0 < a.y1 + GAP;

/** What the ladder, the box and the lamp keep clear of in plan, at their level (`landing`: the box, over the landing;
 *  `pit`: the lamp, under it; `both`: the ladder, from the pit floor to its stiles' top over the sill): the car with its
 *  sills and — where the car on its compressed buffers brings them down to the kit's top — its door operators, the
 *  counterweight with its screen and all the screen closes off to the wall, each rail with its bracket out to its wall,
 *  the governor's rope; over the landing the landing doors' frames with their panels stacked, in the pit their sills on
 *  their brackets with the plate under each (toe.ts: the car's entrance and KV_VERT.toeSide each side), the buffers'
 *  footprints, the refuge space and the governor's tension weight. */
function obstacles(L: Layout, at: 'landing' | 'pit' | 'both'): Box[] {
  const I = L.inputs, c = L.car, v0 = I.landingDepth + I.sillGap, out: Box[] = [{ x0: c.x, y0: c.y, x1: c.x + c.w, y1: c.y + c.h }];
  const over = at !== 'pit', pit = at !== 'landing';
  // the operators hang over the car's doors: their underside at the car's lowest against the ladder's or the box's top
  const K = KV_VERT, top = Math.max(K.ladderOverSill, K.lightAt + K.pitBoxH / 2), opLow = I.doorHeight - section(L).moveDown;
  for (const d of L.doors) {
    out.push(bboxOf(quad(L, d.wall, d.u0 - 40, v0, d.u1 + 40, v0 + I.carDoorDepth + I.carWall)));
    if (opLow <= top + OP_CLEAR) out.push(bboxOf(quad(L, d.wall, d.op0, v0, d.op1, v0 + doorOpDepthOf(I))));
    const z = landingZone(I, d);
    if (over) out.push(bboxOf(quad(L, d.wall, z.over[0], 0, z.over[1], I.landingDepth)));
    if (pit) out.push(bboxOf(quad(L, d.wall, z.under[0], 0, z.under[1], I.landingDepth + 10)));
  }
  // the counterweight's run closed off by its screen: all from the wall to the sheet, end to end (nothing behind it is
  // reached from the door or from the pit)
  const s = cwScreen(L);
  out.push({ x0: L.cw.x, y0: L.cw.y, x1: L.cw.x + L.cw.w, y1: L.cw.y + L.cw.h }, bboxOf(quad(L, s.wall, s.u0, 0, s.u1, s.v1)));
  for (const r of L.rails) {
    const t = RAILS[r.kind === 'car' ? I.carRail : I.cwRail], half = t.b / 2 + 60;
    const [dx, dy] = r.dir === 'right' ? [1, 0] : r.dir === 'left' ? [-1, 0] : r.dir === 'back' ? [0, 1] : [0, -1];
    const foot: Pt = [r.x - dx * t.h, r.y - dy * t.h], wall: Pt = r.bracketAxis === 'x' ? [r.bracketTo, foot[1]] : [foot[0], r.bracketTo];
    out.push(bboxOf([[r.x - dy * half, r.y - dx * half], [r.x + dy * half, r.y + dx * half], [foot[0] - dy * half, foot[1] - dx * half], [foot[0] + dy * half, foot[1] + dx * half]]));
    out.push(bboxOf([[foot[0] - 100, foot[1] - 100], [foot[0] + 100, foot[1] + 100], [wall[0] - 100, wall[1] - 100], [wall[0] + 100, wall[1] + 100]]));
  }
  if (pit) {
    const base = I.vertical.carBufferBase;
    for (const b of bufferPlan(L).spots) {
      const f = b.kind === 'car' ? bufferFoot(base) : Math.max(b.r, bufferFoot(I.vertical.cwBufferBase));
      out.push({ x0: b.c[0] - f, y0: b.c[1] - f, x1: b.c[0] + f, y1: b.c[1] + f });
    }
    out.push(pitSpace(L));
  }
  // the governor's rope with its strands; in the pit also the tension weight's lever (over the landing the box only meets
  // the rope: the weight hangs near the pit floor)
  const g = governorSpot(L);
  if (g) {
    const reach = pit ? Math.max(g.G.R, TENSION.weightAt + TENSION.lever[1]) + 60 : 60;
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
  // the ladder with its stiles over the sill clear of the landing doors' panels, else under them up to the sill
  const over = ladderAllowed ? place(L, edges, K.ladderW, K.ladderD, K.ladderUse, obstacles(L, 'both')) : null;
  const ladder = over ?? (ladderAllowed ? place(L, edges, K.ladderW, K.ladderD, K.ladderUse, obstacles(L, 'pit')) : null);
  const ladderTop = over ? K.ladderOverSill : 0;
  const box = place(L, edges, K.pitBoxW, K.pitBoxD, K.pitReach, [...obstacles(L, 'landing'), ...(ladder ? [ladder.box] : [])]);
  // the stop between 400 mm over the landing and 2000 mm over the pit floor (one stop), or 1000 mm over the landing (two)
  const stop = twoStops ? K.stopUpper : Math.max(K.stopOverLanding, Math.min(K.stopAt, K.stopOverPit - pit));
  const lowStop = twoStops ? K.stopLower - K.pitBoxH / 2 - pit : null;
  // the lamp under the landing, clear of the ladder and the box too
  const spot = place(L, edges, LAMP.w, LAMP.d, Infinity, [...obstacles(L, 'pit'), ...[ladder, box].flatMap((it) => (it ? [it.box] : []))]);
  const lamp = spot ? { ...spot, h: LAMP.h, at: Math.min(LAMP.over - pit, -LAMP.under) } : null;
  const kit: PitKit = { door, edges, ladderAllowed, ladder, ladderTop, box, stop, light: Math.max(K.lightAt, K.lightOver), twoStops, lowStop, lamp };
  kits.set(L, kit);
  return kit;
}

/** The heights of the ladder's rungs over the lowest landing, in a pit `pit` deep: from the one flush with the landing
 *  sill (annex F, F.5 d)) down at KV_VERT.ladderPitch, the lowest at least half a pitch over the pit floor [mm]. The
 *  section and the 3D take them from here. */
export function ladderRungs(pit: number): number[] {
  const p = KV_VERT.ladderPitch, out: number[] = [];
  for (let z = 0; z >= p / 2 - pit; z -= p) out.push(z);
  return out;
}

/** The kit in the plan of the pit: the ladder with its rungs seen from above, the box, their names, and where each stands
 *  along its wall from the corner nearer the door (references: the software's places within the standard's reach) —
 *  each name with its dimension in the first row off its item, and the first place along it (over the item's middle,
 *  else from either of its ends, else beside it), clear of the plan's lettering so far and of the other item's (`taken`,
 *  at the plan's `scale`: lettering-place.ts; the rows as much paper apart at any scale), the names inside the shaft or
 *  in its walls' thickness — where nothing is, the name off the other item's and the screen's (`keep`: their names)
 *  above all, then off the plan's names (`names`). */
export function pitKitPlan(L: Layout, taken: Box[] = [], scale: number = TAG_SCALE, keep: readonly Box[] = [], names: readonly Box[] = []): Entity[] {
  const k = pitKit(L), out: Entity[] = [], f = Math.max(TAG_SCALE, scale) / TAG_SCALE, own: Box[] = [...keep];
  const item = (it: PitItem, name: string, dimText: string): void => {
    const P = (u: number, v: number): Pt => onWall(L, it.wall, u, v), along = it.wall === 'front' || it.wall === 'rear';
    out.push(path(quad(L, it.wall, it.u - it.w / 2, 0, it.u + it.w / 2, it.d), true, 'outline', 'paper'));
    if (name === 'SCALA') for (const s of [-1, 1]) out.push(line(P(it.u + s * (it.w / 2 - KV_VERT.ladderStile), 0), P(it.u + s * (it.w / 2 - KV_VERT.ladderStile), it.d), 'thin'));
    else out.push(path(quad(L, it.wall, it.u - it.w / 2 + 25, it.d - 25, it.u + it.w / 2 - 25, it.d), true, 'thin', 'dark'));
    // from the end of the wall nearer the door's opening to the item's middle
    const ends = along ? [0, L.inputs.W] : [0, L.inputs.D], e0 = Math.abs(it.u - ends[0]) <= Math.abs(it.u - ends[1]) ? ends[0] : ends[1];
    const across = (v: number): number => (along ? P(0, v)[1] : P(0, v)[0]), corner = across(0), face = across(it.d);
    const place = (r: number, u: number, align: 'c' | 'l' | 'r'): Entity[] => {
      const nameV = it.d + (NAME_AT + r * KIT_ROW) * f, dimV = nameV + DIM_PAST * f;
      return [
        { e: 'text', at: P(u, nameV), text: name, size: 1.6, align, angle: along ? 0 : 90, halo: true },
        chain({ dir: along ? 'x' : 'y', pts: e0 < it.u ? [e0, it.u] : [it.u, e0], at: across(dimV), from: e0 < it.u ? [corner, face] : [face, corner], text: [dimText] }),
      ];
    };
    // (over the item from either of its ends, else beside it reading away from either end: the wall's u runs with the
    // paper's x or y, the other way on some walls)
    const byEnds = (r: number): Entity[][] => [place(r, it.u - it.w / 2, 'l'), place(r, it.u + it.w / 2, 'r'), place(r, it.u + it.w / 2, 'l'), place(r, it.u - it.w / 2, 'r')];
    const options = [0, 1].flatMap((r) => [place(r, it.u, 'c'), ...byEnds(r)]);
    // (the names inside the shaft or in its walls, as the brackets' codes are; never over the other item's name, nor over
    // the screen's (`keep`), then never over the plan's other names — a dimension's band under a name its figure steps
    // round)
    const T = L.inputs.wall, got = firstClear(options, taken, scale, { x0: -T, y0: -T, x1: L.inputs.W + T, y1: L.inputs.D + T }, [own, names]);
    own.push(...letteringBoxes(got.filter((e) => e.e === 'text'), scale));
    out.push(...got);
  };
  if (k.ladder) item(k.ladder, 'SCALA', 'Scala {v}');
  if (k.box) item(k.box, 'STOP · PRESA · LUCE', 'Pulsantiera {v}');
  return out;
}

/** The kit in the pit's detail of section A-A (a cut along the depth, the plan's y across the sheet): the ladder in use,
 *  its stiles from the pit floor to their top over the sill (F.2.3) with that height between them, its rungs up to the
 *  sill (ladderRungs), the box's stop and light switch at their heights, a deep pit's lower stop under them, their
 *  heights over each stack of cases — else under it, else beside it, clear of `avoid` (the lettering of the detail's
 *  dimensions, at its `scale`: lettering-place.ts); the ones on the far wall half dashed (behind the cut). */
export function pitKitSection(L: Layout, P: (x: number, z: number) => Pt, pitFloor: number, avoid: readonly Box[] = [], scale: number = TAG_SCALE): Entity[] {
  const k = pitKit(L), out: Entity[] = [], cut = L.car.x + L.car.w / 2;
  const behind = (b: Box): boolean => (b.x0 + b.x1) / 2 > cut;
  if (k.ladder) {
    const b = k.ladder.box, st = behind(b) ? 'hidden' : 'thin', top = k.ladderTop, mid = (b.y0 + b.y1) / 2;
    out.push(path([P(b.y0, pitFloor), P(b.y1, pitFloor), P(b.y1, top), P(b.y0, top)], true, st));
    for (const z of ladderRungs(-pitFloor)) out.push(line(P(b.y0, z), P(b.y1, z), st));
    out.push({ e: 'text', at: P(mid, pitFloor + 140), text: 'SCALA', size: 1.6, align: 'c', halo: true });
    // the stiles' top over the landing sill between them (a reference: the standard's figure, no input changes it)
    if (top > 0) out.push(chain({ dir: 'y', at: mid, pts: [P(mid, 0)[1], P(mid, top)[1]], text: ['Scala +{v}'], from: [null, null] }));
  }
  if (k.box) {
    const b = k.box.box, st = behind(b) ? 'hidden' : 'outline', h = KV_VERT.pitBoxH, stacks: (readonly [number, string])[][] = [];
    // a case for each device, top down; cases touching one another make a stack
    const devices = ([[k.stop, 'STOP'], [k.light, 'LUCE'], ...(k.lowStop !== null ? [[k.lowStop, 'STOP'] as const] : [])] as const).slice().sort((p, q) => q[0] - p[0]);
    for (const d of devices) {
      const z = d[0], last = stacks.at(-1), under = last?.at(-1);
      out.push(path([P(b.y0, z - h / 2), P(b.y1, z - h / 2), P(b.y1, z + h / 2), P(b.y0, z + h / 2)], true, st, 'paper'));
      if (last && under && under[0] - z <= h) last.push(d);
      else stacks.push([d]);
    }
    // over each stack, centred on it, its devices' heights over the lowest landing top down (references: the software's
    // within the standard's band): clear of each other and of the dimensions of the pit's extremes beside the car
    const K = Math.max(TAG_SCALE, scale), f = K / TAG_SCALE, size = letterSize(1.6), taken = [...avoid, ...letteringBoxes(out, scale)];
    for (const s of stacks) {
      const text = s.map(([z, name]) => `${name} ${z < 0 ? '-' : '+'}${Math.abs(Math.round(z))}`).join(' · ');
      const top = s[0][0] + h / 2, bottom = (s[s.length - 1]?.[0] ?? s[0][0]) - h / 2, mid = (top + bottom) / 2 - 0.3 * size * K;
      const at = (x: number, z: number, align: 'c' | 'l' | 'r'): Entity[] => [{ e: 'text', at: P(x, z), text, size: 1.6, align, halo: true }];
      out.push(...firstClear([at((b.y0 + b.y1) / 2, top + 30 * f, 'c'), at((b.y0 + b.y1) / 2, bottom - 30 * f - 0.9 * size * K, 'c'),
        at(b.y1 + 40 * f, mid, 'l'), at(b.y0 - 40 * f, mid, 'r')], taken, scale));
    }
  }
  return out;
}
