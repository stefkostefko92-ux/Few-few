// The free carcass („Свободен корпус“): every column its own width, every column split into cells (bottom to top)
// with a fixed shelf between them, each cell open, with shelves, with drawers or with a hanging rail, and doors over
// one cell or several. What it must keep: the sizes asked for, the fixed shelves joined to both panels, no hole on
// another, fronts and hinges clear of the fixed shelves, wide carcasses split at a column, every output producible —
// and the templates turned into it (the „Персонализирай“ button) building with the same outside. What the CNC must
// never get from it: constructor-safety.test.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { registerFixtures, outputMeta } from './fixtures.mjs';
import { checkModel, assertNoHoleOnHole } from './check.mjs';
import { buildModel, normalizeSpec } from '../../engine/model.js';
import { TYPES, TYPE_ORDER, typeDims } from '../../engine/types.js';
import { templateLayout, CONVERTIBLE, LAYOUT_LIMITS } from '../../engine/layout.js';
import { RAIL } from '../../engine/rail.js';
import { buildBom } from '../../engine/bom.js';
import { nest } from '../../engine/nest.js';
import { toGcode, cncBlockers } from '../../engine/cam.js';
import { toDxf } from '../../engine/dxf.js';

registerFixtures();

const T = 18;
const GAP = 3;
const custom = (over = {}) => ({ type: 'custom', width: 1200, height: 2000, depth: 600, legs: 0, top: 'between', ...over });
const col = (cells, fronts = [], w = null) => ({ w, cells, fronts });
const byKey = (m, key) => m.parts.find((p) => p.key === key);
const errors = (m) => m.warnings.filter((w) => w.level === 'error').map((w) => w.text);
const notInfo = (m) => m.warnings.filter((w) => w.level !== 'info').map((w) => `[${w.level}] ${w.text}`);

test('the free carcass is a type of its own, in the form and at its defaults without a warning', () => {
  assert.ok(TYPE_ORDER.includes('custom'));
  assert.equal(TYPES.custom.label, 'Свободен корпус');
  const m = buildModel({ type: 'custom' });
  assert.deepEqual(notInfo(m), []);
  checkModel(m, 'custom defaults');
  assertNoHoleOnHole(m, 'custom defaults');
  assert.ok(m.spec.grid.columns.length >= 2, 'the default shows what the constructor can do');
});

test('column widths: the widths asked for, the rest shared by the auto columns', () => {
  const m = buildModel(custom({ grid: { columns: [col([{ fill: 'open' }], [], 400), col([{ fill: 'open' }]), col([{ fill: 'open' }])] } }));
  // inner 1200 − 2 sides − 2 partitions = 1128: 400 asked, 364 + 364 shared
  assert.equal(byKey(m, 'part1').box.min[0], T + 400);
  assert.equal(byKey(m, 'part2').box.min[0], T + 400 + T + 364);
  assert.deepEqual(notInfo(m), []);
});

test('column widths that do not fit are scaled, with a warning that says so', () => {
  const m = buildModel(custom({ width: 1000, grid: { columns: [col([{ fill: 'open' }], [], 600), col([{ fill: 'open' }], [], 600)] } }));
  // inner 1000 − 2 × 18 − 18 = 946, shared 473 / 473
  assert.equal(byKey(m, 'part1').box.min[0], T + 473);
  assert.ok(m.warnings.some((w) => w.level === 'warn' && /ширин/.test(w.text)), 'the scaling is reported');
});

test('cells: a fixed shelf between every two, at the heights asked for, joined with confirmats to both panels', () => {
  const m = buildModel(custom({ grid: { columns: [col([{ h: 500, fill: 'shelves', n: 1 }, { h: 600, fill: 'open' }, { fill: 'open' }]), col([{ fill: 'open' }])] } }));
  const dividers = m.parts.filter((p) => p.role === 'divider');
  assert.equal(dividers.length, 2, 'three cells, two fixed shelves; one cell, none');
  const [d1, d2] = [byKey(m, 'c1div1'), byKey(m, 'c1div2')];
  assert.equal(d1.box.min[1], T + 500);
  assert.equal(d2.box.min[1], T + 500 + T + 600);
  for (const d of dividers) {
    const ends = d.edgeOps.filter((e) => e.kind === 'confirmat').map((e) => e.edge).sort();
    assert.deepEqual(ends, ['+x', '-x'], `${d.name}: confirmats into both ends`);
    const y = d.box.min[1] + T / 2;
    for (const panelPart of [byKey(m, 'sideL'), byKey(m, 'part1')]) {
      assert.ok(panelPart.features.some((f) => f.kind === 'confirmat' && Math.abs(f.world[1] - y) < 0.01), `${panelPart.name} drilled for ${d.name}`);
    }
  }
  checkModel(m, 'cells');
  assertNoHoleOnHole(m, 'cells');
});

test('fill: drawers in their cell over a fixed shelf, the rail under the top of its cell, shelves inside theirs', () => {
  // inner 1964: 300 + 18 + 400 + 18 + 900 + 18 + 310
  const m = buildModel(custom({ width: 486, grid: { columns: [col([{ h: 300, fill: 'drawers', n: 2 }, { h: 400, fill: 'drawers', n: 2 }, { h: 900, fill: 'rail' }, { fill: 'shelves', n: 1 }])] } }));
  const fronts = m.parts.filter((p) => p.role === 'drawer-front');
  assert.equal(fronts.length, 4);
  const upper = fronts.filter((f) => f.place?.cell === 1);
  assert.equal(upper.length, 2, 'two drawers in the second cell');
  // the fronts of the second cell reach from the middle of the fixed shelf under it to the middle of the one above
  for (const f of upper) assert.ok(f.box.min[1] >= 327 && f.box.max[1] <= 745, `${f.name}: ${f.box.min[1]}–${f.box.max[1]}`);
  // the lowest box of the cell clears the fixed shelf (top at 336) by the slide's 6 mm, not the carcass bottom rule
  const sides = m.parts.filter((p) => p.role === 'drawer-side' && p.place?.cell === 1);
  assert.equal(Math.min(...sides.map((s) => s.box.min[1])), 336 + 6);
  const rail = m.symbols.find((s) => s.type === 'rail');
  assert.equal(rail.y, 1654 - RAIL.topEdge - RAIL.h / 2);
  const shelves = m.parts.filter((p) => p.role === 'shelf');
  assert.equal(shelves.length, 1);
  assert.ok(shelves[0].box.min[1] > 1672 && shelves[0].box.max[1] < 1982);
  checkModel(m, 'fill');
  assertNoHoleOnHole(m, 'fill');
});

test('an open cell has no shelf and no front', () => {
  const m = buildModel(custom({ grid: { columns: [col([{ h: 800, fill: 'open' }, { fill: 'shelves', n: 2 }], [{ from: 1, to: 1, kind: 'door' }])] } }));
  for (const p of m.parts.filter((x) => x.place?.cell === 0)) assert.ok(!['shelf', 'door', 'drawer-front'].includes(p.role), `${p.name} in the open cell`);
  assert.equal(m.parts.filter((p) => p.role === 'shelf').length, 2);
});

test('a door over two cells is one leaf, hinged where asked, its hinges clear of the fixed shelf', () => {
  const m = buildModel(custom({ width: 500, grid: { columns: [col([{ h: 600, fill: 'shelves', n: 1 }, { fill: 'shelves', n: 1 }], [{ from: 0, to: 1, kind: 'door', hinge: 'right' }])] } }));
  const doors = m.parts.filter((p) => p.role === 'door');
  assert.equal(doors.length, 1);
  const [d] = doors;
  assert.equal(d.hingeSide, 'right');
  assert.equal(d.box.min[1], GAP / 2);
  assert.equal(d.box.max[1], 2000 - GAP / 2);
  const mid = T + 600 + T / 2;
  for (const y of d.hingeYs) assert.ok(Math.abs(y - mid) >= 45, `hinge at ${y} by the fixed shelf at ${mid}`);
  checkModel(m, 'door over two cells');
  assertNoHoleOnHole(m, 'door over two cells');
});

test('a fixed shelf where a hinge of the door would go: the hinge moves off it', () => {
  // where the hinges of a door over one tall cell go, then a fixed shelf put right on one of the middle ones
  const one = buildModel(custom({ width: 500, height: 1836, grid: { columns: [col([{ fill: 'shelves', n: 0 }], [{ from: 0, to: 0, kind: 'door' }])] } }));
  const ys = one.parts.find((p) => p.role === 'door').hingeYs;
  assert.ok(ys.length >= 3, `a door with a middle hinge (${ys.length})`);
  const target = ys[1];
  const m = buildModel(custom({ width: 500, height: 1836, grid: { columns: [col([{ h: target - T / 2 - T, fill: 'shelves', n: 0 }, { fill: 'shelves', n: 0 }], [{ from: 0, to: 1, kind: 'door' }])] } }));
  const mid = byKey(m, 'c1div1').box.min[1] + T / 2;
  assert.equal(mid, target, 'the fixed shelf is where the hinge was');
  const d = m.parts.find((p) => p.role === 'door');
  for (const y of d.hingeYs) assert.ok(Math.abs(y - mid) >= 45, `hinge at ${y} by the fixed shelf at ${mid}`);
  assert.deepEqual(errors(m), []);
});

test('two doors over one cell, the cell above open; a front over a drawer cell is not made', () => {
  const m = buildModel(custom({ grid: { columns: [col([{ h: 700, fill: 'shelves', n: 1 }, { fill: 'open' }], [{ from: 0, to: 0, kind: 'doors2' }])] } }));
  const doors = m.parts.filter((p) => p.role === 'door');
  assert.deepEqual(doors.map((d) => d.hingeSide).sort(), ['left', 'right']);
  for (const d of doors) assert.equal(d.box.max[1], T + 700 + T / 2 - GAP / 2);
  const spec = normalizeSpec(custom({ grid: { columns: [col([{ h: 400, fill: 'drawers', n: 2 }, { fill: 'shelves', n: 1 }], [{ from: 0, to: 1, kind: 'door' }])] } }));
  assert.deepEqual(spec.grid.columns[0].fronts, [], 'drawers have their own fronts');
});

test('limits: at most 12 columns and 8 cells, counts and sizes in range, unknown values dropped', () => {
  const many = Array.from({ length: 13 }, () => col([{ fill: 'open' }]));
  const s = normalizeSpec(custom({ width: 6000, grid: { columns: many } }));
  assert.equal(s.grid.columns.length, LAYOUT_LIMITS.columns);
  const tall = normalizeSpec(custom({ grid: { columns: [col(Array.from({ length: 9 }, () => ({ fill: 'open' })))] } }));
  assert.equal(tall.grid.columns[0].cells.length, LAYOUT_LIMITS.cells);
  const odd = normalizeSpec(custom({ grid: { columns: [{ w: -5, cells: [{ h: 3, fill: 'bogus', n: 99 }, { fill: 'drawers', n: 0 }], fronts: [{ from: 5, to: 9, kind: 'x' }] }] } }));
  const c0 = odd.grid.columns[0];
  assert.equal(c0.w, LAYOUT_LIMITS.minColumn);
  assert.deepEqual(c0.cells[0], { h: LAYOUT_LIMITS.minCell, fill: 'open', n: 0 });
  assert.equal(c0.cells[1].n, 1);
  assert.deepEqual(c0.fronts, []);
  assert.deepEqual(normalizeSpec({ type: 'custom', grid: 'junk' }).grid, normalizeSpec({ type: 'custom' }).grid);
});

test('a drawer cell too low for its drawers is an error, and the CNC files are withheld', () => {
  const m = buildModel(custom({ grid: { columns: [col([{ h: 150, fill: 'drawers', n: 3 }, { fill: 'open' }])] } }));
  assert.ok(errors(m).some((t) => /чекмедже/.test(t)), errors(m).join(' | '));
  assert.ok(cncBlockers(m, nest(m)).length > 0);
});

test('wider than one carcass: split at a column into carcasses that fit the sheet, same total width', () => {
  const m = buildModel(custom({ width: 3000, grid: { columns: Array.from({ length: 6 }, () => col([{ fill: 'shelves', n: 3 }])) } }));
  const modules = [...new Set(m.parts.map((p) => p.module))].sort();
  assert.deepEqual(modules, ['К1', 'К2']);
  // split as evenly as it goes: 3 + 3 columns, not 4 + 2
  for (const mod of modules) assert.equal(m.parts.filter((p) => p.module === mod && p.role === 'partition').length, 2, mod);
  const xs = m.parts.filter((p) => p.role === 'side').flatMap((p) => [p.box.min[0], p.box.max[0]]);
  assert.equal(Math.min(...xs), 0);
  assert.equal(Math.max(...xs), 3000);
  for (const p of m.parts.filter((x) => x.role === 'bottom' || x.role === 'top')) assert.ok(p.L <= 2400, `${p.name} ${p.L}`);
  assert.ok(m.warnings.some((w) => w.level === 'info' && /корпуса/.test(w.text)));
  assert.deepEqual(errors(m), []);
});

test('„Персонализирай“: every one-carcass template becomes a free carcass with the same outside and columns', () => {
  const columns = { base: 1, wall: 1, tall: 1, wardrobe: 4, chest: 2, nightstand: 1, bookcase: 2, tv: 4 };
  assert.deepEqual([...CONVERTIBLE].sort(), Object.keys(columns).sort());
  for (const type of CONVERTIBLE) {
    const from = normalizeSpec({ type });
    const to = templateLayout(type, from);
    assert.equal(to.type, 'custom', type);
    const m = buildModel(to);
    assert.deepEqual(errors(m), [], type);
    assert.deepEqual(typeDims('custom', m.spec), typeDims(type, from), `${type}: the outside`);
    assert.equal(m.spec.grid.columns.length, columns[type], `${type}: columns`);
    for (const k of ['carcassDecor', 'frontDecor', 'hinge', 'handle', 'slide', 'gap']) assert.equal(m.spec[k], from[k], `${type}: ${k} kept`);
  }
});

test('every output of a full layout: BOM, nesting, G-code ISO and GRBL, DXF — nothing withheld', () => {
  const spec = custom({
    width: 2000,
    grid: {
      columns: [
        col([{ h: 540, fill: 'drawers', n: 3 }, { fill: 'rail' }], [{ from: 1, to: 1, kind: 'door', hinge: 'left' }], 450),
        col([{ h: 900, fill: 'shelves', n: 2 }, { fill: 'shelves', n: 2 }], [{ from: 0, to: 1, kind: 'doors2' }]),
        col([{ h: 400, fill: 'open' }, { fill: 'shelves', n: 3 }], [{ from: 1, to: 1, kind: 'door', hinge: 'right' }], 450),
      ],
    },
  });
  for (const post of ['iso', 'grbl']) {
    const m = buildModel({ ...spec, post });
    assert.deepEqual(errors(m), [], post);
    checkModel(m, post);
    assertNoHoleOnHole(m, post);
    const bom = buildBom(m);
    assert.equal(bom.rows.length, m.parts.length);
    assert.ok(m.parts.some((r) => r.role === 'divider' && /Неподвижен рафт/.test(r.name)), 'the fixed shelves are in the cut list');
    const nesting = nest(m);
    assert.deepEqual(cncBlockers(m, nesting), [], post);
    for (const sh of nesting.sheets) {
      assert.match(toGcode(m, sh, { ...outputMeta(m), sheetCount: nesting.sheets.length }).text, /SIMULATE AND DRY RUN BEFORE CUTTING/);
      assert.ok(toDxf(m, sh).text.includes('SECTION'));
    }
  }
});

test('places: every part of a free carcass knows its carcass, column and cell; the templates carry none', () => {
  const m = buildModel(custom({ grid: { columns: [col([{ h: 600, fill: 'drawers', n: 2 }, { fill: 'shelves', n: 1 }], [{ from: 1, to: 1, kind: 'door' }]), col([{ fill: 'rail' }], [{ from: 0, to: 0, kind: 'door' }])] } }));
  for (const role of ['divider', 'shelf', 'door', 'drawer-front', 'drawer-side']) {
    for (const p of m.parts.filter((x) => x.role === role)) {
      assert.ok(p.place && Number.isInteger(p.place.carcass) && Number.isInteger(p.place.column) && Number.isInteger(p.place.cell), `${p.name} without a place`);
    }
  }
  assert.ok(m.parts.filter((p) => p.role === 'door').some((d) => d.place.column === 1));
  for (const type of TYPE_ORDER.filter((t) => t !== 'custom')) assert.ok(buildModel({ type }).parts.every((p) => p.place === undefined), type);
});

test('the layout is normalized once: normalizing again changes nothing, and other types never get one', () => {
  const s = normalizeSpec(custom({ grid: { columns: [col([{ h: 500.4, fill: 'shelves', n: 2 }, { fill: 'rail' }], [{ from: 0, to: 0, kind: 'door', hinge: 'left' }], 455.6)] } }));
  assert.deepEqual(normalizeSpec(s), s);
  assert.equal(s.grid.columns[0].w, 456, 'whole millimetres');
  assert.equal(s.grid.columns[0].cells[0].h, 500);
  for (const type of TYPE_ORDER.filter((t) => t !== 'custom')) assert.equal(normalizeSpec({ type, grid: { columns: [] } }).grid, undefined, type);
});
