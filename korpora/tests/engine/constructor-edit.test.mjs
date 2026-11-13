// The constructor's edits of a free carcass (engine/layout-edit.js): every edit returns a new, normalized grid and
// leaves the old one as it was (the editor keeps it for undo); the fronts follow the cells they cover when cells are
// split, merged or removed; a drag moves one boundary by exactly what was dragged, the rest of the furniture stays.
// And the model tells the editor where every cell is (model.cells), so the front view draws what is built.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { registerFixtures } from './fixtures.mjs';
import { buildModel } from '../../engine/model.js';
import { normalizeLayout, LAYOUT_LIMITS } from '../../engine/layout.js';
import { addColumn, removeColumn, setWidth, setHeight, setFill, setCount, splitCell, mergeUp, setFront, frontAt, dragBoundary } from '../../engine/layout-edit.js';

registerFixtures();

const T = 18;
const cell = (fill, n = 0, h = null) => ({ h, fill, n });
const grid = (...columns) => normalizeLayout({ columns });
const col = (cells, fronts = [], w = null) => ({ w, cells, fronts });
const custom = (g, over = {}) => ({ type: 'custom', width: 1200, height: 2000, depth: 600, legs: 0, top: 'between', grid: g, ...over });
const frozen = (g) => JSON.stringify(g);

test('the model tells where every cell is: carcass, column, cell, its clear inside, its fill', () => {
  const m = buildModel(custom(grid(col([cell('drawers', 2, 500), cell('shelves', 3)]), col([cell('rail')]))));
  assert.equal(m.cells.length, 3);
  const [a, b, c] = m.cells;
  assert.deepEqual([a.column, a.cell, a.fill, a.n], [0, 0, 'drawers', 2]);
  assert.deepEqual([a.y0, a.y1], [T, T + 500]);
  assert.deepEqual([b.column, b.cell, b.y0], [0, 1, T + 500 + T]);
  assert.equal(c.column, 1);
  assert.equal(a.x1 + T, c.x0, 'a partition between the columns');
  assert.equal(buildModel({ type: 'base' }).cells, undefined, 'the templates carry none');
});

test('every edit returns a new normalized grid and leaves the old one as it was', () => {
  const g = grid(col([cell('shelves', 2)], [{ from: 0, to: 0, kind: 'door', hinge: 'left' }]), col([cell('rail')]));
  const before = frozen(g);
  const edits = [
    addColumn(g, 1), removeColumn(g, 0), setWidth(g, 0, 400), setHeight(g, 0, 0, 700), setFill(g, 0, 0, 'drawers'), setCount(g, 0, 0, 5),
    splitCell(g, 0, 0, 1964), mergeUp(splitCell(g, 0, 0, 1964), 0, 0), setFront(g, 1, 0, 0, 'doors2'),
  ];
  assert.equal(frozen(g), before);
  for (const e of edits) assert.deepEqual(normalizeLayout(e), e);
});

test('columns: added where asked, removed, never more than 12 or fewer than one', () => {
  const g = grid(col([cell('open')]), col([cell('rail')]));
  assert.equal(addColumn(g, 0).columns[1].cells[0].fill, 'open', 'the new one on the left');
  assert.equal(addColumn(g, 2).columns.length, 3);
  assert.equal(removeColumn(g, 1).columns.length, 1);
  const one = grid(col([cell('open')]));
  assert.equal(removeColumn(one, 0), one, 'the last column stays');
  const full = grid(...Array.from({ length: LAYOUT_LIMITS.columns }, () => col([cell('open')])));
  assert.equal(addColumn(full, 0), full, 'no 13th column');
});

test('fill and count: drawers keep a count from 1, a front over a cell that gets drawers is dropped', () => {
  const g = grid(col([cell('shelves', 2), cell('open')], [{ from: 0, to: 1, kind: 'door', hinge: 'right' }]));
  const d = setFill(g, 0, 0, 'drawers');
  assert.deepEqual(d.columns[0].cells[0], { h: null, fill: 'drawers', n: 3 });
  assert.deepEqual(d.columns[0].fronts, []);
  assert.equal(setFill(g, 0, 0, 'shelves').columns[0].cells[0].n, 2, 'the same fill keeps its count');
  assert.equal(setCount(d, 0, 0, 0).columns[0].cells[0].n, 1);
  assert.equal(setCount(g, 0, 0, 99).columns[0].cells[0].n, LAYOUT_LIMITS.shelves);
});

test('split: the cell becomes two, the count shared, a front over it covers both, the cells above move up', () => {
  const g = grid(col([cell('shelves', 3, 900), cell('open')], [{ from: 0, to: 0, kind: 'door', hinge: 'left' }, { from: 1, to: 1, kind: 'doors2' }]));
  const s = splitCell(g, 0, 0, 900);
  const c = s.columns[0];
  assert.equal(c.cells.length, 3);
  assert.deepEqual(c.cells.slice(0, 2).map((x) => [x.h, x.fill]), [[441, 'shelves'], [441, 'shelves']], '(900 − 18) / 2');
  assert.equal(c.cells[0].n + c.cells[1].n, 3);
  assert.deepEqual(c.fronts.map((f) => [f.from, f.to, f.kind]), [[0, 1, 'door'], [2, 2, 'doors2']]);
  const auto = splitCell(grid(col([cell('open')])), 0, 0, 1964).columns[0].cells;
  assert.deepEqual(auto.map((x) => x.h), [null, null], 'an auto cell splits into two auto cells');
  const low = grid(col([cell('open', 0, 210), cell('open')]));
  assert.equal(splitCell(low, 0, 0, 210), low, 'too low to split: two cells of the minimum and a fixed shelf need 218');
  const eight = grid(col(Array.from({ length: LAYOUT_LIMITS.cells }, () => cell('open'))));
  assert.equal(splitCell(eight, 0, 0, 1000), eight, 'no 9th cell');
});

test('merge: a cell with the one above, their heights and the fixed shelf between, the fronts over either kept once', () => {
  const g = grid(col([cell('shelves', 1, 400), cell('shelves', 2, 500), cell('rail')], [{ from: 1, to: 1, kind: 'door', hinge: 'left' }, { from: 2, to: 2, kind: 'door', hinge: 'right' }]));
  const m = mergeUp(g, 0, 0);
  const c = m.columns[0];
  assert.deepEqual(c.cells[0], { h: 400 + T + 500, fill: 'shelves', n: 3 });
  assert.deepEqual(c.fronts.map((f) => [f.from, f.to, f.hinge]), [[0, 0, 'left'], [1, 1, 'right']]);
  assert.equal(mergeUp(g, 0, 2), g, 'the top cell has nothing above');
  assert.equal(mergeUp(g, 0, 1).columns[0].cells[1].h, null, 'with an auto cell the merged one is auto');
});

test('fronts: a door, two doors or none over the cells chosen; the hinge side kept; what was over them replaced', () => {
  const g = grid(col([cell('shelves', 1), cell('shelves', 1), cell('open')], [{ from: 0, to: 0, kind: 'door', hinge: 'right' }]));
  const d = setFront(g, 0, 0, 1, 'door', 'left');
  assert.deepEqual(d.columns[0].fronts, [{ from: 0, to: 1, kind: 'door', hinge: 'left' }]);
  assert.deepEqual(frontAt(d.columns[0], 1), { from: 0, to: 1, kind: 'door', hinge: 'left' });
  assert.equal(frontAt(d.columns[0], 2), null);
  assert.deepEqual(setFront(d, 0, 1, 1, 'none').columns[0].fronts, [], 'removing a door over a cell removes the whole door');
  assert.deepEqual(setFront(g, 0, 2, 2, 'doors2').columns[0].fronts.map((f) => [f.from, f.kind, f.hinge]), [[0, 'door', 'right'], [2, 'doors2', null]]);
});

test('a drag moves one boundary by what was dragged: the two neighbours change, the rest of the furniture stays', () => {
  const g = grid(col([cell('open')], [], 400), col([cell('open')]), col([cell('open')]));
  const before = buildModel(custom(g));
  const sizes = [400, 364, 364]; // 1200 − 4 × 18 = 1128: 400 asked, 364 + 364 auto
  const w = dragBoundary(g, { axis: 'x', column: 0, sizes }, 50);
  const after = buildModel(custom(w));
  const part = (m, k) => m.parts.find((p) => p.key === k).box.min[0];
  assert.equal(part(after, 'part1'), part(before, 'part1') + 50);
  assert.equal(part(after, 'part2'), part(before, 'part2'), 'the next partition stays');
  assert.equal(w.columns[2].w, null, 'the last auto column stays auto');
  // cells: the fixed shelf over cell 0 moves 30 mm down, the cell above (the only auto) takes it
  const h = grid(col([cell('open', 0, 600), cell('open')]));
  const moved = dragBoundary(h, { axis: 'y', column: 0, cell: 0, sizes: [600, 1328] }, -30);
  assert.deepEqual(moved.columns[0].cells.map((x) => x.h), [570, null]);
  // never under the minimum on either side
  const far = dragBoundary(h, { axis: 'y', column: 0, cell: 0, sizes: [600, 1328] }, -900);
  assert.equal(far.columns[0].cells[0].h, LAYOUT_LIMITS.minCell);
  const both = dragBoundary(grid(col([cell('open', 0, 600), cell('open', 0, 600), cell('open')])), { axis: 'y', column: 0, cell: 0, sizes: [600, 600, 710] }, 100);
  assert.deepEqual(both.columns[0].cells.map((x) => x.h), [700, 500, null], 'an asked neighbour gives what the other takes');
});
