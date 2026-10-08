// The set-out of the machine room's plan (room-view.ts draws the rest), registry locale.fori, locale.gancio,
// locale.attacchi: what the bricklayer and the fitter take from the plan to core the slab and to place the machine — the
// rope drops (and a 2:1 roping's hitches) from the shaft's inner walls in a row outside the room, each slab opening
// with its size («FORO L×P») and its upstand, the bedplate's corner and the ropes' line or the sheave's axis from two
// walls of the room, a drop line askew with its angle to the nearest wall, the lifting hook over the machine with its
// rated load and its place from two walls, the hitches' plates with P2 and P3, the support's bearings R1…Rn. Model
// entities, room axes [mm]; pure.
import { chain, edit as E, line, path, type Box, type Edit, type Entity, type Pt } from '../drawing';
import { machineCorners, type MachineSpec, type RoomGeo } from './machine-room';
import { KV_VERT } from './norme-vert';
import { holesOf, onDrop } from './room-draw';
import type { Hook } from './room-hook';
import { AT, firstClear, letteringBox, tagBox, takenBy } from './room-label';
import { ropeWidths } from './ropes';
import type { RoomSite } from './room-site';

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
 *  slabHoles), KV_VERT.holeGap clear. */
export function slabOpenings(S: RoomSite, M: MachineSpec, G: RoomGeo): SlabOpening[] {
  const w = ropeWidths(M.n, M.d);
  return holesOf(S, M, G).map((h) => {
    const a = (h.wheel ? Math.max(w.ropes, w.pulley) : w.ropes) + KV_VERT.holeGap;
    return { u0: h.u0, u1: h.u1, pts: [onDrop(G, h.u0, -a), onDrop(G, h.u1, -a), onDrop(G, h.u1, a), onDrop(G, h.u0, a)], centre: onDrop(G, (h.u0 + h.u1) / 2, 0), along: h.u1 - h.u0, across: 2 * a, wheel: h.wheel };
  });
}

/** An opening's name on the plan: its sides along x and y of the room (L × P), or along and across the drop line askew. */
export function openingName(o: SlabOpening, G: RoomGeo): string {
  const r = (x: number): number => Math.round(x), onX = Math.abs(G.ux) > 0.999, onY = Math.abs(G.uy) > 0.999;
  return onX ? `FORO ${r(o.along)}×${r(o.across)}` : onY ? `FORO ${r(o.across)}×${r(o.along)}` : `FORO ${r(o.along)}×${r(o.across)}`;
}

/** Whether the drop line runs askew to the room's walls. */
export const askewOf = (G: RoomGeo): boolean => Math.max(Math.abs(G.ux), Math.abs(G.uy)) <= 0.999;

/** The drop line's angle to the nearest wall [°] (0 on an axis). */
export function dropAngle(G: RoomGeo): number {
  const t = (Math.atan2(Math.abs(G.uy), Math.abs(G.ux)) * 180) / Math.PI;
  return t <= 45 ? t : 90 - t;
}

/** The rope drops — and a 2:1 roping's hitches — from the shaft's inner walls, one chain along each axis nearest the
 *  drawing (row 0, inside the shaft's own; `inside`: across the shaft by its wall, when that row would cost the plan its
 *  scale): a survey's car drop changes with its segment from the nearer wall, the rest follows the calculation or the
 *  layout (references). */
export function dropChains(S: RoomSite, G: RoomGeo, dimSide: 'top' | 'bottom' | 'left' | 'right', inside = false): Entity[] {
  const R = G.room, out: Entity[] = [], d = S.drops ?? { car: [G.carDrop[0] - R.shaftX, G.carDrop[1] - R.shaftY] as Pt, cw: [G.cwDrop[0] - R.shaftX, G.cwDrop[1] - R.shaftY] as Pt };
  const dead = G.deadEnds.map((e): Pt => [e.at[0] - R.shaftX, e.at[1] - R.shaftY]), editable = S.drops !== null;
  for (const [ax, len, at0, side] of [[0, S.W, R.shaftX, dimSide === 'top' ? 'bottom' : 'top'], [1, S.D, R.shaftY, dimSide === 'right' ? 'left' : 'right']] as const) {
    const r2 = (p: number): number => Math.round(p * 2) / 2, car = r2(d.car[ax]), pts0 = [d.car, d.cw, ...dead];
    const mid = [...new Set(pts0.map((p) => r2(p[ax])))].sort((a, b) => a - b).filter((p, i, a) => i === 0 || p - a[i - 1] >= 1);
    const key = ax ? 'drop.carY' : 'drop.carX', pts = [0, ...mid, len];
    const edit = pts.slice(1).map((p, i): Edit | null => (!editable ? null : i === 0 && p === car ? E(key) : i === pts.length - 2 && pts[i] === car ? E(key, len, -1) : null));
    // each point's extension line from the point itself (two on one line: from the farther, through the nearer), the
    // shaft's walls from the drawing's edge
    const other = ax ? R.shaftX : R.shaftY, across = (q: Pt): number => other + q[1 - ax], up = side === 'top' || side === 'right';
    const from = pts.map((p, i) => {
      if (i === 0 || i === pts.length - 1) return undefined;
      const on = pts0.filter((q) => Math.abs(r2(q[ax]) - p) < 1).map(across);
      return (up ? Math.min : Math.max)(...on);
    });
    // inside: across the shaft by its wall on that side, the extension lines from the drops to it
    const along = ax ? (up ? R.shaftX + S.W - 120 : R.shaftX + 120) : (up ? R.shaftY + S.D - 120 : R.shaftY + 120);
    out.push(chain(inside ? { dir: ax ? 'y' : 'x', pts: pts.map((p) => at0 + p), at: along, edit, from: from.map((f) => f ?? along), within: { x0: R.shaftX, y0: R.shaftY, x1: R.shaftX + S.W, y1: R.shaftY + S.D } }
      : { dir: ax ? 'y' : 'x', pts: pts.map((p) => at0 + p), side, row: 0, edit, from }));
  }
  return out;
}

/** The slab openings' upstands in plan and their names with a leader, clear of what the plan has: `busy` the machine's
 *  parts and the places kept clear. */
function openingMarks(S: RoomSite, M: MachineSpec, G: RoomGeo, busy: Box[], within: Box): Entity[] {
  const out: Entity[] = [], k = KV_VERT.kerbW, g = G.dir;
  for (const o of slabOpenings(S, M, G)) {
    // the upstand round it, as thick as KV_VERT.kerbW
    out.push(path([onDrop(G, o.u0 - k, -o.across / 2 - k), onDrop(G, o.u1 + k, -o.across / 2 - k), onDrop(G, o.u1 + k, o.across / 2 + k), onDrop(G, o.u0 - k, o.across / 2 + k)], true, 'thin'));
    const text = openingName(o, G), uc = (o.u0 + o.u1) / 2;
    // beside the machine on the side away from its gearbox, then the other, stepping out
    const vs = [-1, 1].flatMap((s) => [150, 300, 450, 600, 800].map((dv) => (s * -g > 0 ? G.across[1] + dv : G.across[0] - dv)));
    const places = vs.flatMap((v) => [0, 250, -250].map((du) => {
      const at = onDrop(G, uc + du, v), box = letteringBox(at, text, 1.6, 'c');
      return { at, box };
    }));
    const spot = firstClear(places, busy, within);
    if (!spot) continue;
    busy.push(spot.box);
    out.push({ e: 'text', at: spot.at, text, size: 1.6, align: 'c', halo: true }, line([spot.at[0], spot.at[1] + (spot.at[1] < o.centre[1] ? 40 : -10)], o.centre, 'dim'));
  }
  return out;
}

/** The set-out's entities over the plan drawn so far (`drawn`: its lettering and references kept clear; `keep`: the
 *  machine's parts and the places kept clear; `rows`: the bands of the chains already beside the machine), the hook
 *  `hook` over the machine. */
export function setoutPlan(S: RoomSite, M: MachineSpec, G: RoomGeo, hook: Hook, drawn: readonly Entity[], keep: readonly Box[], rows: readonly Box[] = []): Entity[] {
  const R = G.room, out: Entity[] = [], within: Box = { x0: 60, y0: 60, x1: R.W - 60, y1: R.D - 60 }, busy = [...takenBy(drawn), ...keep];
  out.push(...openingMarks(S, M, G, busy, within));
  // from the two walls with the most room beside the machine, a chain each: to the bedplate's edge (its corner toward
  // that wall), on an axis to the ropes' line across the drop line or to the sheave's axis along it, and to the hook —
  // each segment named by its far end; askew the drops' coordinates and the angle place the line
  const cs = machineCorners(G, M, false), box = M.rinvio?.on === 'frame' && cs.length >= 8 ? cs.slice(4, 8) : cs.slice(0, 4);
  const xs = box.map((q) => q[0]), ys = box.map((q) => q[1]), bx0 = Math.min(...xs), bx1 = Math.max(...xs), by0 = Math.min(...ys), by1 = Math.max(...ys);
  const askew = askewOf(G), alongY = Math.abs(G.uy) > 0.999, sheave = onDrop(G, G.sheaveAt, 0), rope = G.carDrop, [hx, hy] = hook.at;
  // (on an axis: across the drop line the ropes' line, along it the sheave's axis)
  const extraX: (readonly [number, number, string])[] = askew ? [] : alongY ? [[rope[0], rope[1], 'Asse funi']] : [[sheave[0], sheave[1], 'Asse puleggia']];
  const extraY: (readonly [number, number, string])[] = askew ? [] : alongY ? [[sheave[1], sheave[0], 'Asse puleggia']] : [[rope[1], rope[0], 'Asse funi']];
  // the chain's row beside the machine where it lies least on what is there: either wall, a few rows on either side
  const avoid = [...busy, ...rows], over = (a: Box, b: Box): number => Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0)) * Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0));
  const place = (ax: 0 | 1, lo: number, hi: number, len: number, crossLen: number, marks: (w: number) => (readonly [number, number, string])[]) => {
    // (a machine across the whole room: the rows by its sides kept inside the room)
    const rowsAt = (): number[] => {
      const all = [lo - 170, lo - 400, lo - 650, lo / 2, hi + 170, hi + 400, hi + 650, (hi + crossLen) / 2], inRoom = all.filter((a) => a > 150 && a < crossLen - 150);
      return inRoom.length ? inRoom : [Math.max(60, lo - 170), Math.min(crossLen - 60, hi + 170)];
    };
    const tries = [0, len].flatMap((w) => rowsAt().map((a) => {
      const ms = marks(w), far = ms.reduce((f, m) => (Math.abs(m[0] - w) > Math.abs(f - w) ? m[0] : f), w);
      const band: Box = ax ? { x0: a - 130, y0: Math.min(w, far), x1: a + 130, y1: Math.max(w, far) } : { x0: Math.min(w, far), y0: a - 130, x1: Math.max(w, far), y1: a + 130 };
      return { w, a, ms, cost: avoid.reduce((t, b) => t + over(band, b), 0) + Math.abs(far - w) };
    }));
    return tries.reduce((p, q) => (q.cost < p.cost ? q : p));
  };
  const corner = (ax: 0 | 1, w: number): Pt => box.reduce((p, q) => (w === 0 ? (q[ax] < p[ax] ? q : p) : q[ax] > p[ax] ? q : p));
  const px = place(0, by0, by1, R.W, R.D, (w) => [[corner(0, w)[0], corner(0, w)[1], 'Telaio'], ...extraX, [hx, hy, 'Gancio']]);
  const py = place(1, bx0, bx1, R.D, R.W, (w) => [[corner(1, w)[1], corner(1, w)[0], 'Telaio'], ...extraY, [hy, hx, 'Gancio']]);
  const setOut = (ax: 0 | 1, wall: number, marks: readonly (readonly [number, number, string])[], at: number): Entity => {
    // the points by their distance from the wall (one within 1 mm of another dropped), each segment named by its far end
    const pts = [...marks].sort((a, b) => Math.abs(a[0] - wall) - Math.abs(b[0] - wall)).filter((m, i, a) => i === 0 || Math.abs(m[0] - a[i - 1][0]) >= 1);
    const values = [wall, ...pts.map((m) => m[0])].sort((a, b) => a - b), named = (v: number): string => `{v} ${pts.find((m) => m[0] === v)?.[2] ?? ''}`.trim();
    const text = values.slice(1).map((v, i) => named(wall === 0 ? v : values[i])), from = values.map((v) => (v === wall ? undefined : pts.find((m) => m[0] === v)?.[1]));
    return chain({ dir: ax ? 'y' : 'x', pts: values, at, from, text, within });
  };
  out.push(setOut(0, px.w, px.ms, px.a), setOut(1, py.w, py.ms, py.a));
  if (askew) out.push(...angleMark(G, M));
  out.push(...hookMarks(hook, { x0: bx0, y0: by0, x1: bx1, y1: by1 }, busy, within), ...hitchMarks(G, busy, within));
  return out;
}

/** A drop line askew: its angle to the nearest wall, past the end of the machine and its bedplate on the drop line
 *  (prolonged there as an axis): an arc between the wall's direction and the line, the angle in degrees. */
function angleMark(G: RoomGeo, M: MachineSpec): Entity[] {
  const a = dropAngle(G), t = (Math.atan2(G.uy, G.ux) * 180) / Math.PI, onX = Math.abs(G.ux) >= Math.abs(G.uy), R = G.room;
  // the line's end past the machine with room for the arc, on the side the room is longer
  const ends = machineCorners(G, M).map((p) => (p[0] - G.carDrop[0]) * G.ux + (p[1] - G.carDrop[1]) * G.uy), r = 380;
  const inRoom = (u: number): boolean => { const p = onDrop(G, u, 0); return p[0] > r + 100 && p[0] < R.W - r - 100 && p[1] > r + 100 && p[1] < R.D - r - 100; };
  const after = Math.max(...ends, G.calata) + 120, before = Math.min(...ends, 0) - 120, ua = inRoom(after + r) || !inRoom(before - r) ? after : before, s = ua === after ? 1 : -1;
  const c = onDrop(G, ua, 0), dirDeg = s > 0 ? t : t + 180;
  // the wall's direction nearest the line, on its side
  const ref = onX ? (Math.cos((dirDeg * Math.PI) / 180) >= 0 ? 0 : 180) : Math.sin((dirDeg * Math.PI) / 180) >= 0 ? 90 : -90;
  const d = ((dirDeg - ref + 540) % 360) - 180, arc: Pt[] = [];
  for (let i = 0; i <= 16; i++) {
    const q = ((ref + (d * i) / 16) * Math.PI) / 180;
    arc.push([c[0] + r * Math.cos(q), c[1] + r * Math.sin(q)]);
  }
  const rq = (ref * Math.PI) / 180, dq = (dirDeg * Math.PI) / 180, mq = ((ref + d / 2) * Math.PI) / 180, txt = `${a.toFixed(1).replace('.', ',')}°`;
  const from = s > 0 ? G.cwDrop : G.carDrop;
  return [line(from, [c[0] + (r + 100) * Math.cos(dq), c[1] + (r + 100) * Math.sin(dq)], 'axis'), line(c, [c[0] + (r + 100) * Math.cos(rq), c[1] + (r + 100) * Math.sin(rq)], 'thin'),
    path(arc, false, 'thin'), { e: 'text', at: [c[0] + (r + 110) * Math.cos(mq), c[1] + (r + 110) * Math.sin(mq) - 30], text: txt, size: 1.8, align: 'c', halo: true }];
}

/** The lifting hook: its symbol, and its name with the rated load beside the machine's outline `box`, a leader to it
 *  (its place from the walls is in the set-out's chains). */
function hookMarks(hook: Hook, box: Box, busy: Box[], within: Box): Entity[] {
  const [x, y] = hook.at, out: Entity[] = [{ e: 'mark', at: hook.at, sym: 'hook', size: 3.2 }];
  const text = `GANCIO DI SOLLEVAMENTO · PORTATA ${hook.load} kg`;
  const places = [120, 300, 480].flatMap((d) => [
    { at: [box.x1 + d, y + 40] as Pt, align: 'l' as const }, { at: [box.x0 - d, y + 40] as Pt, align: 'r' as const },
    { at: [x, box.y1 + d] as Pt, align: 'c' as const }, { at: [x, box.y0 - d - 40] as Pt, align: 'c' as const },
  ]).map((p) => ({ ...p, box: letteringBox(p.at, text, 1.6, p.align) }));
  const spot = firstClear(places, busy, within) ?? places[0];
  busy.push(spot.box);
  const end: Pt = spot.align === 'l' ? [spot.box.x0 - 10, spot.at[1] + 15] : spot.align === 'r' ? [spot.box.x1 + 10, spot.at[1] + 15] : [spot.at[0], spot.at[1] < y ? spot.box.y1 + 10 : spot.box.y0 - 10];
  out.push({ e: 'text', at: spot.at, text, size: 1.6, align: spot.align, halo: true }, line(end, [x, y], 'dim'));
  return out;
}

/** A 2:1 roping's hitches on the slab: the counter-plate on the floor over each, its load P2 (the car's) or P3. */
function hitchMarks(G: RoomGeo, busy: Box[], within: Box): Entity[] {
  const out: Entity[] = [], h = KV_VERT.hitchPlate / 2;
  G.deadEnds.forEach((d, i) => {
    const n: Pt = [-d.dir[1], d.dir[0]], c = d.at, corner = (p: number, q: number): Pt => [c[0] + p * d.dir[0] + q * n[0], c[1] + p * d.dir[1] + q * n[1]];
    out.push(path([corner(-h, -h), corner(h, -h), corner(h, h), corner(-h, h)], true, 'outline'));
    const places = [0, 45, 90, 135, 180, 225, 270, 315].flatMap((deg) => [220, 340].map((r) => {
      const at: Pt = [c[0] + r * Math.cos((deg * Math.PI) / 180), c[1] + r * Math.sin((deg * Math.PI) / 180)];
      return { at, box: tagBox(at) };
    }));
    const spot = firstClear(places, busy, within) ?? places[0];
    busy.push(spot.box);
    out.push({ e: 'tag', at: spot.at, text: i === 0 ? 'P2' : 'P3', to: c });
  });
  return out;
}

/** The support's bearings R1…Rn (room-reactions.ts) each with its reference beside it, clear of the rest. */
export function reactionMarks(pts: readonly Pt[], drawn: readonly Entity[], keep: readonly Box[], within: Box): Entity[] {
  const out: Entity[] = [], busy = [...takenBy(drawn), ...keep], cx = pts.reduce((t, p) => t + p[0], 0) / (pts.length || 1), cy = pts.reduce((t, p) => t + p[1], 0) / (pts.length || 1);
  pts.forEach((p, i) => {
    const a0 = Math.atan2(p[1] - cy, p[0] - cx), places = [0, 0.6, -0.6, 1.2, -1.2, 1.8, -1.8, Math.PI].flatMap((da) => [150, 260, 380, 520, 700].map((r) => {
      const at: Pt = [p[0] + r * Math.cos(a0 + da), p[1] + r * Math.sin(a0 + da)];
      return { at, box: tagBox(at) };
    }));
    const spot = firstClear(places, busy, within, 10) ?? places[0];
    busy.push(spot.box);
    out.push({ e: 'tag', at: spot.at, text: `R${i + 1}`, to: p });
  });
  return out;
}

/** The scale the label boxes are measured at, for those that place entities at a coarser one. */
export const LABEL_SCALE = AT;

/** The car rails' axis across the shaft at `y` (room axes) as an axis, named where the name keeps off what the plan has
 *  (`drawn` and `keep`), at either end of it inside the shaft or past its walls. */
export function railAxis(S: RoomSite, G: RoomGeo, y: number, drawn: readonly Entity[], keep: readonly Box[]): Entity[] {
  const R = G.room, x0 = R.shaftX, x1 = R.shaftX + S.W, text = 'Asse guide cabina', busy = [...takenBy(drawn), ...keep];
  const places = [
    { at: [x0 + 60, y + 30] as Pt, align: 'l' as const }, { at: [x1 - 60, y + 30] as Pt, align: 'r' as const },
    { at: [x0 + 60, y - 75] as Pt, align: 'l' as const }, { at: [x1 - 60, y - 75] as Pt, align: 'r' as const },
    { at: [x0 - 60, y + 30] as Pt, align: 'r' as const }, { at: [x1 + 60, y + 30] as Pt, align: 'l' as const },
  ].map((p) => ({ ...p, box: letteringBox(p.at, text, 1.4, p.align) }));
  const spot = firstClear(places, busy, { x0: 40, y0: 40, x1: R.W - 40, y1: R.D - 40 }, 15);
  return [line([x0, y], [x1, y], 'axis'), ...(spot ? [{ e: 'text' as const, at: spot.at, text, size: 1.4, align: spot.align, halo: true }] : [])];
}
