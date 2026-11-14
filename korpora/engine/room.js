// A room: several pieces of furniture in one project, each on a wall of the room — the back wall (А), and with a Г or
// П room the left (Б) and the right (В) — at its distance from the corner. Every piece is built as it is on its own
// (its type's builder, its own size parameters, the room's materials and hardware), moved along its wall
// (transform.js, shiftBuilt) and put in the wall's run, so the cut list, the nesting, the drilling and the CNC files
// cover the whole room at once, and the plan and the elevation of each wall come from drawing-walls.js.
import { normalizeParams, typeText } from './types.js';
import { mark, shiftBuilt, worldBox } from './transform.js';
import { clamp, r1 } from './util.js';

// the types a room takes: carcass furniture that stands or hangs against a wall (a kitchen, a free carcass and a wall
// unit have walls or a grid of their own; a bed stands in the room)
export const ROOM_TYPES = ['wardrobe', 'chest', 'nightstand', 'bookcase', 'tv', 'desk', 'base', 'wall', 'tall', 'vanity', 'mirror'];
export const ROOM_SHAPES = ['line', 'left', 'right', 'u'];
export const ROOM_LIMITS = { items: 8, x: [0, 8000] };
const WALLS = { line: ['A'], left: ['A', 'B'], right: ['A', 'C'], u: ['A', 'B', 'C'] };
export const roomWalls = (shape) => WALLS[shape] ?? WALLS.line;
// a new room: a wardrobe and a chest of drawers on the back wall (our choice — a bedroom, the most common order)
export const DEFAULT_ITEMS = [
  { type: 'wardrobe', wall: 'A', x: 0, params: {} },
  { type: 'chest', wall: 'A', x: 2100, params: {} },
];

// The pieces of a saved room as the engine builds them: known types only, at most ROOM_LIMITS.items, on a wall the
// shape has (else the back wall), at a whole millimetre from the corner, each with its type's normalized parameters.
export function normalizeItems(input, shape) {
  const walls = roomWalls(shape);
  const list = Array.isArray(input) ? input : DEFAULT_ITEMS;
  return list
    .filter((it) => it && typeof it === 'object' && ROOM_TYPES.includes(it.type))
    .slice(0, ROOM_LIMITS.items)
    .map((it) => ({
      type: it.type,
      wall: walls.includes(it.wall) ? it.wall : 'A',
      x: Math.round(clamp(Number(it.x) || 0, ...ROOM_LIMITS.x)),
      params: normalizeParams(it.type, it.params && typeof it.params === 'object' ? it.params : {}),
    }));
}

// The width of a piece along its wall: its own width parameter (every room type has one).
const widthOf = (it) => it.params.width;

// Where each wall stands in the room (transform.js): the back wall along x from the left corner; the left wall turned
// a quarter, its run starting at the front of the room; the right wall at the far end of the back wall.
function runsOf(s) {
  const walls = roomWalls(s.shape);
  const depth = s.roomDepth;
  return walls.map((id) => ({
    id,
    ...{ A: { turn: 0, dx: 0, dz: 0 }, B: { turn: 1, dx: 0, dz: depth }, C: { turn: 3, dx: s.roomWidth, dz: 0 } }[id],
    length: id === 'A' ? s.roomWidth : depth,
  }));
}

export function buildRoom(ctx, s, BUILDERS) {
  const t = ctx.t;
  const runs = runsOf(s);
  const lengthOf = (wall) => runs.find((r) => r.id === wall).length;
  // one wall is a row as any other piece of furniture (front view and section); with side walls each wall is a run
  const walled = s.shape !== 'line';
  if (walled) for (const r of runs) ctx.runs.push({ ...r, name: t('wall.name', { wall: t(`wall.${r.id}`) }) });
  const built = [];
  s.items.forEach((it, i) => {
    const n = i + 1;
    const label = t('room.item', { n, type: typeText(it.type, t).label });
    const W = widthOf(it);
    const len = lengthOf(it.wall);
    // the distance from the corner, in the wall's own coordinates: the left wall's run starts at the front of the room
    const x0 = it.wall === 'B' ? len - it.x - W : it.x;
    if (it.x + W > len) ctx.warn('error', t('w.roomOutside', { item: label, wall: t(`wall.${it.wall}`), end: it.x + W, len }));
    const from = mark(ctx);
    const warnings = ctx.warnings.length;
    BUILDERS[it.type](ctx, { ...s, ...it.params, type: it.type });
    shiftBuilt(ctx, from, x0);
    for (const p of ctx.parts.slice(from.parts)) {
      if (walled) p.run = it.wall;
      p.module = p.module ? `${n}·${p.module}` : String(n);
    }
    if (walled) for (const k of ['groups', 'symbols']) for (const x of ctx[k].slice(from[k])) x.run = it.wall;
    // what the piece's own checks found, with its name in front
    for (const w of ctx.warnings.slice(warnings)) w.text = `${label}: ${w.text}`;
    built.push({ label, parts: ctx.parts.slice(from.parts), run: walled ? runs.find((r) => r.id === it.wall) : null });
  });
  // two pieces in each other's place (on one wall, or in a corner across two)
  const boxes = built.map((b) => {
    const world = b.parts.map((p) => worldBox(p.box, b.run));
    return { label: b.label, min: [0, 1, 2].map((i) => Math.min(...world.map((w) => w.min[i]))), max: [0, 1, 2].map((i) => Math.max(...world.map((w) => w.max[i]))) };
  });
  for (let a = 0; a < boxes.length; a++)
    for (let b = a + 1; b < boxes.length; b++) {
      const overlap = [0, 1, 2].every((i) => Math.min(boxes[a].max[i], boxes[b].max[i]) - Math.max(boxes[a].min[i], boxes[b].min[i]) > 0.5);
      if (overlap) ctx.warn('error', t('w.roomOverlap', { a: boxes[a].label, b: boxes[b].label }));
    }
}

// The overall size of a room: its walls, the tallest piece.
export function roomDims(s) {
  const H = Math.max(0, ...s.items.map((it) => {
    const p = it.params;
    return (p.height ?? 0) + (it.type === 'wall' || it.type === 'mirror' ? p.mount ?? 0 : 0);
  }));
  return { W: s.roomWidth, H: r1(H), D: s.shape === 'line' ? Math.max(0, ...s.items.map((it) => it.params.depth ?? 0)) : s.roomDepth };
}

