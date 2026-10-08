// A plan of the shaft at one level, as model entities for the drawing kernel: concrete walls with the landing door
// openings of that level and their jambs (plan-walls.ts; at the top floor and in the headroom where head.ts puts
// them), landing doors (where landing.ts puts them, with both axes when one stands apart from its car door), car with
// its doors and operator, car frame, T rails with brackets reaching the walls, counterweight (on a side: its bridge
// bracket), axes, and what the level shows: the spaces on the car roof at the top, buffers and the space in the pit at
// the bottom. Dimensions are added by plan-dims.ts.
import { circle, line, path, rect, type Box, type Entity, type Pt } from '../drawing';
import { KV } from './norme';
import { callStationAt, callStationOf } from './callstation';
import { portalOf } from './frame';
import { headBox, headOf, headRail, mainBox, type WallBox } from './head';
import { governorPlan } from './plan-governor';
import { landingOf, shiftAxes } from './landing';
import { onWall, quad, walls } from './plan-walls';
import { AXIS_OVER } from './plan-from';
import { cwPlanCode, genericBracketPlan, panevSupportPlan, specialPlanLabel } from './plan-staffe';
import { CAR_PANEL, GROOVE, LANDING_PANEL, carTracks, landingTracks, trackPlanes, type Tracks } from './sill';
import { doorOpDepthOf } from './operator';
import { bufferPlan, pitSpace } from './pit';
import { roofRefuge } from './roof';
import { RAILS } from './rails';
import { RAIL_KEEP, TAG_R, letteringBoxes, placeTags, type TagAsk, type TagKeep } from './tag-place';
import type { DoorLayout, Layout, Rail } from './types';

export type PlanLevel = 'top' | 'main' | 'bottom' | 'pit';

export { innerFace } from './plan-walls';

/** Where the walls of a plan stand: at the top floor and in the headroom as head.ts says, elsewhere as at the main
 *  floor. */
export const wallsAt = (L: Layout, level: PlanLevel): WallBox => (level === 'top' ? headBox(L.inputs) : mainBox(L.inputs));

/** Entrances with a landing door at a floor. */
export const doorsAt = (L: Layout, floor: number): DoorLayout[] => {
  const f = L.inputs.vertical.floors[floor];
  return f ? L.doors.filter((d) => f.door.includes(d.side)) : [];
};

/** A sill seen from above along u0–u1, from v0 to v1 deep, with the two edges of each groove; the closed panels on
 *  their tracks (the fast one by the gap leads, the slow one by the stack; a centre door's two meet in the middle). */
function sillAndPanels(L: Layout, d: DoorLayout, u0: number, u1: number, v0: number, v1: number, tr: Tracks, t: number): Entity[] {
  const lap = 20, half = d.width / 2 + lap, grooves = trackPlanes(d, tr, t), out: Entity[] = [];
  out.push(path(quad(L, d.wall, u0, v0, u1, v1), true, 'outline'));
  for (const g of grooves) for (const e of [g - GROOVE / 2, g + GROOVE / 2]) out.push(line(onWall(L, d.wall, u0 + 6, e), onWall(L, d.wall, u1 - 6, e), 'fine'));
  const panel = (a: number, b: number, plane: number): Entity => path(quad(L, d.wall, a, plane - t / 2, b, plane + t / 2), true, 'thin', 'door');
  if (d.kind === 'C2') {
    const mid = (d.u0 + d.u1) / 2;
    out.push(panel(d.u0 - lap, mid, grooves[0]), panel(mid, d.u1 + lap, grooves[0]));
  } else {
    const [a, b] = d.stack === 'high' ? [d.u0 - lap, d.u1 - half] : [d.u1 + lap - half, d.u0];
    out.push(panel(a, a + half, grooves[0]), panel(b, b + half, grooves[1]));
  }
  return out;
}

/** Landing door in front of the wall, where it stands (landing.ts): the suspension's length over it (dashed, above the
 *  cut), the sill with its grooves on Panev's brackets, the two panels closed. */
function landingDoor(L: Layout, door: DoorLayout): Entity[] {
  const depth = L.inputs.landingDepth, d = landingOf(door);
  return [path(quad(L, d.wall, d.frame0, 0, d.frame1, depth), true, 'hidden'),
    ...sillAndPanels(L, d, d.u0 - 40, d.u1 + 40, 0, depth, landingTracks(depth), LANDING_PANEL)];
}

/** The landing call station beside a landing door, on the landing face of the wall standing on `box`. */
function callPanel(L: Layout, d: DoorLayout, box: WallBox): Entity[] {
  const { u } = callStationAt(d, callStationOf(L.inputs), portalOf(L.inputs).jamb), [w, , t] = KV.callPanel, T = L.inputs.wall;
  return [path(quad(L, d.wall, u - w / 2, -T - t, u + w / 2, -T, box), true, 'outline', 'steel')];
}

/** Car: walls with the entrances open, car sills and closed panels, the operator above each entrance. */
function carBody(L: Layout, level: PlanLevel): Entity[] {
  const { car, carInner: ci } = L, { landingDepth, sillGap } = L.inputs, out: Entity[] = [];
  out.push(rect(car.x, car.y, car.x + car.w, car.y + car.h, 'outline', 'car'), rect(ci.x, ci.y, ci.x + ci.w, ci.y + ci.h, 'thin', 'paper'));
  for (const d of L.doors) {
    const v0 = landingDepth + sillGap;
    // the opening in the car wall, the sill and the panels
    out.push(path(quad(L, d.wall, d.u0, v0 + L.inputs.carDoorDepth, d.u1, v0 + L.inputs.carDoorDepth + L.inputs.carWall), true, undefined, 'paper'));
    out.push(...sillAndPanels(L, d, d.u0 - 40, d.u1 + 40, v0, v0 + L.inputs.carDoorDepth + L.inputs.carWall, carTracks(v0), CAR_PANEL));
    // car door operator on the car roof: seen at the top, hidden below
    out.push(path(quad(L, d.wall, d.op0, v0, d.op1, v0 + doorOpDepthOf(L.inputs)), true, level === 'top' ? 'thin' : 'hidden'));
  }
  return out;
}

/** T rail with its tip at (x, y) pointing along `dir`, and its bracket (Panev's support on a counterweight rail, with
 *  its code when `label`); `head`: in the headroom, the brackets reach the walls where they stand there. */
function rail(L: Layout, r0: Rail, shoes: boolean, label = false, head = false): Entity[] {
  const r = head ? headRail(L.inputs, r0) : r0;
  const s = RAILS[r.kind === 'car' ? L.inputs.carRail : L.inputs.cwRail], tf = Math.max(6, s.k * 0.9);
  const local: Pt[] = [[0, -s.k / 2], [0, s.k / 2], [-(s.h - tf), s.k / 2], [-(s.h - tf), s.b / 2], [-s.h, s.b / 2], [-s.h, -s.b / 2], [-(s.h - tf), -s.b / 2], [-(s.h - tf), -s.k / 2]];
  const [ux, uy] = r.dir === 'right' ? [1, 0] : r.dir === 'left' ? [-1, 0] : r.dir === 'back' ? [0, 1] : [0, -1];
  const at = (u: number, v: number): Pt => [r.x + u * ux - v * uy, r.y + u * uy + v * ux];
  const out: Entity[] = [path(local.map(([u, v]) => at(u, v)), true, 'steel', 'steel')];
  // the bracket under the rail: Panev's support, or the generic one out to the wall or the bridge
  const hw = head ? headOf(L.inputs) : undefined, br = panevSupportPlan(L, r0, label, hw) ?? genericBracketPlan(L, r);
  out.unshift(...br.under);
  out.push(...br.over, ...specialPlanLabel(L, r, label ? cwPlanCode(L, r0, hw) : null));
  // guide shoe of the guided part, at the tip
  if (shoes) out.push(rect(...shoe(at), 'thin'));
  return out;
}

function shoe(at: (u: number, v: number) => Pt): [number, number, number, number] {
  const a = at(0, -28), b = at(22, 28);
  return [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[0], b[0]), Math.max(a[1], b[1])];
}

/** Car sling seen from above: the crosshead between the rails' tips, two channels either side of their axis; on a
 *  cantilever sling both on the car's side, clear of the counterweight between the rails. */
function carFrame(L: Layout): Entity[] {
  const f = L.frame, [a, b] = L.rails.filter((x) => x.kind === 'car');
  if (!a || !b) return [];
  if (f.kind === 'central') {
    return [rect(a.x, f.axis + 45, b.x, f.axis + 105, 'thin', 'paper'), rect(a.x, f.axis - 105, b.x, f.axis - 45, 'thin', 'paper')];
  }
  const s = L.car.x > f.axis ? 1 : -1, y0 = Math.min(a.y, b.y), y1 = Math.max(a.y, b.y);
  return [rect(f.axis + s * 45, y0, f.axis + s * 105, y1, 'thin', 'paper'), rect(f.axis + s * 115, y0, f.axis + s * 175, y1, 'thin', 'paper')];
}

/** Counterweight: frame with the filler weights, its name along it, and the bridge bracket of a side counterweight. */
function counterweight(L: Layout): Entity[] {
  const c = L.cw, out: Entity[] = [rect(c.x, c.y, c.x + c.w, c.y + c.h, 'outline', 'cw')];
  const inset = 18, upright = c.h >= c.w;
  if (c.w > 2 * inset && c.h > 2 * inset) out.push(rect(c.x + inset, c.y + inset, c.x + c.w - inset, c.y + c.h - inset, 'thin'));
  out.push({ e: 'text', at: upright ? [c.x + c.w / 2 + 30, c.y + c.h / 2] : [c.x + c.w / 2, c.y + c.h / 2 - 30], text: 'CONTRAPPESO', size: 1.8, angle: upright ? 90 : 0,
    align: 'c', halo: true, fit: Math.max(c.w, c.h) - 120 });
  if (L.bridge) {
    const b = L.bridge, left = L.cwSide === 'left';
    out.push(rect(left ? b.x - 25 : b.x, b.y0, left ? b.x : b.x + 25, b.y1, 'steel'));
  }
  return out;
}

/** Axes of the car (rails and centre) and of the counterweight, dash-dot, past the walls. */
function axes(L: Layout): Entity[] {
  const { W, D, wall: T } = L.inputs, over = T + AXIS_OVER, out: Entity[] = [], f = L.frame;
  if (f.kind === 'central') out.push(line([-over, f.axis], [W + over, f.axis], 'axis'));
  else {
    // cantilever: the rails' axis along their wall, and the middle between them across the shaft
    const ys = L.rails.filter((x) => x.kind === 'car').map((r) => r.y), mid = (Math.min(...ys) + Math.max(...ys)) / 2;
    out.push(line([f.axis, -over], [f.axis, D + over], 'axis'), line([-over, mid], [W + over, mid], 'axis'));
  }
  const cx = L.car.x + L.car.w / 2;
  out.push(line([cx, -over], [cx, D + over], 'axis'));
  const c = L.cw;
  if (L.cwSide === 'rear') out.push(line([c.x + c.w / 2, c.y - 60], [c.x + c.w / 2, D + over], 'axis'));
  else out.push(line([c.x + c.w / 2, c.y - 80], [c.x + c.w / 2, c.y + c.h + 80], 'axis'));
  return out;
}

/** Spaces for the maintenance person, dashed with a cross: the refuge space and the free area on the car roof. */
function space(x0: number, y0: number, x1: number, y1: number): Entity[] {
  return [rect(x0, y0, x1, y1, 'space'), line([x0, y0], [x1, y1], 'space'), line([x0, y1], [x1, y0], 'space')];
}

export function planEntities(L: Layout, level: PlanLevel, floor: number): Entity[] {
  const open = doorsAt(L, floor), box = wallsAt(L, level), out: Entity[] = [...walls(L, open, box)];
  for (const d of open) out.push(...landingDoor(L, d), ...callPanel(L, d, box));
  if (level === 'pit') {
    // the pit seen from above: the car and the counterweight are up in the shaft, only their outline is shown
    const c = L.car, w = L.cw;
    out.push(rect(c.x, c.y, c.x + c.w, c.y + c.h, 'hidden'), rect(w.x, w.y, w.x + w.w, w.y + w.h, 'hidden'));
    if (L.bridge) out.push(...counterweight(L).slice(-1));
  } else {
    // a landing door set apart from its car door: the axes of both
    out.push(...carBody(L, level), ...counterweight(L), ...carFrame(L), ...shiftAxes(L, open));
  }
  // the counterweight rails' bracket codes: on the first, and on another whose bracket differs
  const cws = L.rails.filter((x) => x.kind === 'cw'), codes = cws.map((x) => cwPlanCode(L, x, level === 'top' ? headOf(L.inputs) : undefined));
  L.rails.forEach((r) => {
    const k = cws.indexOf(r);
    out.push(...rail(L, r, level !== 'pit', k === 0 || (k > 0 && codes[k] !== codes[0]), level === 'top'));
  });
  out.push(...axes(L), ...governorPlan(L, level === 'pit'));
  if (level === 'top') {
    const { refuge: r, free: f } = roofSpaces(L);
    out.push(...space(r.x0, r.y0, r.x1, r.y1), { e: 'mark', at: [r.x1 - 110, r.y1 - 150], sym: 'tri' });
    out.push(rect(f.x0, f.y0, f.x1, f.y1, 'space'), { e: 'mark', at: [f.x0 + 90, (f.y0 + f.y1) / 2], sym: 'dot' });
  }
  if (level === 'pit') {
    const p = pitSpace(L);
    out.push(...space(p.x0, p.y0, p.x1, p.y1), { e: 'mark', at: [(p.x0 + p.x1) / 2 + 60, (p.y0 + p.y1) / 2 - 60], sym: 'square' });
    for (const b of bufferPlan(L).spots) out.push(circle(b.c, b.r, 'outline', 'paper'), circle(b.c, b.r * 0.55, 'thin'));
    out.push(...pitTags(L, letteringBoxes(out)));
  }
  return out;
}


/** On the car roof: the refuge space at the back on the right of the part where it fits (behind or in front of a low
 *  crosshead, clear of the operators: roof.ts), the free area of at least 0,12 m² at the back on the left. */
export function roofSpaces(L: Layout): { refuge: Box; free: Box } {
  const { refuge, free } = roofRefuge(L);
  return { refuge, free };
}

/** Where the loads on the pit floor act (see loads.ts): P5 car rails, P6 car buffers, P7 counterweight rails, P8 its
 *  buffer. The counterweight's first, as they always were; a car rail's beside its foot toward the doors; a car buffer's
 *  toward the doors, a little outward — off the rails and their brackets, its leader off the car's axes (two buffers
 *  stand on one, a single one on both); each moved round what it names where the others or the shaft's walls are in its
 *  way (tag-place.ts: the counterweight to a side, a buffer off the axis, the arch of two adjacent entrances). */
function pitTags(L: Layout, avoid: readonly Box[]): Entity[] {
  const cx = L.car.x + L.car.w / 2, spots = bufferPlan(L).spots, asks: TagAsk[] = [];
  for (const r of L.rails) {
    const to: Pt = [r.x, r.y], car = r.kind === 'car';
    asks.push(car ? { text: 'P5', to, at: [r.x + (r.x < cx ? 120 : -120), r.y + 230], rank: 1 }
      : { text: 'P7', to, at: [r.x + (r.x < cx ? 230 : -230), r.y] });
  }
  for (const b of spots) {
    const s = Math.sign(b.c[0] - cx) || 1;
    asks.push(b.kind === 'car' ? { text: 'P6', to: b.c, at: [b.c[0] + s * 110, b.c[1] - 290], rank: 2, offAxes: true }
      : { text: 'P8', to: b.c, at: [b.c[0] + 230, b.c[1] + 160] });
  }
  const keep: TagKeep[] = [...L.rails.map((r): TagKeep => ({ c: [r.x, r.y], r: RAIL_KEEP })), ...spots.map((b): TagKeep => ({ c: b.c, r: b.r }))];
  // (the circles on the shaft's walls at most, as the counterweight's buffer's has always stood by the wall behind it)
  const T = L.inputs.wall - TAG_R;
  return placeTags(asks, { x0: -T, y0: -T, x1: L.inputs.W + T, y1: L.inputs.D + T }, keep, avoid);
}
