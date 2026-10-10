// The defaults follow the slide makers' rules (engine/types.js): with GTV H45 — the default slide — no drawer box is
// wider than its slide, so every type opens without a warning (notes are allowed), and the kitchen gets its drawers in
// a module of its own width.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { registerCatalog, baseCatalogData } from '../../engine/catalog.js';
import { buildModel, normalizeSpec } from '../../engine/model.js';
import { TYPES, TYPE_ORDER, typeDims } from '../../engine/types.js';

const catalog = registerCatalog(baseCatalogData());
const SLIDES = catalog.slideFamilies.map((s) => s.id);

test('every type at its defaults: no warning and no error, with each documented slide (GTV H45 first)', () => {
  assert.ok(SLIDES[0].includes('gtv_h45'), 'GTV H45 is the default slide');
  assert.equal(normalizeSpec({}).slide, SLIDES[0]);
  for (const slide of SLIDES) {
    for (const type of TYPE_ORDER) {
      const m = buildModel({ type, slide });
      const bad = m.warnings.filter((w) => w.level !== 'info');
      assert.deepEqual(bad.map((w) => `[${w.level}] ${w.text}`), [], `${type} ${slide}`);
    }
  }
});

test('kitchen: the drawer module has its own width, the door modules keep theirs', () => {
  const width = TYPES.kitchen.params.find((p) => p.key === 'moduleWidth');
  const drawers = TYPES.kitchen.params.find((p) => p.key === 'drawerModuleWidth');
  assert.ok(drawers, 'the form has the parameter');
  assert.deepEqual([drawers.min, drawers.max, drawers.step, drawers.unit], [width.min, width.max, width.step, width.unit]);
  assert.deepEqual([TYPES.kitchen.defaults.moduleWidth, TYPES.kitchen.defaults.drawerModuleWidth], [600, 500]);

  const m = buildModel({ type: 'kitchen' });
  const carcass = (mod) => m.parts.filter((p) => p.module === mod && (p.role === 'side' || p.role === 'bottom'));
  const span = (mod) => {
    const ps = carcass(mod);
    return [Math.min(...ps.map((p) => p.box.min[0])), Math.max(...ps.map((p) => p.box.max[0]))];
  };
  // М1 600 with doors, М2 500 with drawers, М3 and М4 600 with doors; each wall cabinet right above its base module
  assert.deepEqual(['М1', 'М2', 'М3', 'М4'].map(span), [[0, 600], [600, 1100], [1100, 1700], [1700, 2300]]);
  assert.deepEqual(['Г1', 'Г2', 'Г3', 'Г4'].map(span), [[0, 600], [600, 1100], [1100, 1700], [1700, 2300]]);
  assert.deepEqual([...new Set(m.parts.filter((p) => p.role === 'drawer-front').map((p) => p.module))], ['М2']);
  assert.equal(m.parts.filter((p) => p.role === 'door' && p.module === 'М1').length, 2, 'a 600 mm module keeps two doors');
  assert.equal(m.parts.filter((p) => p.role === 'door' && p.module === 'Г2').length, 1, 'a 500 mm module has one');
  // the overall size, the worktop line and the worktop itself are the sum of the modules
  assert.deepEqual(typeDims('kitchen', m.spec), { W: 2300, H: 2170, D: 600 });
  assert.ok(m.hardware.some((h) => h.name === 'Работен плот 38 mm, 2300 × 600 mm (поръчка)'));
  const top = m.symbols.find((s) => s.type === 'worktop');
  assert.deepEqual([top.x0, top.x1], [0, 2300]);
  // six modules: drawers in the 2nd and the 5th
  const six = buildModel({ type: 'kitchen', modules: 6, moduleWidth: 800, drawerModuleWidth: 450 });
  assert.deepEqual([...new Set(six.parts.filter((p) => p.role === 'drawer-front').map((p) => p.module))], ['М2', 'М5']);
  assert.equal(typeDims('kitchen', six.spec).W, 4 * 800 + 2 * 450);
});

test('a saved kitchen without the drawer module width opens with the default one', () => {
  const saved = { type: 'kitchen', modules: 4, moduleWidth: 600, height: 860, depth: 560, wallHeight: 720, mount: 1450 };
  assert.equal(normalizeSpec(saved).drawerModuleWidth, 500);
  assert.equal(normalizeSpec({ ...saved, drawerModuleWidth: 604 }).drawerModuleWidth, 600, 'on its own 10 mm step');
  assert.equal(normalizeSpec({ ...saved, drawerModuleWidth: 'x' }).drawerModuleWidth, 400, 'garbage is clamped, not trusted');
  assert.equal(buildModel(saved).parts.filter((p) => p.role === 'drawer-front').length, 3);
});

test('wall unit: a wide TV part has the drawers in two narrower end columns and two open ones between them', () => {
  const m = buildModel({ type: 'wallunit' });
  const tv = m.parts.filter((p) => p.module === 'ТВ');
  assert.equal(tv.filter((p) => p.role === 'partition').length, 3);
  const fronts = tv.filter((p) => p.role === 'drawer-front');
  assert.equal(fronts.length, 4);
  const widths = [...new Set(fronts.map((p) => Math.round(p.box.max[0] - p.box.min[0])))];
  assert.equal(widths.length, 1, 'both end columns alike');
  assert.equal(tv.filter((p) => p.role === 'shelf').length, 2);
  // a narrow one (1600 mm between the side columns) keeps two drawer columns
  const narrow = buildModel({ type: 'wallunit', sideWidth: 600 });
  assert.equal(narrow.parts.filter((p) => p.module === 'ТВ' && p.role === 'partition').length, 1);
});
