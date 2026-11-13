// The constructor's edits of a free carcass's grid (layout.js): each takes a grid and returns a new one, normalized,
// leaving the given one as it was (the editor keeps it for undo); an edit that cannot be made returns the same grid.
// Indexes are the grid's: columns left to right, cells bottom to top. Where an edit turns „авто“ into millimetres it
// takes the sizes the engine resolved (model.cells), so nothing moves but what was edited.
import { normalizeLayout, LAYOUT_LIMITS } from './layout.js';
import { STOCK } from './materials.js';
import { clamp } from './util.js';

const T = STOCK.pb18.thickness;
const copy = (grid) => JSON.parse(JSON.stringify(grid));
const COUNT = { shelves: 3, drawers: 3 }; // what a cell gets when it is given shelves or drawers (наш избор)

// A new column: three shelves, no front (the customer adds what the column needs).
export const NEW_COLUMN = Object.freeze({ w: null, cells: [{ h: null, fill: 'shelves', n: COUNT.shelves }], fronts: [] });

function edit(grid, fn) {
  const g = copy(grid);
  return fn(g) === false ? grid : normalizeLayout(g);
}

export const addColumn = (grid, at) => edit(grid, (g) => {
  if (g.columns.length >= LAYOUT_LIMITS.columns) return false;
  g.columns.splice(clamp(at, 0, g.columns.length), 0, copy(NEW_COLUMN));
});

export const removeColumn = (grid, c) => edit(grid, (g) => {
  if (g.columns.length <= 1 || !g.columns[c]) return false;
  g.columns.splice(c, 1);
});

// null: „авто“
export const setWidth = (grid, c, w) => edit(grid, (g) => {
  g.columns[c].w = w;
});

export const setHeight = (grid, c, k, h) => edit(grid, (g) => {
  g.columns[c].cells[k].h = h;
});

// Another fill keeps the count of the same fill, and gets its default count otherwise; a front over a cell that
// gets drawers is dropped by normalizeLayout (the drawers have their own fronts).
export const setFill = (grid, c, k, fill, n) => edit(grid, (g) => {
  const cell = g.columns[c].cells[k];
  cell.n = n ?? (cell.fill === fill ? cell.n : COUNT[fill] ?? 0);
  cell.fill = fill;
});

export const setCount = (grid, c, k, n) => edit(grid, (g) => {
  g.columns[c].cells[k].n = n;
});

// The cell into two, a fixed shelf between: an asked height is halved, an auto cell gives two auto cells; the count
// is shared (the upper one gets the smaller half); a front over the cell covers both, the cells above move up.
// `size`: the cell's clear height as built — too low for two cells of the minimum, nothing is split.
export const splitCell = (grid, c, k, size) => edit(grid, (g) => {
  const col = g.columns[c];
  if (col.cells.length >= LAYOUT_LIMITS.cells || size < 2 * LAYOUT_LIMITS.minCell + T) return false;
  const cell = col.cells[k];
  const h = cell.h === null ? null : Math.round((cell.h - T) / 2);
  const up = cell.fill === 'shelves' || cell.fill === 'drawers' ? Math.floor(cell.n / 2) : 0;
  col.cells.splice(k, 1, { ...cell, h, n: cell.n - up }, { h, fill: cell.fill, n: up });
  col.fronts = col.fronts.map((f) => ({ ...f, from: f.from > k ? f.from + 1 : f.from, to: f.to >= k ? f.to + 1 : f.to }));
});

// The cell with the one above it: their heights and the fixed shelf between (auto when either is auto), the lower
// one's fill with both counts when the fills are the same; a front over either covers the merged cell, once.
export const mergeUp = (grid, c, k) => edit(grid, (g) => {
  const col = g.columns[c];
  const [a, b] = [col.cells[k], col.cells[k + 1]];
  if (!b) return false;
  const h = a.h === null || b.h === null ? null : a.h + T + b.h;
  col.cells.splice(k, 2, { h, fill: a.fill, n: a.fill === b.fill ? a.n + b.n : a.n });
  // two fronts now over the merged cell: normalizeLayout keeps the lower one
  const at = (i) => (i > k ? i - 1 : i);
  col.fronts = col.fronts.map((f) => ({ ...f, from: at(f.from), to: at(f.to) }));
});

// What covers cell k of a column: its front, or null.
export const frontAt = (col, k) => col.fronts.find((f) => f.from <= k && f.to >= k) ?? null;

// A door, two doors or none over the cells from…to: whatever front covers any of them goes, the new one comes.
export const setFront = (grid, c, from, to, kind, hinge = 'left') => edit(grid, (g) => {
  const col = g.columns[c];
  col.fronts = col.fronts.filter((f) => f.to < from || f.from > to);
  if (kind === 'door' || kind === 'doors2') col.fronts.push({ from, to, kind, hinge: kind === 'door' ? hinge : null });
});

// A drag of the boundary after column (axis x) or cell (axis y) `i` by delta mm: the size before it changes by delta,
// the one after it by −delta, both kept at their minimum. `sizes` are the sizes as built. Both become asked sizes,
// except the one after when it is the only „авто“ of the row — it takes the rest anyway, and stays auto.
export function dragBoundary(grid, { axis, column, cell = null, sizes }, delta) {
  const min = axis === 'x' ? LAYOUT_LIMITS.minColumn : LAYOUT_LIMITS.minCell;
  const i = axis === 'x' ? column : cell;
  if (sizes[i + 1] === undefined) return grid;
  const d = Math.round(clamp(delta, min - sizes[i], sizes[i + 1] - min));
  return edit(grid, (g) => {
    const row = axis === 'x' ? g.columns : g.columns[column].cells;
    const key = axis === 'x' ? 'w' : 'h';
    // the autos left once this one is asked
    const autos = row.filter((x, j) => x[key] === null && j !== i).length;
    row[i][key] = Math.round(sizes[i] + d);
    if (!(row[i + 1][key] === null && autos === 1)) row[i + 1][key] = Math.round(sizes[i + 1] - d);
  });
}
