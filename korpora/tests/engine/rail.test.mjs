// The hanging rail (engine/rail.js): its top edge 60 mm under the top of the column (ГОСТ 13025.1-85 „50 min“ + 10),
// a warning 10 mm before the inner depth of 560 mm (ГОСТ) and before the length of 800 mm from which Hettich recommends
// a centre support, which then goes into the hardware list. The boundaries are built on one carcass with a rail column,
// at sizes the wardrobe's 10 mm steps cannot reach.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { registerCatalog, baseCatalogData } from '../../engine/catalog.js';
import { buildModel, normalizeSpec } from '../../engine/model.js';
import { createCtx } from '../../engine/panel.js';
import { buildCarcass } from '../../engine/carcass.js';
import { RAIL } from '../../engine/rail.js';

registerCatalog(baseCatalogData());
const spec = normalizeSpec({ type: 'wardrobe' });
const H = 2000;
const T = 18;

// One carcass W × H × D with a single hanging-rail column (no plinth): inner width W − 36, inner depth D − 19.
function railCarcass(W, D) {
  const ctx = createCtx();
  buildCarcass(ctx, { hinge: spec.hinge, handle: spec.handle, slide: spec.slide, W, H, D, plinth: { type: 'none', h: 0 }, top: 'between', columns: [{ rail: true, doors: 2 }] });
  return { warnings: ctx.warnings, hardware: ctx.hardwareLines(), rail: ctx.symbols.find((s) => s.type === 'rail'), parts: ctx.parts };
}
const depthNote = (c) => c.warnings.filter((w) => w.text.includes('ГОСТ 13025.1-85'));
const lengthNote = (c) => c.warnings.filter((w) => w.text.includes('среден държач'));
const centre = (c) => c.hardware.filter((h) => h.name === 'Среден държач за лост');

test('rail depth: a warning from 569 mm inner depth down, none at 570 — ГОСТ 13025.1-85 asks 560 from the back to the door', () => {
  const tight = railCarcass(800, 588);
  const [w] = depthNote(tight);
  assert.equal(depthNote(tight).length, 1);
  assert.equal(w.level, 'warn');
  assert.ok(w.text.includes('569 mm') && w.text.includes('560 mm') && w.text.includes('черт. 1 и 2') && w.text.includes('Задълбочете шкафа с 1 mm'), w.text);
  assert.deepEqual(depthNote(railCarcass(800, 589)), []);
  // the narrowest wardrobe the form allows, 450 deep: 431 mm inside, 139 mm short of 570
  const shallow = buildModel({ type: 'wardrobe', depth: 450 });
  const notes = shallow.warnings.filter((x) => x.text.includes('ГОСТ 13025.1-85'));
  assert.equal(notes.length, 1, 'one note per carcass, not per rail column');
  assert.ok(notes[0].text.includes('431 mm') && notes[0].text.includes('с 139 mm'), notes[0].text);
});

test('rail length: from 790 mm a warning and one centre support per such rail, none at 789 mm — Hettich: from 800 mm', () => {
  const short = railCarcass(827, 600);
  assert.equal(short.rail.x1 - short.rail.x0, 789);
  assert.deepEqual([lengthNote(short), centre(short)], [[], []]);
  const long = railCarcass(828, 600);
  assert.equal(long.rail.x1 - long.rail.x0, 790);
  const [w] = lengthNote(long);
  assert.ok(w?.level === 'warn' && w.text.includes('790 mm') && w.text.includes('Hettich') && w.text.includes('800 mm'), w?.text);
  assert.deepEqual(centre(long).map((h) => [h.qty, h.unit, h.group]), [[1, 'бр.', 'Обков']]);
  // two long rails, two centre supports: a 3000 mm wardrobe of two one-column carcasses (rails of 1462 mm)
  const wide = buildModel({ type: 'wardrobe', width: 3000, columns: 2, layout: 'hanging' });
  assert.equal(wide.hardware.find((h) => h.name === 'Среден държач за лост')?.qty, 2);
  assert.ok(wide.hardware.some((h) => h.name === 'Лост за закачалки, овален, L=1462 mm'));
  assert.equal(wide.warnings.filter((x) => x.text.includes('среден държач')).length, 2);
});

test('the rail hangs with its top edge 60 mm under the top: room for the hanger hooks, ГОСТ 13025.1-85 „50 min“', () => {
  for (const s of [{}, { layout: 'hanging' }, { width: 3000, columns: 5, height: 1800 }]) {
    const m = buildModel({ type: 'wardrobe', ...s });
    const rails = m.symbols.filter((x) => x.type === 'rail');
    assert.ok(rails.length > 0, JSON.stringify(s));
    for (const r of rails) {
      const top = m.parts.find((p) => p.role === 'top' && p.module === r.module && p.box.min[0] <= r.x0 && p.box.max[0] >= r.x1);
      const underTop = top.box.min[1] - (r.y + r.h / 2);
      assert.equal(Math.round(underTop * 10) / 10, 60, JSON.stringify(s));
      assert.ok(underTop >= 50 + 10);
    }
  }
  // the shelf zone of a rail column ends at the rail's lower edge (RAIL_DROP in carcass.js), 90 mm under the top as before
  assert.equal(RAIL.topEdge + RAIL.h, 90);
});

test('the default wardrobe has no rail warning: 581 mm inside, rails of 475,5 mm', () => {
  const m = buildModel({ type: 'wardrobe' });
  assert.ok(m.symbols.some((s) => s.type === 'rail'));
  assert.deepEqual(m.warnings.filter((w) => w.level !== 'info').map((w) => w.text), []);
  assert.ok(!m.hardware.some((h) => h.name === 'Среден държач за лост'));
  // the thickness of the panels the test relies on
  assert.equal(m.parts.find((p) => p.role === 'side').box.max[0] - m.parts.find((p) => p.role === 'side').box.min[0], T);
});
