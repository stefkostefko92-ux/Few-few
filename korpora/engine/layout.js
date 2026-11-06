// The grid of a free carcass („Свободен корпус“; spec.grid — the wardrobe already has a `layout` parameter): columns left to right, each split into cells bottom to top, a fixed
// shelf between two cells, and the fronts over the cells. normalizeLayout keeps it bounded and in whole millimetres (the
// spec stores what the customer asked for, „авто“ included); resolveSizes turns it into exact widths and heights when
// the model is built; templateLayout turns a template with one carcass into a free one (the „Персонализирай“ button).
import { STOCK } from './materials.js';
import { HINGE_LIMITS } from './hardware.js';
import { clamp } from './util.js';

const T = STOCK.pb18.thickness;

// Wider carcasses are split into several at a column (transport; tops and bottoms fit the sheet) — as the wardrobe.
export const MAX_CARCASS_W = 2400;

// Hard bounds of the layout (наш избор): what the editor offers and the server accepts. The physical limits — the sheet,
// the slides, the hinges, the sag — stay the model's warnings and CNC blockers.
export const LAYOUT_LIMITS = Object.freeze({
  columns: 12,
  cells: 8,
  fronts: 8,
  shelves: 10,
  drawers: 8,
  minColumn: 150,
  maxColumn: MAX_CARCASS_W - 2 * T,
  minCell: 100,
  maxCell: 2600,
});

export const FILLS = ['open', 'shelves', 'drawers', 'rail'];
export const FRONT_KINDS = ['door', 'doors2'];
const HINGES = ['left', 'right'];

// What a new free carcass shows: a drawer column with shelves behind a door, and a hanging column behind a door.
export const DEFAULT_LAYOUT = Object.freeze({
  columns: [
    { w: null, cells: [{ h: 540, fill: 'drawers', n: 3 }, { h: null, fill: 'shelves', n: 3 }], fronts: [{ from: 1, to: 1, kind: 'door', hinge: 'left' }] },
    { w: null, cells: [{ h: null, fill: 'rail', n: 0 }], fronts: [{ from: 0, to: 0, kind: 'door', hinge: 'right' }] },
  ],
});

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const mm = (v, min, max) => (v === null || v === undefined || v === '' ? null : clamp(Math.round(Number(v)) || min, min, max));
const int = (v, min, max) => clamp(Math.round(Number(v)) || 0, min, max);
const copy = (layout) => ({ columns: layout.columns.map((c) => ({ w: c.w, cells: c.cells.map((x) => ({ ...x })), fronts: c.fronts.map((f) => ({ ...f })) })) });

function normalizeCell(raw) {
  const x = isObj(raw) ? raw : {};
  const fill = FILLS.includes(x.fill) ? x.fill : 'open';
  const n = fill === 'shelves' ? int(x.n, 0, LAYOUT_LIMITS.shelves) : fill === 'drawers' ? int(x.n, 1, LAYOUT_LIMITS.drawers) : 0;
  return { h: mm(x.h, LAYOUT_LIMITS.minCell, LAYOUT_LIMITS.maxCell), fill, n };
}

// Fronts over the cells: in range, no two over one cell, none over a drawer cell (drawers have their own fronts).
function normalizeFronts(raw, cells) {
  const taken = new Set();
  const out = [];
  for (const f of (Array.isArray(raw) ? raw : []).slice(0, LAYOUT_LIMITS.fronts)) {
    if (!isObj(f) || !FRONT_KINDS.includes(f.kind)) continue;
    const from = Math.round(Number(f.from));
    const to = Math.round(Number(f.to));
    if (!Number.isInteger(from) || !Number.isInteger(to) || from < 0 || to < from || to >= cells.length) continue;
    const span = Array.from({ length: to - from + 1 }, (_, k) => from + k);
    if (span.some((k) => taken.has(k) || cells[k].fill === 'drawers')) continue;
    for (const k of span) taken.add(k);
    out.push({ from, to, kind: f.kind, hinge: f.kind === 'door' && HINGES.includes(f.hinge) ? f.hinge : null });
  }
  return out.sort((a, b) => a.from - b.from);
}

function normalizeColumn(raw) {
  const c = isObj(raw) ? raw : {};
  const list = Array.isArray(c.cells) ? c.cells.slice(0, LAYOUT_LIMITS.cells) : [];
  const cells = list.length ? list.map(normalizeCell) : [normalizeCell({})];
  return { w: mm(c.w, LAYOUT_LIMITS.minColumn, LAYOUT_LIMITS.maxColumn), cells, fronts: normalizeFronts(c.fronts, cells) };
}

export function normalizeLayout(raw) {
  if (!isObj(raw) || !Array.isArray(raw.columns) || !raw.columns.length) return copy(DEFAULT_LAYOUT);
  return { columns: raw.columns.slice(0, LAYOUT_LIMITS.columns).map(normalizeColumn) };
}

// Sizes along one direction: the ones asked for, the rest shared by the „авто“ ones; what does not fit is shared in
// proportion — the „авто“ ones counted at the minimum — and none goes under the minimum: what would, keeps it, and the
// others share the rest. `over` is true when the asked sizes had to change (the caller warns). The caller makes sure
// that avail holds every size at the minimum (fitCount).
export function resolveSizes(asked, avail, min) {
  const fixed = asked.reduce((a, v) => a + (v ?? 0), 0);
  const autos = asked.filter((v) => v === null).length;
  if (autos && avail - fixed >= autos * min) {
    const each = (avail - fixed) / autos;
    return { sizes: asked.map((v) => v ?? each), over: false };
  }
  const want = asked.map((v) => v ?? min);
  const total = want.reduce((a, v) => a + v, 0);
  const over = Math.abs(total - avail) > 0.5;
  if (total <= avail) return { sizes: want.map((v) => (v * avail) / total), over };
  const floor = new Set();
  for (;;) {
    const room = avail - floor.size * min;
    const rest = want.reduce((a, v, i) => a + (floor.has(i) ? 0 : v), 0);
    const low = want.flatMap((v, i) => (!floor.has(i) && (v * room) / rest < min ? [i] : []));
    if (!low.length || floor.size + low.length === want.length) return { sizes: want.map((v, i) => (floor.has(i) ? min : (v * room) / rest)), over };
    for (const i of low) floor.add(i);
  }
}

// How many of n sizes (columns or cells, in order) fit at the minimum: room(k) is the space k of them get.
export function fitCount(n, room, min) {
  let k = n;
  while (k > 1 && room(k) < k * min) k -= 1;
  return k;
}

// Columns into as few carcasses as fit MAX_CARCASS_W, split only between columns and as evenly as can be (the widest
// carcass as narrow as possible) — 6 equal columns become 3 + 3, not 4 + 2. [[column indexes], …].
export function splitCarcasses(widths) {
  const outer = (a, b) => widths.slice(a, b).reduce((s, w) => s + w + T, T);
  let m = 1;
  for (let start = 0, i = 0; i < widths.length; i++) {
    if (i > start && outer(start, i + 1) > MAX_CARCASS_W) {
      m += 1;
      start = i;
    }
  }
  // every way to cut n columns into m runs (n ≤ 12, m ≤ 3 at the widths the form allows: a few dozen at most)
  let best = null;
  const cuts = (from, left, acc) => {
    if (left === 1) {
      const runs = [...acc, [from, widths.length]];
      const widest = Math.max(...runs.map(([a, b]) => outer(a, b)));
      if (!best || widest < best.widest - 0.01) best = { widest, runs };
      return;
    }
    for (let k = from + 1; k <= widths.length - left + 1; k++) cuts(k, left - 1, [...acc, [from, k]]);
  };
  cuts(0, m, []);
  return best.runs.map(([a, b]) => Array.from({ length: b - a }, (_, k) => a + k));
}

// ─── templates → free carcass (the „Персонализирай“ button) ──────────────────────────────────────────────────────────

export const CONVERTIBLE = ['base', 'wall', 'tall', 'wardrobe', 'chest', 'nightstand', 'bookcase', 'tv'];

const DOOR_OVERHANG = 24; // as types.js: a door is about 24 mm wider than the inner width of its column
const door = (hinge = null) => ({ kind: 'door', hinge });
const doors = (n, hinge = null) => (n === 2 ? { kind: 'doors2', hinge: null } : door(hinge));
const front = (from, to, f) => ({ from, to, ...f });
const cell = (fill, n = 0, h = null) => ({ h, fill, n });

// The outer sizes and the columns of a one-carcass template as a free carcass. The fixed shelf between two cells is
// the free carcass's own (sturdier, and what a cell needs), so the result is a starting point with the same outside,
// columns, fills and fronts — not the same parts.
export function templateLayout(type, s) {
  const keep = Object.fromEntries(Object.entries(s).filter(([k]) => !['v', 'type', 'layout'].includes(k)));
  const base = { ...keep, type: 'custom', placement: 'floor', plinth: 'legs', legs: s.legs ?? 0, top: 'between', width: s.width, height: s.height, depth: s.depth };
  const columns = templateColumns(type, s);
  const out = { ...base, ...columns.outer, grid: { columns: columns.list } };
  for (const k of Object.keys(out)) if (out[k] === undefined) delete out[k];
  return out;
}

function templateColumns(type, s) {
  const innerH = (legs) => s.height - legs - 2 * T;
  switch (type) {
    case 'base': {
      const list = [{ w: null, cells: [], fronts: [] }];
      const c = list[0];
      if (s.fronts === 'drawers') c.cells = [cell('drawers', s.drawers)];
      else if (s.fronts === 'mixed') {
        c.cells = [cell('shelves', s.shelves), cell('drawers', 1, 180 - T)];
        c.fronts = [front(0, 0, doors(s.doors))];
      } else {
        c.cells = [cell('shelves', s.shelves)];
        c.fronts = [front(0, 0, doors(s.doors))];
      }
      return { outer: { top: 'rails' }, list };
    }
    case 'wall':
      return { outer: { placement: 'wall', mount: s.mount, legs: 0 }, list: [{ w: null, cells: [cell('shelves', s.shelves)], fronts: [front(0, 0, doors(s.doors))] }] };
    case 'tall': {
      const cells = s.drawers ? [cell('drawers', s.drawers, s.drawers * 180 - T), cell('shelves', s.shelves)] : [cell('shelves', s.shelves)];
      return { outer: {}, list: [{ w: null, cells, fronts: [front(cells.length - 1, cells.length - 1, doors(s.doors))] }] };
    }
    case 'wardrobe': {
      const n = s.columns;
      const inner = (s.width - (n + 1) * T) / n;
      const leaves = s.doorsPerColumn || (inner + DOOR_OVERHANG > HINGE_LIMITS.maxWidth ? 2 : 1);
      const list = Array.from({ length: n }, (_, i) => {
        const kind = s.layout === 'hanging' ? 0 : s.layout === 'shelves' ? 1 : i % 3;
        if (kind === 0) return { w: null, cells: [cell('rail')], fronts: [front(0, 0, doors(leaves))] };
        if (kind === 1) return { w: null, cells: [cell('shelves', 5)], fronts: [front(0, 0, doors(leaves))] };
        return { w: null, cells: [cell('drawers', 3, 3 * 190 - T), cell('rail')], fronts: [front(1, 1, doors(leaves))] };
      });
      return { outer: { plinth: 'panel' }, list };
    }
    case 'chest':
      return { outer: { top: 'over' }, list: Array.from({ length: s.columns }, () => ({ w: null, cells: [cell('drawers', s.drawers)], fronts: [] })) };
    case 'nightstand':
      return { outer: { top: 'over' }, list: [{ w: null, cells: [cell('drawers', s.drawers)], fronts: [] }] };
    case 'bookcase': {
      const zone = s.doorZone > 0 && innerH(s.legs) - s.doorZone >= 350 ? s.doorZone - T : 0;
      const list = Array.from({ length: s.columns }, (_, i) => (zone
        ? { w: null, cells: [cell('shelves', 1, zone), cell('shelves', s.shelves)], fronts: [front(0, 0, door(i % 2 === 0 ? 'left' : 'right'))] }
        : { w: null, cells: [cell('shelves', s.shelves)], fronts: [] }));
      return { outer: {}, list };
    }
    case 'tv': {
      const list = Array.from({ length: s.columns }, (_, i) => {
        const outer = i === 0 || i === s.columns - 1;
        if (!outer) return { w: null, cells: [cell('shelves', 1)], fronts: [] };
        if (s.tvFronts === 'drawers') return { w: null, cells: [cell('drawers', 2)], fronts: [] };
        return { w: null, cells: [cell('shelves', 1)], fronts: [front(0, 0, door(i === 0 ? 'left' : 'right'))] };
      });
      return { outer: { top: 'over' }, list };
    }
    default:
      throw new Error(`templateLayout: ${type} is not a one-carcass template`);
  }
}
