// CNC fail-closed, tested by breaking a good model on purpose: a hole that would leave its part on the sheet, an error
// from the model checks (a part larger than the sheet), a part the nesting could not place. Each one is a blocker;
// G-code and DXF refuse the model's own errors and stray holes, and the callers refuse nesting errors through
// cncBlockers().
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { registerCatalog, baseCatalogData } from '../../engine/catalog.js';
import { buildModel } from '../../engine/model.js';
import { nest } from '../../engine/nest.js';
import { toGcode, cncBlockers } from '../../engine/cam.js';
import { toDxf } from '../../engine/dxf.js';

registerCatalog(baseCatalogData());
const meta = { product: 'Rendetto', hash: 'c'.repeat(64), owner: 'Carbon Stealth VCC', date: '2026-10-04' };

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
    assert.doesNotThrow(() => toDxf(m, sheet, meta));
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
  assert.throws(() => toDxf(m, sheet, meta), /CNC blocked/);
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
    assert.throws(() => toDxf(m, sheet, meta), /CNC blocked/);
  }
});

test('a part the nesting could not place is a blocker on its own', () => {
  const { m, n } = good();
  const lost = 'Детайл (тест) не се побира в лист 2800 × 2070.';
  assert.deepEqual(cncBlockers(m, { ...n, errors: [lost] }), [lost]);
});
