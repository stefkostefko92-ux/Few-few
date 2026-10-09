// The set-out of the machine room's plan (room-view.ts draws the rest), registry locale.fori, locale.gancio,
// locale.attacchi: what the bricklayer and the fitter take from the plan to core the slab and to place the machine — the
// rope drops (and a 2:1 roping's hitches) from the shaft's inner walls in a row outside the room, each slab opening
// with its size («FORO L×P») and its upstand, the bedplate's corner and the ropes' line or the sheave's axis from two
// walls of the room, a drop line askew with its angle to the nearest wall, the lifting hook over the machine with its
// rated load and its place from two walls, the hitches' plates with P2 and P3, the support's bearings R1…Rn. Model
// entities, room axes [mm]; pure.
import { TEXT, chain, edit as E, line, path, type Box, type Edit, type Entity, type Pt } from '../drawing';
import { machineCorners, type MachineSpec, type RoomGeo } from './machine-room';
import { KV_VERT } from './norme-vert';
import { kerbOf, onDrop, openingsOf, type SlabOpening } from './room-draw';
import type { Hook } from './room-hook';
import { AT, dimBands, firstClear, gridNear, leaderFrom, letteringBox, placeOf, tagBox, takenBy } from './room-label';
import { hitchTags } from './room-loads';
import type { RoomSite } from './room-site';

export type { SlabOpening } from './room-draw';

/** The slab's openings round the ropes (and a pulley dipping into the slab) of the machine `M` (room-draw.ts
 *  openingsOf). */
export const slabOpenings = (S: RoomSite, M: MachineSpec, G: RoomGeo): SlabOpening[] => openingsOf(S, M, G);

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
 *  parts, the places kept clear, the lettering and the dimension lines; `k` the plan's scale. */
function openingMarks(S: RoomSite, M: MachineSpec, G: RoomGeo, busy: Box[], within: Box, k: number): Entity[] {
  const out: Entity[] = [], g = G.dir;
  for (const o of slabOpenings(S, M, G)) {
    // the upstand round it, as thick as KV_VERT.kerbW
    out.push(path(kerbOf(G, o), true, 'thin'));
    const text = openingName(o, G), uc = (o.u0 + o.u1) / 2, at = (p: Pt): { at: Pt; box: Box } => ({ at: p, box: letteringBox(p, text, TEXT.min, 'c', 0, false, k) });
    // beside the machine on the side away from its gearbox, then the other, stepping out; then farther over the room
    const vs = [-1, 1].flatMap((s) => [150, 300, 450, 600, 800].map((dv) => (s * -g > 0 ? G.across[1] + dv : G.across[0] - dv)));
    const places = vs.flatMap((v) => [0, 250, -250].map((du) => at(onDrop(G, uc + du, v))));
    const spot = placeOf(places, () => gridNear(within, o.centre).map(at), busy, within, GAP * k);
    busy.push(spot.box);
    out.push({ e: 'text', at: spot.at, text, size: TEXT.min, align: 'c', halo: true }, line(leaderFrom(spot.box, o.centre), o.centre, 'dim'));
  }
  return out;
}

/** The paper a name or a reference keeps round it off what is there [mm]. */
const GAP = 0.8;

/** The set-out's entities over the plan drawn so far (`drawn`: its lettering and references kept clear; `keep`: the
 *  machine's parts and the places kept clear; `rows`: the bands of the chains already beside the machine), the hook
 *  `hook` over the machine; `k` the plan's scale (model millimetres to one of paper: its lettering's size there). */
export function setoutPlan(S: RoomSite, M: MachineSpec, G: RoomGeo, hook: Hook, drawn: readonly Entity[], keep: readonly Box[], rows: readonly Box[] = [], k = AT): Entity[] {
  const R = G.room, out: Entity[] = [], within: Box = { x0: 60, y0: 60, x1: R.W - 60, y1: R.D - 60 }, busy = [...takenBy(drawn, k), ...dimBands(drawn, k), ...keep];
  out.push(...openingMarks(S, M, G, busy, within, k));
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
    // (then every 100 mm across the room, the nearest the machine first: a row clear of all wins over a usual one on
    // something)
    const rowsAt = (): number[] => {
      const all = [lo - 170, lo - 400, lo - 650, lo / 2, hi + 170, hi + 400, hi + 650, (hi + crossLen) / 2], inRoom = all.filter((a) => a > 150 && a < crossLen - 150);
      const more = Array.from({ length: Math.max(0, Math.floor((crossLen - 400) / 100) + 1) }, (_, i) => 200 + i * 100).sort((a, b) => Math.abs(a - (lo + hi) / 2) - Math.abs(b - (lo + hi) / 2));
      return [...(inRoom.length ? inRoom : [Math.max(60, lo - 170), Math.min(crossLen - 60, hi + 170)]), ...more];
    };
    const tries = [0, len].flatMap((w) => rowsAt().map((a) => {
      const ms = marks(w), far = ms.reduce((f, m) => (Math.abs(m[0] - w) > Math.abs(f - w) ? m[0] : f), w);
      const band: Box = ax ? { x0: a - 130, y0: Math.min(w, far), x1: a + 130, y1: Math.max(w, far) } : { x0: Math.min(w, far), y0: a - 130, x1: Math.max(w, far), y1: a + 130 };
      return { w, a, ms, cost: avoid.reduce((t, b) => t + over(band, b), 0) + Math.abs(far - w) };
    }));
    return tries.reduce((p, q) => (q.cost < p.cost ? q : p));
  };
  const corner = (ax: 0 | 1, w: number): Pt => box.reduce((p, q) => (w === 0 ? (q[ax] < p[ax] ? q : p) : q[ax] > p[ax] ? q : p));
  const setOut = (ax: 0 | 1, wall: number, marks: readonly (readonly [number, number, string])[], at: number): Entity => {
    // the points by their distance from the wall (one within 1 mm of another dropped), each segment named by its far end
    const pts = [...marks].sort((a, b) => Math.abs(a[0] - wall) - Math.abs(b[0] - wall)).filter((m, i, a) => i === 0 || Math.abs(m[0] - a[i - 1][0]) >= 1);
    const values = [wall, ...pts.map((m) => m[0])].sort((a, b) => a - b), named = (v: number): string => `{v} ${pts.find((m) => m[0] === v)?.[2] ?? ''}`.trim();
    const text = values.slice(1).map((v, i) => named(wall === 0 ? v : values[i])), from = values.map((v) => (v === wall ? undefined : pts.find((m) => m[0] === v)?.[1]));
    return chain({ dir: ax ? 'y' : 'x', pts: values, at, from, text, within });
  };
  const px = place(0, by0, by1, R.W, R.D, (w) => [[corner(0, w)[0], corner(0, w)[1], 'Telaio'], ...extraX, [hx, hy, 'Gancio']]), cx = setOut(0, px.w, px.ms, px.a);
  // (the other off the first's line and lettering where it can)
  avoid.push(...dimBands([cx], k));
  const py = place(1, bx0, bx1, R.D, R.W, (w) => [[corner(1, w)[1], corner(1, w)[0], 'Telaio'], ...extraY, [hy, hx, 'Gancio']]);
  const chains = [cx, setOut(1, py.w, py.ms, py.a)], angle = askew ? angleMark(G, M) : [];
  out.push(...chains, ...angle);
  // the hook's name and the hitches' references off the set-out's chains and the angle too
  busy.push(...dimBands(chains, k), ...takenBy(angle, k));
  out.push(...hookMarks(hook, { x0: bx0, y0: by0, x1: bx1, y1: by1 }, busy, within, k), ...hitchMarks(G, busy, within, k));
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
 *  (its place from the walls is in the set-out's chains); none of those clear, the nearest clear over the room, then
 *  the same in two lines (the name over the load), then in three. */
function hookMarks(hook: Hook, box: Box, busy: Box[], within: Box, k: number): Entity[] {
  const [x, y] = hook.at, sym: Entity = { e: 'mark', at: hook.at, sym: 'hook', size: 3.2 }, out: Entity[] = [sym];
  const one = [`GANCIO DI SOLLEVAMENTO · PORTATA ${hook.load} kg`], two = ['GANCIO DI SOLLEVAMENTO', `PORTATA ${hook.load} kg`], three = ['GANCIO DI', 'SOLLEVAMENTO', `PORTATA ${hook.load} kg`];
  const lead = 1.3 * TEXT.min * k;
  const place = (at: Pt, align: 'l' | 'r' | 'c', lines: readonly string[]) => {
    const bs = lines.map((t, i) => letteringBox([at[0], at[1] - i * lead], t, TEXT.min, align, 0, false, k));
    return { at, align, lines, box: { x0: Math.min(...bs.map((b) => b.x0)), y0: Math.min(...bs.map((b) => b.y0)), x1: Math.max(...bs.map((b) => b.x1)), y1: Math.max(...bs.map((b) => b.y1)) } };
  };
  const usual = (lines: readonly string[]) => [120, 300, 480, 700, 950].flatMap((d) => [
    place([box.x1 + d, y + 40], 'l', lines), place([box.x0 - d, y + 40], 'r', lines), place([x, box.y1 + d], 'c', lines), place([x, box.y0 - d - 40], 'c', lines),
  ]);
  busy.push(...takenBy([sym], k));
  const grid = (lines: readonly string[]) => () => gridNear(within, hook.at).map((p) => place(p, 'c', lines));
  const spot = placeOf(usual(one), grid(one), busy, within, GAP * k, () => usual(two), grid(two), () => usual(three), grid(three));
  busy.push(spot.box);
  out.push(...spot.lines.map((t, i): Entity => ({ e: 'text', at: [spot.at[0], spot.at[1] - i * lead], text: t, size: TEXT.min, align: spot.align, halo: true })), line(leaderFrom(spot.box, hook.at), hook.at, 'dim'));
  return out;
}

/** A 2:1 roping's hitches on the slab: the counter-plate on the floor over each, its load P2 (the car's) or P3 — once:
 *  where it goes as a rule (room-loads.ts hitchTags), else round the hitch, else the nearest clear over the room. */
function hitchMarks(G: RoomGeo, busy: Box[], within: Box, k: number): Entity[] {
  const out: Entity[] = [], h = KV_VERT.hitchPlate / 2, rule = hitchTags(G);
  G.deadEnds.forEach((d, i) => {
    const n: Pt = [-d.dir[1], d.dir[0]], c = d.at, corner = (p: number, q: number): Pt => [c[0] + p * d.dir[0] + q * n[0], c[1] + p * d.dir[1] + q * n[1]];
    out.push(path([corner(-h, -h), corner(h, -h), corner(h, h), corner(-h, h)], true, 'outline'));
    const text = i === 0 ? 'P2' : 'P3', at = (p: Pt): { at: Pt; box: Box } => ({ at: p, box: tagBox(p, text, k) }), first = rule[i];
    const places = [...(first?.e === 'tag' ? [at(first.at)] : []), ...[0, 45, 90, 135, 180, 225, 270, 315].flatMap((deg) => [220, 340, 480].map((r) =>
      at([c[0] + r * Math.cos((deg * Math.PI) / 180), c[1] + r * Math.sin((deg * Math.PI) / 180)])))];
    const spot = placeOf(places, () => gridNear(within, c).map(at), busy, within, GAP * k);
    busy.push(spot.box);
    out.push({ e: 'tag', at: spot.at, text, to: c });
  });
  return out;
}

/** The support's bearings R1…Rn (room-reactions.ts) each with its reference beside it, clear of the rest (the
 *  lettering, the references and the dimension lines of `drawn`, `keep`); none round it clear, the nearest clear over
 *  the room; `k` the plan's scale. */
export function reactionMarks(pts: readonly Pt[], drawn: readonly Entity[], keep: readonly Box[], within: Box, k = AT): Entity[] {
  const out: Entity[] = [], busy = [...takenBy(drawn, k), ...dimBands(drawn, k), ...keep], cx = pts.reduce((t, p) => t + p[0], 0) / (pts.length || 1), cy = pts.reduce((t, p) => t + p[1], 0) / (pts.length || 1);
  pts.forEach((p, i) => {
    const text = `R${i + 1}`, at = (q: Pt): { at: Pt; box: Box } => ({ at: q, box: tagBox(q, text, k) }), a0 = Math.atan2(p[1] - cy, p[0] - cx);
    const places = [0, 0.6, -0.6, 1.2, -1.2, 1.8, -1.8, Math.PI].flatMap((da) => [150, 260, 380, 520, 700].map((r) => at([p[0] + r * Math.cos(a0 + da), p[1] + r * Math.sin(a0 + da)])));
    const spot = placeOf(places, () => gridNear(within, p).map(at), busy, within, (GAP / 2) * k);
    busy.push(spot.box);
    out.push({ e: 'tag', at: spot.at, text, to: p });
  });
  return out;
}

/** The scale the label boxes are measured at, for those that place entities at a coarser one. */
export const LABEL_SCALE = AT;

/** The car rails' axis across the shaft at `y` (room axes) as an axis, named where the name keeps off what the plan has
 *  (`drawn` and `keep`), at either end of it inside the shaft or past its walls, else along it; `k` the plan's scale. */
export function railAxis(S: RoomSite, G: RoomGeo, y: number, drawn: readonly Entity[], keep: readonly Box[], k = AT): Entity[] {
  const R = G.room, x0 = R.shaftX, x1 = R.shaftX + S.W, text = 'Asse guide cabina', busy = [...takenBy(drawn, k), ...dimBands(drawn, k), ...keep];
  const place = (at: Pt, align: 'l' | 'r') => ({ at, align, box: letteringBox(at, text, TEXT.min, align, 0, false, k) });
  // at either end inside the shaft, over or under the axis, past the walls; then along it, every 100 mm
  const below = y - 30 - TEXT.min * k;
  const along = Array.from({ length: Math.max(0, Math.floor((x1 - x0 - 120) / 100)) }, (_, i) => x0 + 160 + i * 100).flatMap((x) => [place([x, y + 30], 'l'), place([x, below], 'l')]);
  const places = [place([x0 + 60, y + 30], 'l'), place([x1 - 60, y + 30], 'r'), place([x0 + 60, below], 'l'), place([x1 - 60, below], 'r'),
    place([x0 - 60, y + 30], 'r'), place([x1 + 60, y + 30], 'l'), ...along];
  const spot = firstClear(places, busy, { x0: 40, y0: 40, x1: R.W - 40, y1: R.D - 40 }, 0.6 * k);
  return [line([x0, y], [x1, y], 'axis'), ...(spot ? [{ e: 'text' as const, at: spot.at, text, size: TEXT.min, align: spot.align, halo: true }] : [])];
}
