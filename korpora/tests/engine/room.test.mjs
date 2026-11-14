// A room (engine/room.js): several pieces of furniture on the walls of one project. Checked: moving a piece along its
// wall (shiftBuilt) is the same as building it there; every piece stands with its back to its wall, inside the room,
// at its distance from the corner; two pieces in one place, or one past the end of its wall, is an error; the cut,
// the drilling and the CNC cover the whole room; the plan and the walls are drawn; a saved room is kept within limits.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { registerFixtures } from './fixtures.mjs';
import { checkModel, assertNoHoleOnHole, assertWellFormed } from './check.mjs';
import { buildModel, normalizeSpec } from '../../engine/model.js';
import { BUILDERS, normalizeParams } from '../../engine/types.js';
import { baseCabinet } from '../../engine/kitchen.js';
import { createCtx } from '../../engine/panel.js';
import { mark, shiftBuilt, worldParts } from '../../engine/transform.js';
import { normalizeItems, ROOM_LIMITS } from '../../engine/room.js';
import { buildBom } from '../../engine/bom.js';
import { nest } from '../../engine/nest.js';
import { cncBlockers } from '../../engine/cam.js';
import { drawingAssembly } from '../../engine/drawing-assembly.js';

registerFixtures();

const meta = { product: 'Korpora', hash: 'a'.repeat(64), owner: 'Test', date: '2026-11-14' };
const strip = (ctx) => JSON.stringify(ctx.parts.map(({ id, ...p }) => p)) + JSON.stringify(ctx.symbols) + JSON.stringify(ctx.groups.map(({ id, partIds, ...g }) => g));

test('moving a piece along its wall is the same as building it there', () => {
  for (const [type, params] of [['base', { fronts: 'doors', doors: 2 }], ['base', { fronts: 'drawers' }], ['base', { fronts: 'mixed', handle: 'fx:knob' }]]) {
    const s = { ...normalizeSpec({ type }), ...normalizeParams('base', params) };
    const c = { carcassDecor: s.carcassDecor, frontDecor: s.frontDecor, frontMaterial: s.frontMaterial, frontRal: s.frontRal, bands: { carcass: s.bandCarcass, front: s.bandFront }, gap: s.gap, hinge: s.hinge, handle: s.handle, slide: s.slide, kind: 'base', columnsParam: false };
    const there = createCtx();
    baseCabinet(there, s, c, { x0: 735 });
    const moved = createCtx();
    const from = mark(moved);
    baseCabinet(moved, s, c);
    shiftBuilt(moved, from, 735);
    assert.equal(strip(moved), strip(there), `${type} ${JSON.stringify(params)}`);
  }
});

const ROOMS = [
  { type: 'room' },
  { type: 'room', shape: 'left', items: [{ type: 'wardrobe', wall: 'A', x: 700, params: { width: 2000 } }, { type: 'chest', wall: 'B', x: 700, params: {} }] },
  { type: 'room', shape: 'right', items: [{ type: 'bookcase', wall: 'A', x: 0, params: {} }, { type: 'desk', wall: 'C', x: 900, params: {} }] },
  { type: 'room', shape: 'u', roomWidth: 5000, roomDepth: 3500, items: [{ type: 'wardrobe', wall: 'A', x: 700, params: { width: 2400, columns: 4 } }, { type: 'nightstand', wall: 'B', x: 800, params: {} }, { type: 'tv', wall: 'C', x: 800, params: {} }, { type: 'wall', wall: 'C', x: 2600, params: {} }] },
];
const label = (s) => JSON.stringify(s).slice(0, 140);

test('every piece on its wall: back to the wall, inside the room, at its distance from the corner', () => {
  for (const s of ROOMS) {
    const m = buildModel(s);
    const spec = m.spec;
    const world = worldParts(m);
    spec.items.forEach((it, i) => {
      const parts = world.filter((p) => p.module === String(i + 1) || p.module.startsWith(`${i + 1}·`));
      assert.ok(parts.length > 0, `${label(s)} item ${i + 1}`);
      const min = [0, 1, 2].map((k) => Math.min(...parts.map((p) => p.box.min[k])));
      const max = [0, 1, 2].map((k) => Math.max(...parts.map((p) => p.box.max[k])));
      const W = it.params.width;
      if (it.wall === 'A') {
        assert.ok(Math.abs(min[2]) < 0.6, `${label(s)} ${it.type}: back to wall A (${min[2]})`);
        assert.ok(min[0] >= it.x - 0.6 && max[0] <= it.x + W + 0.6, `${label(s)} ${it.type}: along A ${min[0]}–${max[0]}`);
      } else if (it.wall === 'B') {
        assert.ok(Math.abs(min[0]) < 0.6, `${label(s)} ${it.type}: back to wall B (${min[0]})`);
        assert.ok(min[2] >= it.x - 0.6 && max[2] <= it.x + W + 0.6, `${label(s)} ${it.type}: along B ${min[2]}–${max[2]}`);
      } else {
        assert.ok(Math.abs(max[0] - spec.roomWidth) < 0.6, `${label(s)} ${it.type}: back to wall C (${max[0]})`);
        assert.ok(min[2] >= it.x - 0.6 && max[2] <= it.x + W + 0.6, `${label(s)} ${it.type}: along C ${min[2]}–${max[2]}`);
      }
      assert.ok(min[0] >= -0.6 && max[0] <= spec.roomWidth + 0.6, `${label(s)} ${it.type}: inside the room`);
    });
    assert.deepEqual(m.warnings.filter((w) => w.level === 'error'), [], label(s));
    checkModel(m, label(s));
    assertNoHoleOnHole(m, label(s));
  }
});

test('the whole room in one cut list, one nesting, one set of CNC files, one assembly sheet', () => {
  for (const s of ROOMS) {
    const m = buildModel(s);
    const alone = m.spec.items.reduce((a, it) => a + buildModel({ ...it.params, type: it.type }).parts.length, 0);
    assert.equal(m.parts.length, alone, label(s));
    const bom = buildBom(m);
    assert.equal(bom.rows.length, m.parts.length, label(s));
    const nesting = nest(m);
    assert.deepEqual(cncBlockers(m, nesting), [], label(s));
    const svg = drawingAssembly(m, meta);
    assertWellFormed(svg, label(s));
    assert.ok(!/note\.corner|компенсатор/.test(svg), `${label(s)}: no kitchen corner note`);
  }
});

test('two pieces in one place, or past the end of a wall, is an error', () => {
  const same = buildModel({ type: 'room', items: [{ type: 'chest', wall: 'A', x: 0, params: {} }, { type: 'chest', wall: 'A', x: 300, params: {} }] });
  assert.ok(same.warnings.some((w) => w.level === 'error' && /1\. .* 2\. /.test(w.text)), JSON.stringify(same.warnings));
  // a corner: the piece on the back wall and the one on the left wall both at the corner
  const corner = buildModel({ type: 'room', shape: 'left', items: [{ type: 'chest', wall: 'A', x: 0, params: {} }, { type: 'chest', wall: 'B', x: 0, params: {} }] });
  assert.ok(corner.warnings.some((w) => w.level === 'error' && /място/.test(w.text)));
  const out = buildModel({ type: 'room', roomWidth: 1500, items: [{ type: 'wardrobe', wall: 'A', x: 0, params: { width: 2000 } }] });
  assert.ok(out.warnings.some((w) => w.level === 'error' && /2000/.test(w.text) && /1500/.test(w.text)));
  assert.ok(cncBlockers(out, nest(out)).length);
});

test('a saved room within limits: known types, its walls, whole millimetres, at most eight pieces', () => {
  const items = normalizeItems(
    [
      { type: 'spaceship', wall: 'A', x: 0, params: {} },
      { type: 'kitchen', wall: 'A', x: 0, params: {} },
      { type: 'chest', wall: 'C', x: 99999.4, params: { width: 1, nonsense: 'x' } },
      ...Array.from({ length: 12 }, () => ({ type: 'nightstand', wall: 'A', x: -5, params: {} })),
    ],
    'left',
  );
  assert.equal(items.length, ROOM_LIMITS.items);
  assert.equal(items[0].type, 'chest');
  assert.equal(items[0].wall, 'A', 'no wall C in a left-hand room');
  assert.equal(items[0].x, ROOM_LIMITS.x[1]);
  assert.ok(!('nonsense' in items[0].params));
  assert.ok(items[0].params.width >= 400, 'the width within the chest’s own limits');
  assert.ok(items.slice(1).every((it) => it.x === 0));
  assert.deepEqual(normalizeSpec({ type: 'room' }).items.map((it) => it.type), ['wardrobe', 'chest']);
  // another type does not carry the pieces
  assert.equal(normalizeSpec({ type: 'wardrobe', items: [] }).items, undefined);
});
