// The slide makers' limits on the drawer (engine/data/slide-systems.js): GTV H45's drawer no wider than its slide and
// the depth it needs, Blum's stabilisation set up to KB 1400. Runs on the base catalog.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { registerCatalog, baseCatalogData } from '../../engine/catalog.js';
import { buildModel } from '../../engine/model.js';
import { nest } from '../../engine/nest.js';
import { cncBlockers } from '../../engine/cam.js';
import { TYPES } from '../../engine/types.js';

const catalog = registerCatalog(baseCatalogData());
const SLIDES = catalog.slideFamilies.map((s) => s.id);
const GTV = SLIDES.find((s) => s.includes('gtv_h45'));
const TANDEM = SLIDES.find((s) => s.includes('blum_tandem_560h'));

const errorsOf = (m) => m.warnings.filter((w) => w.level === 'error').map((w) => w.text);
const byRole = (m, role) => m.parts.filter((p) => p.role === role);
const blockers = (m) => cncBlockers(m, nest(m));
const texts = (m) => m.warnings.map((w) => `[${w.level}] ${w.text}`).join(' | ');

// Outer width of each drawer box (sideA outer face to sideB outer face) and its slide's nominal length NL.
function drawerBoxes(m) {
  return m.groups
    .filter((g) => g.type === 'drawer')
    .map((g) => {
      const [, sideA, sideB] = g.partIds.map((id) => m.parts.find((p) => p.id === id));
      return { width: Math.round((sideB.box.max[0] - sideA.box.min[0]) * 10) / 10, length: sideA.box.max[2] - sideA.box.min[2] };
    });
}

test('GTV H45: a drawer wider than the nominal slide length gets the maker’s warning, a narrower one does not', () => {
  const tooWide = (m) => m.warnings.filter((w) => w.text.includes('не бива да е по-широко от водача'));
  // GTV: the box is as long as NL (drawerLength = NL). The wide ones are the defaults before they followed GTV's rule.
  const wide = [{ type: 'kitchen', drawerModuleWidth: 600 }, { type: 'chest', columns: 1 }, { type: 'nightstand', width: 450 }, { type: 'tv', width: 1800, columns: 3 }, { type: 'wallunit', sideWidth: 600 }, { type: 'base', fronts: 'drawers', width: 1200 }];
  const narrow = [{ type: 'kitchen' }, { type: 'chest' }, { type: 'nightstand' }, { type: 'tv' }, { type: 'wallunit' }, { type: 'wardrobe' }, { type: 'nightstand', width: 350 }, { type: 'base', fronts: 'drawers', width: 400 }];
  for (const extra of [...wide, ...narrow]) {
    const spec = { ...extra, slide: GTV };
    const label = JSON.stringify(spec);
    const m = buildModel(spec);
    const boxes = drawerBoxes(m);
    assert.ok(boxes.length > 0, `${label}: no drawers`);
    const over = boxes.filter((b) => b.width > b.length);
    assert.equal(over.length > 0, wide.includes(extra), `${label}: ${JSON.stringify(boxes)}`);
    const notes = tooWide(m);
    if (over.length) {
      assert.ok(notes.length > 0, `${label}: no warning — ${texts(m)}`);
      for (const n of notes) assert.equal(n.level, 'warn', n.text);
      const { width, length } = over[0];
      assert.ok(notes.some((n) => n.text.includes(`${String(width).replace('.', ',')} mm`) && n.text.includes(`${length} mm`)), notes.map((n) => n.text).join(' | '));
      // "add a column" only for a type whose form has columns (chest, TV unit), not for the base cabinet or the kitchen
      const columns = TYPES[spec.type].params.some((p) => p.key === 'columns');
      for (const n of notes) assert.equal(n.text.includes('Добавете колона'), columns, n.text);
    } else assert.deepEqual(notes, [], label);
    // a recommendation from the slide maker, not a blocker
    assert.deepEqual(errorsOf(m), [], label);
    assert.deepEqual(blockers(m), [], label);
  }
  // concealed slides have no such rule
  assert.deepEqual(tooWide(buildModel({ type: 'chest', columns: 1, slide: TANDEM })), []);
});

test('GTV H45 needs NL + 3 of inner depth: Karta techniczna 2020, p. 147 (SKL = NL … NL + 3)', () => {
  // base cabinet D − 19 inside: 522 → 503 mm takes NL 500, 521 → 502 mm only NL 450
  const nl = (depth) => buildModel({ type: 'base', fronts: 'drawers', depth, slide: GTV }).hardware.find((h) => h.key.startsWith(`slide:${GTV}:`))?.key.split(':').at(-1);
  assert.deepEqual([nl(521), nl(522)], ['450', '500']);
});

test('Blum TANDEM: a cabinet wider than KB 1400 gets a warning — Blum’s side stabilisation set stops there', () => {
  const stab = (m) => m.warnings.filter((w) => w.text.includes('странична стабилизация'));
  for (const [extra, expected] of [
    [{ type: 'chest', width: 1600, columns: 1 }, true],
    [{ type: 'chest', width: 1410, columns: 1 }, true],
    [{ type: 'chest', width: 1400, columns: 1 }, false],
    [{ type: 'chest', width: 1600, columns: 2 }, false],
    [{ type: 'base', fronts: 'drawers', width: 1200 }, false],
  ]) {
    const spec = { ...extra, slide: TANDEM };
    const label = JSON.stringify(spec);
    const m = buildModel(spec);
    assert.ok(byRole(m, 'drawer-side').length > 0, `${label}: no drawers`);
    const notes = stab(m);
    assert.equal(notes.length > 0, expected, `${label}: ${texts(m)}`);
    for (const n of notes) assert.ok(n.level === 'warn' && n.text.includes('1400 mm') && n.text.includes('Добавете колона'), n.text);
    assert.deepEqual(errorsOf(m), [], label);
    assert.deepEqual(blockers(m), [], label);
  }
  // side-mount slides carry no stabiliser
  assert.deepEqual(stab(buildModel({ type: 'chest', width: 1600, columns: 1, slide: GTV })), []);
});
