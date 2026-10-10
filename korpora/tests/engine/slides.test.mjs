// The slide makers' limits on the drawer and Blum's side stabilisation (engine/data/slide-systems.js,
// engine/stabiliser.js): GTV H45's drawer no wider than its slide, the stabiliser kit up to KB 1400 and when the program
// fits it — the thresholds, the depth it costs, TANDEM's TIP-ON exclusion, the hardware line and the room under the
// runner. Runs on the base catalog, plus a MOVENTO family as a shop catalog would add it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { registerCatalog, baseCatalogData } from '../../engine/catalog.js';
import { registerSlides } from '../../engine/hardware.js';
import { buildModel } from '../../engine/model.js';
import { nest } from '../../engine/nest.js';
import { cncBlockers } from '../../engine/cam.js';
import { TYPES } from '../../engine/types.js';

const catalog = registerCatalog(baseCatalogData());
const SLIDES = catalog.slideFamilies.map((s) => s.id);
const GTV = SLIDES.find((s) => s.includes('gtv_h45'));
const TANDEM = SLIDES.find((s) => s.includes('blum_tandem_560h'));
const MOVENTO = 'test:movento';
registerSlides([{ id: MOVENTO, system: 'blum_movento_760h', brand: 'Blum', name: 'MOVENTO (тест)', products: {} }]);

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

// The warning that no kit is made for this cabinet width.
const overKB = (m) => m.warnings.filter((w) => w.text.includes('комплектът е за шкафове до'));
const kitLines = (m) => m.hardware.filter((h) => h.name.startsWith('Странична стабилизация'));
const kitNote = (m) => m.warnings.filter((w) => w.text.includes('добавена е странична стабилизация'));

test('Blum TANDEM: a cabinet wider than KB 1400 gets a warning and no kit — Blum’s side stabilisation set stops there', () => {
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
    const notes = overKB(m);
    assert.equal(notes.length > 0, expected, `${label}: ${texts(m)}`);
    for (const n of notes) assert.ok(n.level === 'warn' && n.text.includes('1400 mm') && n.text.includes('Добавете колона'), n.text);
    // over KB 1400 nothing is fitted; at or under it these wide drawers get the kit
    assert.equal(kitLines(m).length > 0, !expected, `${label}: ${kitLines(m).map((h) => h.name).join(' | ')}`);
    assert.deepEqual(errorsOf(m), [], label);
    assert.deepEqual(blockers(m), [], label);
  }
  // side-mount slides carry no stabiliser
  const gtv = buildModel({ type: 'chest', width: 1600, columns: 1, slide: GTV });
  assert.deepEqual([overKB(gtv), kitLines(gtv), kitNote(gtv)], [[], [], []]);
});

test('Blum stabiliser: fitted from KB 900 mm or from SKW 1,5 × NL, not below either', () => {
  // KB alone: NL 600 (base 650 deep, inner 631), SKW stays under 900 = 1,5 × 600
  for (const [width, on] of [[899, false], [900, true]]) {
    const m = buildModel({ type: 'base', fronts: 'drawers', depth: 650, width, slide: TANDEM });
    assert.equal(kitLines(m).length > 0, on, `KB ${width}: ${texts(m)}`);
    if (on) assert.ok(kitNote(m)[0]?.text.includes('шкафът е 900 mm') && kitNote(m)[0].level === 'info', texts(m));
  }
  // the ratio alone: NL 400 (base 450 deep, inner 431), KB under 900; SKW = width − 36 − 42
  for (const [width, on] of [[677, false], [678, true]]) {
    const m = buildModel({ type: 'base', fronts: 'drawers', depth: 450, width, slide: TANDEM });
    assert.equal(kitLines(m).length > 0, on, `SKW ${width - 78}: ${texts(m)}`);
    if (on) assert.ok(kitNote(m)[0]?.text.includes('вътрешната ширина на чекмеджето е 600 mm при водач NL 400 mm'), texts(m));
  }
  // a standard 600 mm cabinet with NL 500 gets nothing, and the defaults never get one
  assert.deepEqual(kitLines(buildModel({ type: 'base', fronts: 'drawers', slide: TANDEM })), []);
});

test('Blum stabiliser: the kit by NL, one set per drawer, with Blum’s cutting sizes', () => {
  const cases = [
    // [spec, sku, shaft (LW − 254 / − 315), rack (NL + 12 / + 10), drawers]
    [{ type: 'base', fronts: 'drawers', depth: 450, width: 700, slide: TANDEM }, 'ZST.410TV', 664 - 254, 400 + 12, 3],
    [{ type: 'base', fronts: 'drawers', depth: 500, width: 1000, drawers: 4, slide: TANDEM }, 'ZST.600TV', 964 - 254, 450 + 12, 4],
    [{ type: 'base', fronts: 'drawers', depth: 650, width: 1000, slide: MOVENTO }, 'ZS7M600MU', 964 - 315, 600 + 10, 3],
  ];
  for (const [spec, sku, shaft, rack, drawers] of cases) {
    const m = buildModel(spec);
    const label = JSON.stringify(spec);
    const lines = kitLines(m);
    assert.equal(lines.length, 1, `${label}: ${lines.map((h) => h.name).join(' | ')}`);
    const [h] = lines;
    assert.equal(h.sku, sku, label);
    assert.equal(h.qty, drawers, label);
    assert.equal(byRole(m, 'drawer-front').length, drawers, label);
    assert.ok(h.name.includes(`вал ${shaft} mm`) && h.name.includes(`зъбна рейка ${rack} mm`), h.name);
    assert.deepEqual([h.unit, h.group, h.brand], ['компл.', 'Обков', 'Blum'], label);
    assert.deepEqual(errorsOf(m), [], label);
    assert.deepEqual(blockers(m), [], label);
  }
});

test('Blum stabiliser: when NL + 15 does not fit, the longer slide stays without it and the warning says how much deeper', () => {
  // base 433 deep: inner 414 → NL 400 (needs 403), with the kit 415 — 1 mm short; 434 deep: it fits
  const short = buildModel({ type: 'base', fronts: 'drawers', depth: 433, width: 800, slide: TANDEM });
  assert.deepEqual(kitLines(short), []);
  const w = short.warnings.find((x) => x.text.includes('задълбочете шкафа с 1 mm'));
  assert.ok(w?.level === 'warn' && w.text.includes('415 mm') && w.text.includes('414 mm') && w.text.includes('NL 400 mm'), texts(short));
  assert.ok(short.hardware.some((h) => h.key === `slide:${TANDEM}:400`), 'the slide stays NL 400');
  const fits = buildModel({ type: 'base', fronts: 'drawers', depth: 434, width: 800, slide: TANDEM });
  assert.equal(kitLines(fits).length, 1, texts(fits));
  assert.ok(fits.hardware.some((h) => h.key === `slide:${TANDEM}:400`));
  assert.ok(!fits.warnings.some((x) => x.text.includes('задълбочете')), texts(fits));
});

test('Blum stabiliser: TANDEM’s kit is not fitted to a front without a handle (TIP-ON), MOVENTO’s is', () => {
  const tandem = buildModel({ type: 'base', fronts: 'drawers', width: 1000, handle: 'none', slide: TANDEM });
  assert.deepEqual(kitLines(tandem), []);
  const w = tandem.warnings.find((x) => x.text.includes('не е съвместим с TIP-ON'));
  assert.ok(w?.level === 'warn' && w.text.includes('ZST.600TV') && w.text.includes('TD-127/3, стр. 21'), texts(tandem));
  const movento = buildModel({ type: 'base', fronts: 'drawers', depth: 650, width: 1000, handle: 'none', slide: MOVENTO });
  assert.equal(kitLines(movento).length, 1, texts(movento));
  assert.ok(!movento.warnings.some((x) => x.text.includes('TIP-ON')), texts(movento));
});

// Height of the lowest drawer's runner over the carcass bottom: the screw axis of the slide holes and the underside of
// the drawer bottom, over the top face of the bottom panel.
function lowestRunner(m) {
  const floor = byRole(m, 'bottom')[0].box.max[1];
  const axis = Math.min(...m.parts.flatMap((p) => p.features.filter((f) => f.kind === 'slide').map((f) => f.world[1])));
  const drawerBottom = Math.min(...byRole(m, 'drawer-bottom').map((p) => p.box.min[1]));
  return { axis: Math.round((axis - floor) * 10) / 10, bottom: Math.round((drawerBottom - floor) * 10) / 10 };
}

test('room under the runner: Blum’s 37 / 27,5 mm on TANDEM, 3 mm more with its stabiliser; MOVENTO 38 / 28,5 either way', () => {
  // TD-127/3 p. 5: „37*“ to the screw axis and „min 27.5*“ to the drawer bottom, „* +3 mm with side stabilisation“
  const without = buildModel({ type: 'base', fronts: 'drawers', depth: 433, width: 800, slide: TANDEM });
  const withKit = buildModel({ type: 'base', fronts: 'drawers', depth: 434, width: 800, slide: TANDEM });
  assert.deepEqual(lowestRunner(without), { axis: 37, bottom: 27.5 });
  assert.deepEqual(lowestRunner(withKit), { axis: 40, bottom: 30.5 });
  // the holes of the lowest drawer move up with it, those of the drawers above stay
  const slideYs = (m) => [...new Set(byRole(m, 'side')[0].features.filter((f) => f.kind === 'slide').map((f) => f.world[1]))].sort((a, b) => a - b);
  const [a, b] = [slideYs(without), slideYs(withKit)];
  assert.equal(a.length, 3);
  assert.deepEqual(b.map((y, k) => Math.round((y - a[k]) * 10) / 10), [3, 0, 0]);
  for (const m of [without, withKit]) {
    assert.deepEqual(errorsOf(m), []);
    assert.deepEqual(blockers(m), []);
  }
  // TD-132/1 p. 5: „min 38*“, „min 28.5“; the MOVENTO kit asks for no more room under the runner
  for (const width of [800, 1000]) {
    const m = buildModel({ type: 'base', fronts: 'drawers', depth: 650, width, slide: MOVENTO });
    assert.deepEqual(lowestRunner(m), { axis: 38, bottom: 28.5 }, `MOVENTO ${width}: ${texts(m)}`);
  }
  // a side-mount slide keeps its box 6 mm over the bottom, the slide's lower edge with it (наш избор)
  const gtv = buildModel({ type: 'base', fronts: 'drawers', slide: GTV });
  assert.equal(Math.min(...byRole(gtv, 'drawer-side').map((p) => p.box.min[1])) - byRole(gtv, 'bottom')[0].box.max[1], 6);
});
