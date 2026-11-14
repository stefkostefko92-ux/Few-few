// The kitchen: base cabinets on legs under a worktop and the wall cabinets of the same width over them, along one wall
// (shape 'line') or along the back wall and a side wall — Г, with the side wall on the left ('left') or on the right
// ('right') — or both (П, 'u'). Every wall is a straight row in its own coordinates (x from its left end as one faces
// it) and model.runs puts it in the room (transform.js): the back wall А as it is, Б turned to stand on the left wall,
// В on the right one.
//
// Where two walls meet, the back wall ends in a blind corner cabinet (наш избор: any hinge and slide of the catalogue
// can make it; a carousel or a LeMans needs the maker's data). Its blind front stands behind the cabinets of the side
// wall and the corner gap beside them, its door after that, hinged away from the corner; the side wall starts the
// corner gap in front of the back wall's cabinets. The gap is the room two fronts with handles need: a door of the side
// wall hinged at the corner lies, opened, in front of the back wall's fronts and their handles, and the corner door
// swings out beside the fronts and handles of the side wall (tests/engine/kitchen-corner.test.mjs opens every door in
// the room, as far as the hinges go). Past 90° a door hinged at the corner would swing back onto the back wall's
// fronts, so the base module of a side wall next to the corner has drawers (наш избор). The wall cabinets do the same
// over the base cabinets, door over door. The corner cabinets have no shelf: over 1 m wide, a shelf of 18 mm board sags
// past 0,5 % of its span under the kitchen load (model.js).
import { buildCarcass } from './carcass.js';
import { STOCK, frontStock } from './materials.js';
import { FRONT_GAP_Z } from './joinery.js';
import { handleModel } from './hardware.js';

export const CORNER_DOOR = 450; // the door of a blind corner cabinet (наш избор)
export const SHAPES = ['line', 'left', 'right', 'u'];
const MIN_CORNER_GAP = 50; // наш избор
const GAP_MARGIN = 5; // наш избор
const HANDLE_PROJECTION = 32; // a catalogue handle without its height: as the 3D draws it (viewer-handles.js)
const FLAT_HANDLES = new Set(['recessed', 'gola']); // nothing stands out of the front
const LEGS = 100;
const WALL_DEPTH = 320;
const WORKTOP_T = 38;
const WORKTOP_OVERHANG = 20; // past the closed fronts: 20–29 mm, in whole centimetres
// The longest worktop in one piece: EGGER's 38 mm worktops are 4100 × 600 mm (EGGER EDC24 Worktops Collection
// brochure, the formats table); a longer wall needs one more joint.
const WORKTOP_STOCK = 4100;
const SIDE_WALLS = { line: [], left: ['B'], right: ['C'], u: ['B', 'C'] };
const WALLS = { A: 'А', B: 'Б, лява', C: 'В, дясна' };

// Kitchen modules from the left: every third one from the second has the drawers and its own width, the others doors.
export const kitchenModules = (s, n = s.modules) =>
  Array.from({ length: n }, (_, i) => (i % 3 === 1 ? { drawers: true, width: s.drawerModuleWidth } : { drawers: false, width: s.moduleWidth }));

// The kitchen worktop reaches 20–29 mm past the closed fronts (carcass, 1 mm gap, front), in whole centimetres.
export function worktopDepth(s) {
  return Math.ceil((s.depth + FRONT_GAP_Z + STOCK[frontStock(s).stock].thickness + WORKTOP_OVERHANG) / 10) * 10;
}

// The corner gap: a door of the side wall opened at the corner lies in front of the back wall's fronts — its own
// thickness, the 1 mm front gap, the back wall's front and its handle, and a margin — in whole centimetres, at least
// 50 mm. The handle stands out by its catalogue height.
const handleProjection = (s) => {
  const h = handleModel(s.handle);
  return !h || FLAT_HANDLES.has(h.type) ? 0 : h.height ?? HANDLE_PROJECTION;
};
const frontT = (s) => STOCK[frontStock(s).stock].thickness;
export function cornerGap(s) {
  return Math.max(MIN_CORNER_GAP, Math.ceil((FRONT_GAP_Z + 2 * frontT(s) + handleProjection(s) + GAP_MARGIN) / 10) * 10);
}
// How far a handle may stand out of its front with this corner gap (the drawing's notes say it).
export const cornerHandleRoom = (s) => cornerGap(s) - FRONT_GAP_Z - 2 * frontT(s) - GAP_MARGIN;

// The modules of a side wall counted from the corner: drawers next to it, then the rule of kitchenModules.
const sideModules = (s, n) =>
  Array.from({ length: n }, (_, i) => (i % 3 === 0 ? { drawers: true, width: s.drawerModuleWidth } : { drawers: false, width: s.moduleWidth }));

// The walls with their modules from the left; the back wall with a blind corner cabinet at each corner it shares.
export function kitchenWalls(s) {
  const sides = SIDE_WALLS[s.shape] ?? [];
  const corner = (side) => ({ blind: side, width: s.depth + cornerGap(s) + CORNER_DOOR });
  const walls = [{ id: 'A', modules: [...(sides.includes('B') ? [corner('left')] : []), ...kitchenModules(s), ...(sides.includes('C') ? [corner('right')] : [])] }];
  // from the left as one faces the wall: the left wall ends at the corner, the right one starts there
  if (sides.includes('B')) walls.push({ id: 'B', modules: sideModules(s, s.modulesLeft).reverse() });
  if (sides.includes('C')) walls.push({ id: 'C', modules: sideModules(s, s.modulesRight) });
  return walls.map((w) => ({ ...w, length: w.modules.reduce((a, m) => a + m.width, 0) }));
}

// The overall size: the back wall, the floor to the top of the wall cabinets, and the worktop's depth — or how far the
// longest side wall reaches into the room.
export function kitchenDims(s) {
  const [back, ...sides] = kitchenWalls(s);
  const reach = sides.length ? s.depth + cornerGap(s) + Math.max(...sides.map((w) => w.length)) : 0;
  return { W: back.length, H: s.mount + s.wallHeight, D: Math.max(worktopDepth(s), reach) };
}

export function baseCabinet(ctx, s, c, at = {}, column = {}) {
  const fronts = s.fronts;
  const col = { shelves: fronts === 'drawers' ? 0 : s.shelves, doors: fronts === 'drawers' ? 0 : s.doors };
  if (fronts === 'drawers') Object.assign(col, { drawers: s.drawers, drawerZone: s.height - s.legs });
  // a base cabinet with a drawer and a door: the drawer at the top, under the worktop
  if (fronts === 'mixed') Object.assign(col, { drawers: 1, drawerZone: 180, drawersOnTop: true });
  return buildCarcass(ctx, { ...c, ...at, W: s.width, H: s.height, D: s.depth, plinth: { type: s.legs ? 'legs' : 'none', h: s.legs }, top: 'rails', columns: [{ ...col, ...column }] });
}

export function wallCabinet(ctx, s, c, at = {}, column = {}) {
  return buildCarcass(ctx, { ...c, kind: 'wall', ...at, W: s.width, H: s.height, D: s.depth, y0: at.y0 ?? s.mount, plinth: { type: 'none', h: 0 }, top: 'between', mount: 'wall', columns: [{ shelves: s.shelves, doors: s.doors, ...column }] });
}

// One wall, its modules from the left: each base cabinet with the wall cabinet of the same width over it, numbered
// from n. A corner module is a blind corner cabinet, its blind front on the corner's side, its door hinged away from it.
function buildWall(ctx, s, c, wall, n) {
  let x0 = 0;
  wall.modules.forEach((m, i) => {
    const at = { module: `М${n + i}`, x0 };
    const up = { module: `Г${n + i}`, x0, y0: s.mount };
    if (m.blind) {
      const column = { blind: { side: m.blind, width: s.depth + cornerGap(s) }, hingeSide: m.blind === 'left' ? 'right' : 'left' };
      baseCabinet(ctx, { ...s, width: m.width, legs: LEGS, fronts: 'doors', doors: 1, shelves: 0 }, c, at, column);
      wallCabinet(ctx, { ...s, width: m.width, height: s.wallHeight, depth: WALL_DEPTH, doors: 1, shelves: 0 }, c, up, column);
    } else {
      const doors = m.width > 500 ? 2 : 1;
      baseCabinet(ctx, { ...s, width: m.width, legs: LEGS, fronts: m.drawers ? 'drawers' : 'doors', doors, drawers: 3, shelves: 1 }, c, at);
      wallCabinet(ctx, { ...s, width: m.width, height: s.wallHeight, depth: WALL_DEPTH, doors, shelves: 2 }, c, up);
    }
    x0 += m.width;
  });
}

// Everything built by `build` belongs to the run `id`.
function inRun(ctx, id, build) {
  const from = ['parts', 'groups', 'symbols'].map((k) => ctx[k].length);
  build();
  ['parts', 'groups', 'symbols'].forEach((k, i) => {
    for (const x of ctx[k].slice(from[i])) x.run = id;
  });
}

export function buildKitchen(ctx, s, c) {
  const walls = kitchenWalls(s);
  const wd = worktopDepth(s);
  if (walls.length === 1) {
    const [{ length }] = walls;
    buildWall(ctx, s, c, walls[0], 1);
    ctx.hw('worktop', { name: `Работен плот ${WORKTOP_T} mm, ${length} × ${wd} mm (поръчка)`, qty: 1, unit: 'бр.', group: 'Покупни' });
    ctx.symbols.push({ type: 'worktop', x0: 0, x1: length, y: s.height, z0: 0, z1: wd, t: WORKTOP_T });
    longWorktop(ctx, length, '');
    return;
  }
  // the side walls start the corner gap in front of the back wall's base cabinets; the worktop of the back wall runs
  // over the corners and the side walls' pieces butt against its front edge
  const start = s.depth + cornerGap(s);
  const back = walls[0].length;
  let n = 1;
  for (const wall of walls) {
    const run = {
      A: { turn: 0, dx: 0, dz: 0 },
      B: { turn: 1, dx: 0, dz: start + wall.length },
      C: { turn: 3, dx: back, dz: start },
    }[wall.id];
    ctx.runs.push({ id: wall.id, name: `Стена ${WALLS[wall.id]}`, ...run, length: wall.length });
    // the worktop of a side wall in its own coordinates: from its open end to the back wall's worktop
    const [x0, x1] = { A: [0, wall.length], B: [0, start + wall.length - wd], C: [wd - start, wall.length] }[wall.id];
    inRun(ctx, wall.id, () => {
      buildWall(ctx, s, c, wall, n);
      ctx.symbols.push({ type: 'worktop', x0, x1, y: s.height, z0: 0, z1: wd, t: WORKTOP_T });
    });
    ctx.hw(wall.id === 'A' ? 'worktop' : `worktop:${wall.id}`, { name: `Работен плот ${WORKTOP_T} mm, ${x1 - x0} × ${wd} mm (поръчка) — стена ${WALLS[wall.id]}`, qty: 1, unit: 'бр.', group: 'Покупни' });
    longWorktop(ctx, x1 - x0, ` на стена ${WALLS[wall.id]}`);
    n += wall.modules.length;
  }
  ctx.hw('worktopBolts', { name: 'Болт за плот (връзка в ъгъла, гнездата се фрезоват по шаблон)', qty: 2 * (walls.length - 1), unit: 'бр.', group: 'Крепежи' });
}

// A worktop longer than the longest one in one piece: one more joint with bolts, said as a note.
function longWorktop(ctx, length, where) {
  if (length > WORKTOP_STOCK)
    ctx.warn('info', `Плотът${where} е ${length} mm — по-дълъг от ${WORKTOP_STOCK} mm на стандартния плот: предвидете още една фуга с болтове.`);
}
