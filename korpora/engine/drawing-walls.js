// The assembly sheet of a Г or П kitchen (kitchen.js): the plan of the room — the walls with their names and lengths,
// the base cabinets and their fronts, the worktop over them, the wall cabinets dashed and the swing of every base door,
// which shows the corners clear — and the front view of every wall in its own coordinates (transform.js), drawn as the
// sheet of a straight kitchen draws it (drawing-front.js), the modules named under (over) them and their widths in the
// chain where they fit. One scale for all, the largest of the ISO series that fits: the plan and wall А side by side,
// the side walls under them; the notes and the title block as on every assembly sheet.
import { SCALES, dimH, dimV, frame, svgDoc, fmt } from './drawing-kit.js';
import { dimsText } from './types.js';
import { drawingSheets } from './drawing-part.js';
import { frontView, extents, moduleRanges, FRONTS } from './drawing-front.js';
import { notes, materialLine } from './drawing-notes.js';
import { worldParts, worldBox, turnPoint, runOf } from './transform.js';
import { esc } from './util.js';

// Sheet mm. The views between x and right, from y (the plan's top; its length dimension over it) down to bottom (over
// the notes); under a wall's view its module names, chain, overall width and name, over it the wall cabinets' chain.
const AREA = { x: 46, y: 32, right: 402, bottom: 244 }; // the notes of a Г or П kitchen may start at 249,6
const GAP_X = 30; // between two views of a row: the height dimension of the right one
const UNDER = 31;
const OVER = 12;
const CHAR = 1.75; // the width of a digit of the dimension text (2,9 px JetBrains Mono)
const ROOM_WALL = 150; // the walls of the room in the plan: a hatched band this thick (model mm)
const TITLES = { left: 'Г-образна кухня', right: 'Г-образна кухня', u: 'П-образна кухня' };
const LETTERS = { A: 'А', B: 'Б', C: 'В' };
const ROLE_OUT = new Set([...FRONTS, 'back']);

const r2 = (v) => Math.round(v * 100) / 100;

export function drawingWalls(model, meta) {
  const { spec, runs } = model;
  const walls = runs.map((run) => {
    const parts = model.parts.filter((p) => p.run === run.id);
    const symbols = model.symbols.filter((s) => s.run === run.id);
    return { run, parts, symbols, ext: extents(parts, symbols) };
  });
  const world = worldParts(model);
  const tops = model.symbols.filter((s) => s.type === 'worktop').map((s) => ({ run: s.run, box: worldBox({ min: [s.x0, s.y, s.z0], max: [s.x1, s.y + s.t, s.z1] }, runOf(model, s.run)) }));
  const all = [...world, ...tops];
  const room = { W: Math.max(...all.map((p) => p.box.max[0])), D: Math.max(...all.map((p) => p.box.max[2])) };
  const H = Math.max(...walls.map((w) => w.ext.y1));
  const [back, ...sides] = walls;
  const width = (w) => w.ext.x1 - w.ext.x0;
  const row1 = Math.max(room.D, H);
  const fits = (s) =>
    (room.W + width(back)) / s + GAP_X <= AREA.right - AREA.x &&
    sides.reduce((a, w) => a + width(w), 0) / s + GAP_X * (sides.length - 1) <= AREA.right - AREA.x &&
    (row1 + H) / s + 2 * UNDER + OVER <= AREA.bottom - AREA.y;
  const scale = SCALES.find(fits) ?? SCALES.at(-1);
  const k = 1 / scale;
  let g = plan(model, all, room, { x: AREA.x, y: AREA.y, k });
  const ground1 = AREA.y + row1 * k;
  g += elevation(back, { x: AREA.x + room.W * k + GAP_X, ground: ground1, k, height: true });
  let x = AREA.x;
  const ground2 = ground1 + UNDER + OVER + H * k;
  for (const w of sides) {
    g += elevation(w, { x, ground: ground2, k, height: false });
    x += width(w) * k + GAP_X;
  }
  g += notes(model);
  const title = TITLES[spec.shape] ?? 'Кухня';
  return svgDoc(g + frame(`${title} ${dimsText(spec.type, spec)}`, meta, scale, 1, drawingSheets(model).count, materialLine(model.parts)), `Сглобен чертеж: ${title}`, 'assembly');
}

// The room from above, the back wall at the top: x to the right, z (into the room) down.
// all: the parts and the worktop pieces in the room, each with its run and box.
function plan(model, all, room, { x: px, y: py, k }) {
  const world = all.filter((p) => p.id);
  const tops = all.filter((p) => !p.id);
  const X = (x) => r2(px + x * k);
  const Y = (z) => r2(py + z * k);
  const rect = (cls, b, extra = '') => `<rect class="${cls}" x="${X(b.min[0])}" y="${Y(b.min[2])}" width="${r2((b.max[0] - b.min[0]) * k)}" height="${r2((b.max[2] - b.min[2]) * k)}"${extra}/>`;
  const modules = new Map();
  for (const p of world) {
    if (!p.module || ROLE_OUT.has(p.role)) continue;
    const b = modules.get(p.module) ?? { min: [...p.box.min], max: [...p.box.max] };
    for (let i = 0; i < 3; i++) {
      b.min[i] = Math.min(b.min[i], p.box.min[i]);
      b.max[i] = Math.max(b.max[i], p.box.max[i]);
    }
    modules.set(p.module, b);
  }
  const base = (name) => name.startsWith('М');
  let g = '';
  for (const [name, b] of modules) if (base(name)) g += rect('d-vis', b);
  for (const p of world) if (FRONTS.has(p.role) && base(p.module)) g += rect('d-front', p.box);
  for (const t of tops) g += rect('d-out', t.box);
  for (const [name, b] of modules) if (!base(name)) g += rect('d-hid', b);
  // the swing of every base door: its free edge from closed to 90° dotted, the door opened solid
  const byId = new Map(model.parts.map((p) => [p.id, p]));
  for (const d of model.groups.filter((gr) => gr.type === 'door')) {
    const door = byId.get(d.id);
    if (!base(door.module)) continue;
    const run = runOf(model, door.run);
    const free = d.hinge === 'left' ? door.box.max[0] : door.box.min[0];
    const radius = Math.abs(free - d.axisX);
    const sign = d.hinge === 'left' ? 1 : -1;
    const at = (deg) => {
      const a = (deg * Math.PI) / 180;
      const [wx, , wz] = turnPoint([d.axisX + sign * radius * Math.cos(a), 0, d.axisZ + radius * Math.sin(a)], run);
      return `${X(wx)},${Y(wz)}`;
    };
    const [hx, , hz] = turnPoint([d.axisX, 0, d.axisZ], run);
    g += `<polyline class="d-swing" points="${[0, 15, 30, 45, 60, 75, 90].map(at).join(' ')}"/><polyline class="d-leaf" points="${X(hx)},${Y(hz)} ${at(90)}"/>`;
  }
  // the walls of the room as hatched bands, their letters outside them, the back wall's length over it; beside each
  // side wall the corner gap and the length of its cabinets, as its own view gives it
  const runs = new Map(model.runs.map((r) => [r.id, r]));
  const band = (x0, z0, x1, z1) => `<rect class="d-wall" fill="url(#HATCH)" x="${X(x0)}" y="${Y(z0)}" width="${r2((x1 - x0) * k)}" height="${r2((z1 - z0) * k)}"/>`;
  const wl = runs.has('B') ? -ROOM_WALL : 0;
  const wr = runs.has('C') ? room.W + ROOM_WALL : room.W;
  g += band(wl, -ROOM_WALL, wr, 0);
  g += `<text class="d-vt" x="${X(room.W / 2)}" y="${r2(Y(-ROOM_WALL) - 2)}" text-anchor="middle">${LETTERS.A}</text>`;
  g += dimH(X(0), X(room.W), r2(Y(-ROOM_WALL) - 8), fmt(room.W), { ext: [[X(0), Y(0)], [X(room.W), Y(0)]] });
  for (const [side, wx, out] of [['B', 0, -1], ['C', room.W, 1]]) {
    const run = runs.get(side);
    if (!run) continue;
    const z1 = Math.max(...all.filter((p) => p.run === side).map((p) => p.box.max[2]));
    const z0 = z1 - run.length;
    g += out < 0 ? band(-ROOM_WALL, 0, 0, z1) : band(room.W, 0, room.W + ROOM_WALL, z1);
    const xo = wx + out * ROOM_WALL;
    g += `<text class="d-vt" x="${r2(X(xo) + out * 3)}" y="${Y(z1 / 2)}" text-anchor="${out < 0 ? 'end' : 'start'}">${LETTERS[side]}</text>`;
    const dx = r2(X(xo) + out * 9);
    g += dimV(Y(0), Y(z0), dx, fmt(z0), { ext: [[X(wx), Y(z0)]] });
    g += dimV(Y(z0), Y(z1), dx, fmt(run.length), { ext: [[X(wx), Y(z1)]] });
  }
  const yt = r2(Y(room.D) + 8);
  g += `<text class="d-vt" x="${X(room.W / 2)}" y="${yt}" text-anchor="middle">План</text>`;
  // what the two broken lines mean
  const lx = X(0);
  g += `<line class="d-hid" x1="${lx}" y1="${r2(yt + 4)}" x2="${r2(lx + 8)}" y2="${r2(yt + 4)}"/><text class="d-small" x="${r2(lx + 10)}" y="${r2(yt + 4.8)}">горни шкафове</text>`;
  g += `<line class="d-swing" x1="${r2(lx + 42)}" y1="${r2(yt + 4)}" x2="${r2(lx + 50)}" y2="${r2(yt + 4)}"/><text class="d-small" x="${r2(lx + 52)}" y="${r2(yt + 4.8)}">отваряне на вратите</text>`;
  return g;
}

// One wall from the front, in its own coordinates, standing on `ground`: the modules' names and widths under it (the
// wall cabinets' over it), the overall width, and the height on the left of the back wall's view.
function elevation({ run, parts, symbols, ext }, { x: ex, ground, k, height }) {
  const X = (x) => r2(ex + (x - ext.x0) * k);
  const Y = (y) => r2(ground - y * k);
  let g = frontView(parts, symbols, X, Y, k);
  g += `<line class="d-gnd" x1="${X(ext.x0) - 6}" y1="${Y(0)}" x2="${X(ext.x1) + 6}" y2="${Y(0)}"/>`;
  // the length of the wall's cabinets (the worktop of a side wall reaches past them to the back wall's)
  const cab = extents(parts, []);
  g += dimH(X(cab.x0), X(cab.x1), Y(0) + 20, fmt(cab.x1 - cab.x0), { ext: [[X(cab.x0), Y(0)], [X(cab.x1), Y(0)]] });
  if (height) g += dimV(Y(0), Y(ext.y1), X(ext.x0) - 10, fmt(ext.y1), { ext: [[X(ext.x0), Y(ext.y1)], [X(ext.x0), Y(0)]] });
  for (const m of moduleRanges(parts)) {
    const w = fmt(m.x1 - m.x0);
    const label = w.length * CHAR <= (m.x1 - m.x0) * k - 2.5 ? w : '';
    const xc = X((m.x0 + m.x1) / 2);
    if (m.row) {
      g += dimH(X(m.x0), X(m.x1), Y(ext.y1) - 9, label, { ext: [[X(m.x0), Y(m.y1)], [X(m.x1), Y(m.y1)]] });
      g += `<text class="d-mod" x="${xc}" y="${r2(Y(m.y1) - 2)}" text-anchor="middle">${esc(m.name)}</text>`;
    } else {
      g += dimH(X(m.x0), X(m.x1), Y(0) + 12, label, { ext: [[X(m.x0), Y(m.y0)], [X(m.x1), Y(m.y0)]] });
      g += `<text class="d-mod" x="${xc}" y="${r2(Y(0) + 5.8)}" text-anchor="middle">${esc(m.name)}</text>`;
    }
  }
  g += `<text class="d-vt" x="${X((ext.x0 + ext.x1) / 2)}" y="${Y(0) + 29}" text-anchor="middle">${esc(run.name)} — изглед</text>`;
  return g;
}
