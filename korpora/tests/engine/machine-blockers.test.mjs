// Machine safety, the blockers: each risk to the router, the tool or the sheet is an error of the model → cncBlockers →
// no G-code and no DXF (422 on cnc.zip). Each test breaks a good model on purpose. The G-code side: machine-gcode.test.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { registerFixtures, FIXTURE, SMALL_PART_SPEC, outputMeta } from './fixtures.mjs';
import { buildModel } from '../../engine/model.js';
import { TYPES, BUILDERS } from '../../engine/types.js';
import { buildCarcass } from '../../engine/carcass.js';
import { panel, cutSize } from '../../engine/panel.js';
import { registerHingeSystems, registerHinges } from '../../engine/hardware.js';
import { HINGE_SYSTEMS } from '../../engine/data/hinge-systems.js';
import { GROOVE } from '../../engine/joinery.js';
import { nest } from '../../engine/nest.js';
import * as cam from '../../engine/cam.js';
import { toDxf } from '../../engine/dxf.js';
import * as fronts from '../../engine/fronts.js';

// namespace imports: a name the engine does not export yet fails its own test, not the whole file
const { toGcode, cncBlockers, GROOVE_MILL, CUT_LENGTH, grooveLines } = cam;
const { plateSetback } = fronts;

registerFixtures();

const errorsOf = (m) => m.warnings.filter((w) => w.level === 'error').map((w) => w.text);
const gcodeOf = (m, sheet, n) => toGcode(m, sheet, { ...outputMeta(m), sheetCount: n.sheets.length });

// A test-only furniture type: a two-column carcass, then `after` changes it before the model checks run.
function withTestType(after, fn, extra = {}) {
  TYPES.safety = { label: 'Тест', params: [], defaults: {} };
  BUILDERS.safety = (ctx, s) => {
    buildCarcass(ctx, { carcassDecor: s.carcassDecor, frontDecor: s.frontDecor, W: 800, H: 700, D: 400, top: 'between', columns: [{}, {}] });
    after(ctx, s);
  };
  try {
    return fn(buildModel({ type: 'safety', ...extra }));
  } finally {
    delete TYPES.safety;
    delete BUILDERS.safety;
  }
}

// The model's error with this text is a CNC blocker and the G-code and DXF of its sheet refuse it.
function assertBlocks(m, re, partName) {
  const err = errorsOf(m).find((t) => re.test(t));
  assert.ok(err, `no error ${re}: ${m.warnings.map((w) => `${w.level}: ${w.text}`).join(' | ')}`);
  const n = nest(m);
  assert.ok(cncBlockers(m, n).includes(err), 'the error is not a CNC blocker');
  const sheet = partName ? n.sheets.find((s) => s.placements.some((pl) => pl.name === partName)) : n.sheets[0];
  assert.throws(() => gcodeOf(m, sheet, n), /CNC blocked/);
  assert.throws(() => toDxf(m, sheet), /CNC blocked/);
  return err;
}

const side = (ctx) => ctx.parts.find((p) => p.role === 'side');

test('a hole less than 2 mm from the edge of its board is a blocker', () => {
  withTestType(
    (ctx, s) => {
      const p = side(ctx);
      const cut = cutSize(p, true);
      p.features.push({ type: 'hole', u: cut.du0 + 1 + 2.5, v: 200, d: 5, depth: 12, kind: 'system' });
    },
    (m) => assertBlocks(m, /Ø5 „.*“ е на 1 mm от ръба/, side({ parts: m.parts }).name),
  );
});

test('two holes that overlap are a blocker, whatever they are for; one hinge’s cup and its own dowels are not', () => {
  withTestType(
    (ctx) => {
      const p = side(ctx);
      p.features.push({ type: 'hole', u: 300, v: 200, d: 5, depth: 12, kind: 'system' }, { type: 'hole', u: 306, v: 200, d: 5, depth: 12, kind: 'system' });
    },
    (m) => assertBlocks(m, /се застъпват/, side({ parts: m.parts }).name),
  );
  // the default base cabinet: Blum cups with their own Ø8 dowels, and no error
  assert.deepEqual(errorsOf(buildModel({ type: 'base' })), []);
});

test('a hole in or next to a groove is a blocker', () => {
  withTestType(
    (ctx) => {
      const p = ctx.parts.find((q) => q.role === 'side' && q.features.some((f) => f.type === 'groove'));
      const g = p.features.find((f) => f.type === 'groove');
      p.features.push({ type: 'hole', u: (g.u1 + g.u2) / 2, v: g.v1, d: 5, depth: 12, kind: 'system' });
    },
    (m) => assertBlocks(m, /от канала/),
  );
});

test('a blind hole deeper than T − 2 mm is a blocker; it is never cut short to T + 1,5 in silence', () => {
  withTestType(
    (ctx) => side(ctx).features.push({ type: 'hole', u: 300, v: 200, d: 8, depth: 17, kind: 'dowel' }),
    (m) => assertBlocks(m, /глух отвор Ø8 „.*“ е 17 mm дълбок в плоча 18 mm/, side({ parts: m.parts }).name),
  );
  // exactly T − 2 is fine and keeps its depth in the G-code
  withTestType(
    (ctx) => side(ctx).features.push({ type: 'hole', u: 300, v: 200, d: 8, depth: 16, kind: 'dowel' }),
    (m) => {
      assert.deepEqual(errorsOf(m), []);
      const n = nest(m);
      const depths = n.sheets.flatMap((sh) => gcodeOf(m, sh, n).moves.filter((mv) => mv.type === 'drill' && mv.depth === 16));
      assert.ok(depths.length >= 1, 'the 16 mm blind hole is not drilled 16 mm deep');
    },
  );
});

test('a contour deeper than the cutting length of the cutter is a blocker (Ø6 in 25 mm board)', () => {
  assert.deepEqual(CUT_LENGTH, { 6: 25, 8: 28, 10: 35, 12: 35 });
  const m = buildModel({ type: 'desk', tool: 6 });
  assert.ok(m.parts.some((p) => p.stock === 'pb25'), 'the desk has no 25 mm board');
  assertBlocks(m, /Фреза Ø6: режещата дължина е 25 mm, а контурът в .* 25 mm е 25,6 mm дълбок/);
  assert.deepEqual(errorsOf(buildModel({ type: 'desk', tool: 8 })), []);
});

test('small parts: with the onion skin a warning that tells the truth (no tabs); without it a blocker', () => {
  const on = buildModel(SMALL_PART_SPEC);
  const warn = on.warnings.find((w) => /малк/.test(w.text));
  assert.equal(warn?.level, 'warn', JSON.stringify(warn));
  assert.ok(!/таб/.test(warn.text), `the engine makes no tabs: ${warn.text}`);
  assert.deepEqual(errorsOf(on), []);
  const off = buildModel({ ...SMALL_PART_SPEC, onion: false });
  assertBlocks(off, /мал(ък|ки) детайл.* без тънка кора/);
  // a board of 6 mm or less gets no onion skin, so a small part of it is a blocker even with the option on
  withTestType(
    (ctx, s) => panel(ctx, { stock: 'hdf3', decor: s.carcassDecor, key: 'tiny', name: 'Малка плочка', role: 'test', box: { min: [0, -300, 0], max: [40, -100, 3] }, n: '+z', L: 'y' }),
    (m) => assertBlocks(m, /мал(ък|ки) детайл.* без тънка кора/),
  );
});

test('a door thicker or thinner than the hinge system takes is a blocker', () => {
  const ranges = Object.fromEntries(HINGE_SYSTEMS.map((s) => [s.id, [s.door.min, s.door.max]]));
  assert.deepEqual(ranges.gtv_euro35, [16, 18]);
  assert.deepEqual(ranges.hettich_sensys, [15, 24]);
  const gtv = HINGE_SYSTEMS.find((s) => s.id === 'gtv_euro35');
  registerHingeSystems([{ ...gtv, id: 'fx_thin', door: { min: 15, max: 17, note: 'тест' } }]);
  registerHinges([{ id: 'fx:thin', system: 'fx_thin', name: 'Панта (тест), за врата до 17 mm', brand: 'Test', fixing: 'screw', variants: {} }]);
  assertBlocks(buildModel({ type: 'base', hinge: 'fx:thin' }), /Врата: 18 mm — .* е за врати 15–17 mm/);
});

test('the groove mill is as wide as the back groove; a narrower groove is a blocker, a wider one is cut in passes', () => {
  assert.equal(GROOVE.width, GROOVE_MILL.d);
  const m = buildModel({ type: 'base' });
  const part = m.parts.find((p) => p.features.some((f) => f.type === 'groove'));
  assert.ok(m.parts.every((p) => p.features.every((f) => f.type !== 'groove' || f.w === GROOVE_MILL.d)));
  const groove = part.features.find((f) => f.type === 'groove');
  groove.w = 3;
  assert.ok(cncBlockers(m, nest(m)).some((b) => b.startsWith(`${part.name}: канал 3 mm`)));
  // a 6 mm groove with the Ø4 mill: two passes, its edges at ±1 mm from the middle — the groove is 6 mm wide
  groove.w = 6;
  assert.ok(!cncBlockers(m, nest(m)).some((b) => b.startsWith(`${part.name}: канал`)));
  const lines = grooveLines({ X1: 0, Y1: 0, X2: 100, Y2: 0, w: 6 }, GROOVE_MILL);
  assert.deepEqual(lines.map((l) => l.Y1), [-1, 1]);
});

test('hinge data: no Ø5 system holes for a Blum plate above 3 mm; Hettich Fix dowels Ø10 × 6; the inset plate setback', () => {
  const blum = HINGE_SYSTEMS.find((s) => s.id === 'blum_clip_top');
  assert.deepEqual(blum.plate.systemScrewPlates, [0, 3]);
  registerHingeSystems([{ ...blum, id: 'fx_blum9', plate: { ...blum.plate, plates: [9] } }]);
  registerHinges([{ id: 'fx:blum9', system: 'fx_blum9', name: 'Панта (тест), планка 9', brand: 'Test', fixing: 'dowel', variants: {} }]);
  const m = buildModel({ type: 'base', hinge: 'fx:blum9' });
  const err = errorsOf(m).find((t) => /планка 9 mm/.test(t));
  assert.ok(err, m.warnings.map((w) => w.text).join(' | '));
  assert.ok(!m.parts.some((p) => p.features.some((f) => f.kind === 'plate')), 'Ø5 plate holes for a plate without system screws');
  const fix = buildModel({ type: 'base', hinge: 'fx:hettich-fix' });
  const dowels = fix.parts.flatMap((p) => p.features.filter((f) => f.kind === 'cup-dowel'));
  assert.ok(dowels.length > 0 && dowels.every((f) => f.d === 10 && f.depth === 6), JSON.stringify(dowels[0]));
  assert.equal(plateSetback(blum, 'full', 18), 37);
  assert.equal(plateSetback(blum, 'inset', 18), null, 'no inset data, no number');
  assert.equal(plateSetback({ plate: { setback: 37, insetExtra: 1.5 } }, 'inset', 18), 56.5);
  assert.ok(FIXTURE.hinges.some((h) => h.id === 'fx:hettich-fix'));
});
