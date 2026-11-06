import { before, test } from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadEngine } from '../src/services/engine.js';
import { normalizedSpec } from '../src/services/projects.js';

// The free carcass carries its grid (columns, cells, fronts) in the one nested key the spec may have (`grid` — the wardrobe already has a `layout` parameter). The schema
// takes exactly that shape, bounded, before the engine sees it; anything else nested stays bad input (400).

before(async () => {
  await loadEngine(join(tmpdir(), `korpora-no-catalog-layout-${process.pid}.json`));
});

const cell = (fill: string, n = 0, h: number | null = null) => ({ h, fill, n });
const layout = (columns: unknown[]) => ({
  type: 'custom',
  width: 1200,
  height: 2000,
  depth: 600,
  grid: { columns },
});
const column = {
  w: 450,
  cells: [cell('drawers', 3, 540), cell('rail')],
  fronts: [{ from: 1, to: 1, kind: 'door', hinge: 'left' }],
};

test('a valid layout is kept, normalized by the engine', () => {
  const spec = normalizedSpec(
    layout([column, { w: null, cells: [cell('shelves', 4)], fronts: [] }]),
  );
  assert.ok(spec, 'accepted');
  const cols = (spec.grid as { columns: { w: number | null; cells: unknown[] }[] }).columns;
  assert.equal(cols.length, 2);
  assert.equal(cols[0]?.w, 450);
  assert.equal(cols[0]?.cells.length, 2);
});

test('the layout is bounded: too many columns, cells or fronts, or a string where a number goes, is bad input', () => {
  assert.equal(
    normalizedSpec(layout(Array.from({ length: 13 }, () => column))),
    null,
    '13 columns',
  );
  assert.equal(
    normalizedSpec(layout([{ ...column, cells: Array.from({ length: 9 }, () => cell('open')) }])),
    null,
    '9 cells',
  );
  assert.equal(
    normalizedSpec(
      layout([
        { ...column, fronts: Array.from({ length: 9 }, () => ({ from: 0, to: 0, kind: 'door' })) },
      ]),
    ),
    null,
    '9 fronts',
  );
  assert.equal(normalizedSpec(layout([{ ...column, w: '450' }])), null, 'w as text');
  assert.equal(
    normalizedSpec(layout([{ ...column, cells: [{ h: 100, fill: 'x'.repeat(50), n: 1 }] }])),
    null,
    'a long fill',
  );
  assert.equal(
    normalizedSpec(layout([{ ...column, extra: { deep: [1] } }])),
    null,
    'an unknown nested key',
  );
  assert.equal(
    normalizedSpec(layout([{ ...column, cells: [{ h: 100, fill: 'open', n: 0, x: 1 }] }])),
    null,
    'an unknown key in a cell',
  );
  assert.equal(
    normalizedSpec(
      layout([{ ...column, fronts: [{ from: 1, to: 1, kind: 'door', hinge: 'left', x: 1 }] }]),
    ),
    null,
    'an unknown key in a front',
  );
  assert.equal(normalizedSpec({ type: 'custom', grid: [] }), null, 'layout as an array');
});

test('nesting anywhere but in the layout stays bad input, and deep nesting there is not a stack overflow', () => {
  assert.equal(normalizedSpec({ type: 'custom', other: { columns: [] } }), null);
  const depth = 32_000;
  const deep: unknown = JSON.parse(
    `{"type":"custom","grid":{"columns":${'['.repeat(depth)}${']'.repeat(depth)}}}`,
  );
  assert.equal(normalizedSpec(deep), null);
});

test('a layout sent with another type is dropped, not stored', () => {
  const spec = normalizedSpec({ type: 'wardrobe', grid: { columns: [column] } });
  assert.ok(spec);
  assert.equal(spec.grid, undefined);
  assert.equal(spec.layout, 'mixed', "the wardrobe's own layout parameter is untouched");
});
