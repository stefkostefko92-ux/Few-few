// CNC fail-closed, tested by breaking a good model on purpose: a hole that would leave its part on the sheet, an error
// from the model checks (a part larger than the sheet, a face hole on an edge bore), a part the nesting could not
// place. Each one is a blocker; G-code and DXF refuse the model's own errors and stray holes, and the callers refuse
// nesting errors through cncBlockers().
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { registerCatalog, baseCatalogData } from '../../engine/catalog.js';
import { buildModel } from '../../engine/model.js';
import { TYPES, BUILDERS } from '../../engine/types.js';
import { buildCarcass } from '../../engine/carcass.js';
import { hole } from '../../engine/panel.js';
import { nest } from '../../engine/nest.js';
import { toGcode, cncBlockers } from '../../engine/cam.js';
import { toDxf } from '../../engine/dxf.js';

registerCatalog(baseCatalogData());
const meta = { product: 'Korpora', hash: 'c'.repeat(64), owner: 'Carbon Stealth VCC', date: '2026-10-04' };

function good() {
  const m = buildModel({ type: 'base' });
  return { m, n: nest(m) };
}

const sheetOf = (n, part) => n.sheets.find((s) => s.placements.some((pl) => pl.partId === part.id));

test('a good model has no blockers and gives G-code and DXF for every sheet', () => {
  const { m, n } = good();
  assert.deepEqual(cncBlockers(m, n), []);
  for (const sheet of n.sheets) {
    assert.doesNotThrow(() => toGcode(m, sheet, { ...meta, sheetCount: n.sheets.length }));
    assert.doesNotThrow(() => toDxf(m, sheet));
  }
});

test('a hole that would leave its part on the sheet blocks G-code and DXF', () => {
  const { m, n } = good();
  const part = m.parts.find((p) => sheetOf(n, p) && p.features.some((f) => f.type === 'hole'));
  part.features.find((f) => f.type === 'hole').u = -500;
  const sheet = sheetOf(n, part);
  const blockers = cncBlockers(m, n);
  assert.ok(blockers.some((b) => b.startsWith(`${part.name}: отвор`)), blockers.join(' | '));
  assert.throws(() => toGcode(m, sheet, { ...meta, sheetCount: n.sheets.length }), /CNC blocked/);
  assert.throws(() => toDxf(m, sheet), /CNC blocked/);
});

test('an error from the model checks blocks G-code and DXF on every sheet', () => {
  // the TV top of this wall unit is longer than the sheet
  const m = buildModel({ type: 'wallunit', width: 3590, sideWidth: 400 });
  const n = nest(m);
  assert.ok(m.warnings.some((w) => w.level === 'error'), 'the model has no error');
  assert.ok(cncBlockers(m, n).length > 0, 'no blocker');
  assert.ok(n.sheets.length > 0);
  for (const sheet of n.sheets) {
    assert.throws(() => toGcode(m, sheet, { ...meta, sheetCount: n.sheets.length }), /CNC blocked/);
    assert.throws(() => toDxf(m, sheet), /CNC blocked/);
  }
});

test('a face hole on the bore of a confirmat in the same panel is an error that blocks G-code and DXF', () => {
  // a test-only type: two columns, then a Ø3 × 10 pilot drilled after the joints, 20 mm above a bore that runs up into
  // the partition from the bottom (the generator itself keeps its holes clear; this is the check behind it)
  TYPES.boreClash = { label: 'Тест', params: [], defaults: {} };
  BUILDERS.boreClash = (ctx, s) => {
    buildCarcass(ctx, { carcassDecor: s.carcassDecor, frontDecor: s.frontDecor, W: 800, H: 700, D: 400, top: 'between', columns: [{}, {}] });
    const part = ctx.parts.find((p) => p.role === 'partition');
    const [, y, z] = part.edgeOps.find((e) => e.edge === '-y').world[1];
    hole(part, [part.box.max[0], y + 20, z], 3, 10, 'slide', { hw: 'slide' });
  };
  try {
    const m = buildModel({ type: 'boreClash' });
    const part = m.parts.find((p) => p.role === 'partition');
    const err = m.warnings.find((w) => w.level === 'error' && w.text.includes('хоризонталния отвор'));
    assert.ok(err?.text.startsWith(`${part.name}: отвор Ø3`), m.warnings.map((w) => w.text).join(' | '));
    const n = nest(m);
    assert.ok(cncBlockers(m, n).includes(err.text));
    const sheet = sheetOf(n, part);
    assert.throws(() => toGcode(m, sheet, { ...meta, sheetCount: n.sheets.length }), /CNC blocked/);
    assert.throws(() => toDxf(m, sheet), /CNC blocked/);
  } finally {
    delete TYPES.boreClash;
    delete BUILDERS.boreClash;
  }
});

test('a part the nesting could not place is a blocker on its own', () => {
  const { m, n } = good();
  const lost = 'Детайл (тест) не се побира в лист 2800 × 2070.';
  assert.deepEqual(cncBlockers(m, { ...n, errors: [lost] }), [lost]);
});
