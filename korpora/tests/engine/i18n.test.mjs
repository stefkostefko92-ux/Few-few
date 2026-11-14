// The engine in English and Italian (engine/i18n.js): the catalogues mirror Bulgarian key for key with the same
// placeholders, and a model built in another language — its parts, warnings, hardware, CSV, drawings, CNC blockers and
// the comments of the CNC files — carries no Bulgarian word and no unfilled placeholder. The hardware fixtures are
// renamed to ASCII here: a shop's product keeps the name the shop sells it by (t.of), the engine's own words do not.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { OUTPUT_SPECS, FIXTURE } from './fixtures.mjs';
import { paramVariants } from './check.mjs';
import { CATALOGS, ENGINE_LANGS, translator } from '../../engine/i18n.js';
import { registerHingeSystems, registerHinges, registerHandles, registerSlideSystems, registerSlides, registerBedFittings } from '../../engine/hardware.js';
import { buildModel, catalogDrift } from '../../engine/model.js';
import { TYPE_ORDER, typeText, typeTextKeys } from '../../engine/types.js';
import { buildBom, cutListCsv, hardwareCsv } from '../../engine/bom.js';
import { drillCsv, hardwareCards } from '../../engine/drill.js';
import { nest } from '../../engine/nest.js';
import { toGcode, cncBlockers } from '../../engine/cam.js';
import { toDxf } from '../../engine/dxf.js';
import { drawingAssembly } from '../../engine/drawing-assembly.js';
import { drawingPart, drawingSheets } from '../../engine/drawing-part.js';

const CYRILLIC = /[Ѐ-ӿ]/;
const LEFTOVER = /[Ѐ-ӿ]|\{[a-zA-Z]+\}|undefined|NaN/;
const OTHERS = ENGINE_LANGS.filter((l) => l !== 'bg');
const holes = (s) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');
const ascii = (o) => JSON.parse(JSON.stringify(o, (k, v) => (typeof v === 'string' ? v.replace(/[Ѐ-ӿ]+/g, 'X') : v)));
const unstyled = (svg) => svg.replace(/<style>[\s\S]*?<\/style>/g, '');

registerHingeSystems(FIXTURE.hingeSystems);
registerHinges(ascii(FIXTURE.hinges));
registerHandles(ascii(FIXTURE.handles));
registerSlideSystems(FIXTURE.slideSystems);
registerSlides(ascii(FIXTURE.slides));
registerBedFittings(ascii(FIXTURE.bedFittings));

const meta = { product: 'Korpora', hash: 'a'.repeat(64), owner: 'Carbon Stealth VCC', date: '2026-11-14' };

function clean(where, text) {
  const m = String(text).match(new RegExp(`.{0,50}(?:${LEFTOVER.source}).{0,50}`));
  assert.equal(m, null, `${where}: ${m?.[0]}`);
}

test('the catalogues: every Bulgarian key and every word of the type forms, the same placeholders, no Cyrillic', () => {
  const bg = CATALOGS.bg;
  const typeKeys = typeTextKeys();
  for (const lang of OTHERS) {
    const own = CATALOGS[lang];
    const want = new Set([...Object.keys(bg), ...typeKeys]);
    assert.deepEqual([...want].filter((k) => !(k in own)), [], `${lang}: missing keys`);
    assert.deepEqual(Object.keys(own).filter((k) => !want.has(k)), [], `${lang}: keys Bulgarian does not have`);
    for (const [k, v] of Object.entries(own)) {
      assert.equal(typeof v, 'string', `${lang} ${k}`);
      assert.ok(v.trim(), `${lang} ${k}: empty`);
      assert.ok(!CYRILLIC.test(v), `${lang} ${k}: ${v}`);
      if (k in bg) assert.equal(holes(v), holes(bg[k]), `${lang} ${k}: placeholders`);
    }
  }
  // Bulgarian has no type keys: its form is engine/types.js itself
  assert.deepEqual(typeKeys.filter((k) => k in bg), []);
});

test('the translator: Bulgarian for an unknown language, numbers, counts, catalogue values', () => {
  assert.equal(translator('xx').lang, 'bg');
  assert.equal(translator(undefined).lang, 'bg');
  assert.equal(translator('bg').num(3.5), '3,5');
  assert.equal(translator('it').num(3.5), '3,5');
  assert.equal(translator('en').num(3.5), '3.5');
  const en = translator('en');
  assert.match(en.count(1, 'w.small'), /^1 small part /);
  assert.match(en.count(4, 'w.small'), /^4 small parts /);
  assert.equal(en.of({ name: 'Панта', name_en: 'Hinge' }), 'Hinge');
  assert.equal(en.of({ name: 'Blum 71B3550' }), 'Blum 71B3550');
  assert.throws(() => en('no.such.key'), /no text/);
});

test('the type forms in every language: labels and options, numbers left as they are', () => {
  for (const lang of OTHERS) {
    const t = translator(lang);
    for (const type of TYPE_ORDER) {
      const form = typeText(type, t);
      clean(`${lang} ${type} label`, form.label);
      for (const p of form.params) {
        clean(`${lang} ${type}.${p.key}`, p.label);
        for (const [v, l] of p.options ?? []) clean(`${lang} ${type}.${p.key}=${v}`, l);
      }
    }
  }
  assert.equal(typeText('kitchen').label, 'Кухня');
});

for (const lang of OTHERS) {
  test(`${lang}: every output of the output specs speaks ${lang}`, () => {
    for (const spec of OUTPUT_SPECS) {
      const label = `${lang} ${JSON.stringify(spec)}`;
      const m = buildModel(spec, { lang });
      assert.equal(m.lang, lang);
      clean(`${label} parts`, JSON.stringify(m.parts.map((p) => [p.name, p.module, p.edges])));
      clean(`${label} warnings`, JSON.stringify(m.warnings));
      clean(`${label} hardware`, JSON.stringify(m.hardware));
      clean(`${label} symbols`, JSON.stringify([m.symbols, m.groups, m.runs]));
      clean(`${label} drift`, JSON.stringify(catalogDrift({ ...spec, hinge: 'gone', handle: 'gone' }, m)));
      const bom = buildBom(m);
      clean(`${label} cut.csv`, cutListCsv(bom));
      clean(`${label} hardware.csv`, hardwareCsv(bom));
      clean(`${label} drill.csv`, drillCsv(m));
      clean(`${label} cards`, JSON.stringify(hardwareCards(m)));
      const nesting = nest(m);
      const blockers = cncBlockers(m, nesting);
      clean(`${label} blockers`, JSON.stringify([blockers, nesting.errors ?? []]));
      clean(`${label} assembly`, unstyled(drawingAssembly(m, meta)));
      for (const { part } of drawingSheets(m).parts) clean(`${label} ${part.id}`, unstyled(drawingPart(m, meta, part.id)));
      if (!blockers.length && nesting.sheets[0]) {
        clean(`${label} gcode`, toGcode(m, nesting.sheets[0], meta));
        clean(`${label} dxf`, toDxf(m, nesting.sheets[0], meta));
      }
    }
  });

  test(`${lang}: the parameter variants — parts, warnings and the CSV`, () => {
    for (const type of TYPE_ORDER) {
      for (const [name, spec] of paramVariants(type)) {
        const m = buildModel(spec, { lang });
        const bom = buildBom(m);
        clean(`${lang} ${name}`, JSON.stringify([m.parts.map((p) => p.name), m.warnings, m.hardware]) + cutListCsv(bom) + hardwareCsv(bom) + drillCsv(m));
      }
    }
  });
}

test('the same model in every language: only the words differ', () => {
  for (const spec of OUTPUT_SPECS) {
    const shape = (m) => JSON.stringify(m.parts.map((p) => [p.id, p.L, p.W, p.T, p.role, p.box, p.bands, p.features.map((f) => [f.kind, f.u, f.v, f.d]), p.edgeOps.length]));
    const bg = buildModel(spec);
    for (const lang of OTHERS) {
      const other = buildModel(spec, { lang });
      assert.equal(shape(other), shape(bg), `${lang} ${JSON.stringify(spec)}`);
      assert.equal(other.warnings.length, bg.warnings.length, `${lang} ${JSON.stringify(spec)}: warnings`);
      assert.deepEqual(other.warnings.map((w) => w.level), bg.warnings.map((w) => w.level));
      // the cut and the CNC programs are the same: the sheets, the places on them, the moves (comments aside)
      const [nb, no] = [nest(bg), nest(other)];
      const places = (n) => JSON.stringify(n.sheets.map((sh) => sh.placements.map((p) => [p.partId, p.x, p.y, p.w, p.h, p.rot])));
      assert.equal(places(no), places(nb), `${lang} ${JSON.stringify(spec)}: nesting`);
      if (!cncBlockers(bg, nb).length) {
        const moves = (m, n) => n.sheets.map((sh) => toGcode(m, sh, meta).text.replace(/\(.*?\)/g, '')).join('\n');
        assert.equal(moves(other, no), moves(bg, nb), `${lang} ${JSON.stringify(spec)}: G-code`);
      }
    }
  }
});
