// What the CNC must never get from a free carcass („Свободен корпус“): two holes in one another, a screw that cannot
// be driven, a size under its minimum, an exception instead of an error — in the cases the CAM and code reviews found
// and in a seeded sweep of random layouts, normalized from anything as from the form. Every such case is an error
// (the CNC files are withheld), or the generator moves off it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { registerFixtures, outputMeta } from './fixtures.mjs';
import { checkModel, assertNoHoleOnHole, blockedScrews } from './check.mjs';
import { buildModel, normalizeSpec, checkHoles } from '../../engine/model.js';
import { DOWEL } from '../../engine/joinery.js';
import { createCtx, panel, holeThrough } from '../../engine/panel.js';
import { drawingAssembly } from '../../engine/drawing-assembly.js';
import { nest } from '../../engine/nest.js';
import { cncBlockers } from '../../engine/cam.js';

registerFixtures();

const T = 18;
const custom = (over = {}) => ({ type: 'custom', width: 1200, height: 2000, depth: 600, legs: 0, top: 'between', ...over });
const col = (cells, fronts = [], w = null) => ({ w, cells, fronts });
const open = { h: null, fill: 'open', n: 0 };
const byKey = (m, key) => m.parts.find((p) => p.key === key);
const errors = (m) => m.warnings.filter((w) => w.level === 'error').map((w) => w.text);
const withheld = (m) => cncBlockers(m, nest(m)).length > 0;
const ends = (m, key, kind) => byKey(m, key).edgeOps.filter((e) => e.kind === kind).map((e) => e.edge).sort();
const count = (m, key, kind, edge) => byKey(m, key).edgeOps.filter((e) => e.kind === kind && e.edge === edge).reduce((a, e) => a + e.count, 0);

test('fixed shelves at one height on both faces of a partition: the first screwed, the next doweled and glued over its screw heads', () => {
  const cells = [{ h: 700, fill: 'open' }, open];
  const m = buildModel(custom({ grid: { columns: [col(cells), col(cells), col(cells)] } }));
  assert.deepEqual(errors(m), []);
  assert.deepEqual(ends(m, 'c1div1', 'confirmat'), ['+x', '-x']);
  for (const key of ['c2div1', 'c3div1']) {
    assert.deepEqual(ends(m, key, 'confirmat'), ['+x'], `${key}: screwed to the panel on its right`);
    assert.deepEqual(ends(m, key, 'dowel'), ['-x'], `${key}: doweled to the partition on its left`);
  }
  for (const key of ['part1', 'part2']) assert.ok(byKey(m, key).features.some((f) => f.kind === 'dowel' && f.d === DOWEL.d && f.through), key);
  assert.equal(blockedScrews(m), 0, 'every screw can be driven');
  assert.ok(m.hardware.some((h) => /Шкант/.test(h.name)), 'the dowels are in the hardware list');
  const notes = drawingAssembly(m, outputMeta(m));
  assert.ok(/на шкантове 8×35 с лепило/.test(notes) && /след като другият е завит/.test(notes), 'the assembly drawing gives the order');
  checkModel(m, 'same height');
  assertNoHoleOnHole(m, 'same height');
  assert.equal(withheld(m), false);
});

test('fixed shelves a few millimetres apart across a partition: dowels while the other shelf hides their holes, an error where neither joint can be made', () => {
  const pair = (h2) => buildModel(custom({ grid: { columns: [col([{ h: 700, fill: 'open' }, open]), col([{ h: h2, fill: 'open' }, open])] } }));
  const near = pair(704);
  assert.deepEqual(errors(near), []);
  assert.deepEqual(ends(near, 'c2div1', 'dowel'), ['-x']);
  // the through holes of the dowels come out behind the fixed shelf on the other face
  const a = byKey(near, 'c1div1');
  for (const f of byKey(near, 'part1').features.filter((x) => x.kind === 'dowel')) {
    assert.ok(f.world[1] - DOWEL.d / 2 >= a.box.min[1] && f.world[1] + DOWEL.d / 2 <= a.box.max[1], `dowel hole at ${f.world[1]} outside ${a.box.min[1]}–${a.box.max[1]}`);
  }
  const mid = pair(710);
  assert.ok(errors(mid).some((t) => t.startsWith('Неподвижен рафт 2.1')), errors(mid).join(' | '));
  assert.ok(withheld(mid));
  const far = pair(740);
  assert.deepEqual(errors(far), []);
  assert.ok(!far.parts.some((p) => p.edgeOps.some((e) => e.kind === 'dowel')), 'far enough apart: screwed both');
  assert.equal(blockedScrews(far), 0);
});

test('screw heads of a fixed shelf left in sight in the next column get caps; heads under a shelf do not', () => {
  const caps = (m) => m.hardware.filter((h) => /Капачка/.test(h.name)).reduce((s, h) => s + h.qty, 0);
  const base = buildModel(custom({ grid: { columns: [col([open]), col([open])] } }));
  const one = buildModel(custom({ grid: { columns: [col([{ h: 700, fill: 'open' }, open]), col([open])] } }));
  assert.equal(caps(one) - caps(base), count(one, 'c1div1', 'confirmat', '-x') + count(one, 'c1div1', 'confirmat', '+x'), 'heads in the side and in the open second column');
  const two = buildModel(custom({ grid: { columns: [col([{ h: 700, fill: 'open' }, open]), col([{ h: 700, fill: 'open' }, open])] } }));
  assert.equal(caps(two) - caps(base), count(two, 'c1div1', 'confirmat', '-x') + count(two, 'c2div1', 'confirmat', '+x'), 'only the heads in the sides');
});

test('a fixed shelf is checked for sag like an adjustable one', () => {
  const m = buildModel(custom({ width: 2000, depth: 450, grid: { columns: [col([{ h: 700, fill: 'open' }, open])] } }));
  const name = byKey(m, 'c1div1').name;
  assert.ok(m.warnings.some((w) => w.level === 'warn' && w.text.startsWith(`${name}: провисване`)), m.warnings.map((w) => w.text).join(' | '));
});

test('an auto column or cell never gets less than its minimum when the sizes asked for do not fit', () => {
  // inner 1000 − 2 sides − 2 partitions = 928: the auto columns keep 150 each, the asked one the remaining 628
  const w = buildModel(custom({ width: 1000, grid: { columns: [col([open], [], 900), col([open]), col([open])] } }));
  assert.equal(byKey(w, 'part1').box.min[0], T + 628);
  assert.equal(byKey(w, 'part2').box.min[0], T + 628 + T + 150);
  assert.ok(w.warnings.some((x) => x.level === 'warn' && /ширин/.test(x.text)));
  // inner 1000 − bottom − top − 2 fixed shelves = 928: the auto cells keep 100 each, the asked one 728
  const h = buildModel(custom({ height: 1000, grid: { columns: [col([{ h: 900, fill: 'open' }, open, open])] } }));
  assert.equal(byKey(h, 'c1div1').box.min[1], T + 728);
  assert.equal(byKey(h, 'c1div2').box.min[1], T + 728 + T + 100);
  assert.ok(h.warnings.some((x) => x.level === 'warn' && /височин/.test(x.text)));
});

test('more columns or cells than fit: the ones that fit are built, the rest is an error — never an exception', () => {
  // the code review's cases: six cells in a 300 mm carcass on 150 mm legs, twelve columns in 300 mm, eight empty cells
  const low = buildModel(custom({ height: 300, legs: 150, grid: { columns: [col([open, { h: null, fill: 'drawers', n: 8 }, open, open, open, open])] } }));
  assert.ok(errors(low).some((t) => /отделени/.test(t)), errors(low).join(' | '));
  assert.ok(withheld(low));
  checkModel(low, 'six cells, 150 mm');
  const many = [...Array.from({ length: 6 }, () => col([open], [], 2364)), ...Array.from({ length: 6 }, () => col([{ h: null, fill: 'shelves', n: 1 }]))];
  const narrow = buildModel(custom({ width: 300, grid: { columns: many } }));
  assert.ok(errors(narrow).some((t) => /колони/.test(t)), errors(narrow).join(' | '));
  assert.ok(withheld(narrow));
  checkModel(narrow, 'twelve columns, 300 mm');
  const eight = buildModel(custom({ height: 300, legs: 150, grid: { columns: [col(Array.from({ length: 8 }, () => open))] } }));
  assert.ok(withheld(eight));
  checkModel(eight, 'eight cells, 150 mm'); // no fixed shelf on another
});

test('slide pilots and hinge plates on the two faces of a partition move off one another', () => {
  // the CAM review's case: drawers on both faces of a partition and a door hinged on it, near one height
  const m = buildModel(custom({ width: 957, height: 1534, grid: { columns: [col([{ h: null, fill: 'shelves', n: 0 }, { h: null, fill: 'drawers', n: 2 }], [{ from: 0, to: 0, kind: 'door', hinge: 'right' }]), col([{ h: 628, fill: 'drawers', n: 2 }])] } }));
  assertNoHoleOnHole(m, 'slides and plates');
  assert.deepEqual(errors(m), []);
  checkModel(m, 'slides and plates');
  // the other order: the drawers drilled first, then a door hinged on the other face — its plates move off the pilots
  const later = buildModel(custom({ width: 900, height: 900, depth: 450, grid: { columns: [col([{ h: null, fill: 'drawers', n: 2 }]), col([{ h: null, fill: 'shelves', n: 1 }], [{ from: 0, to: 0, kind: 'door', hinge: 'left' }])] } }));
  assertNoHoleOnHole(later, 'plates after slides');
  assert.deepEqual(errors(later), []);
});

test('two holes in one another are an error whatever they are for: the CNC files are withheld (the last line behind the generators)', () => {
  const ctx = createCtx();
  const p = panel(ctx, { key: 'probe', name: 'Делител', role: 'partition', stock: 'pb18', decor: 'demo:white', grain: false, box: { min: [0, 0, 0], max: [T, 600, 400] }, n: '+x', L: 'y' });
  holeThrough(p, [T, 100, 100], 3, 'slide', { hw: 'slide' });
  holeThrough(p, [T, 104, 100], 5, 'plate', { hw: 'plate' });
  checkHoles(ctx, p, { bandCompensation: true });
  assert.ok(ctx.warnings.some((w) => w.level === 'error' && /се застъпват/.test(w.text)), JSON.stringify(ctx.warnings));
});

test('a seeded sweep of random layouts: never an exception; without an error, no hole on another, no screw that cannot be driven, no board in another', () => {
  let seed = 20261106;
  const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  const pick = (a) => a[Math.floor(rnd() * a.length)];
  const junk = () => pick([NaN, -5, 0, 1e9, '12', 'abc', [], {}, null, undefined, true, 3.7]);
  const num = (lo, hi) => (rnd() < 0.08 ? junk() : Math.round(lo + rnd() * (hi - lo)));
  const cell = () => ({ h: rnd() < 0.5 ? null : num(50, 1200), fill: pick(['open', 'shelves', 'drawers', 'rail', 'x']), n: num(0, 10) });
  const front = (nc) => ({ from: num(0, nc), to: num(0, nc), kind: pick(['door', 'doors2']), hinge: pick(['left', 'right', null]) });
  const column = () => {
    const nc = 1 + Math.floor(rnd() * 5);
    return { w: rnd() < 0.6 ? null : num(100, 1500), cells: Array.from({ length: nc }, cell), fronts: Array.from({ length: Math.floor(rnd() * 4) }, () => front(nc)) };
  };
  // extreme on purpose (ten drawers in a low cell, a carcass too shallow for any slide): most are errors, and the error
  // paths are what the sweep is for; the rest are checked hole by hole
  const N = 600;
  let clean = 0;
  for (let t = 0; t < N; t++) {
    const raw = {
      type: 'custom', width: num(300, 4800), height: num(300, 2600), depth: pick([250, 350, 450, 600, 650]), placement: pick(['floor', 'floor', 'wall']),
      legs: pick([0, 0, 100, 150]), plinth: pick(['legs', 'panel']), top: pick(['between', 'over', 'rails']), grid: { columns: Array.from({ length: 1 + Math.floor(rnd() * 5) }, column) },
    };
    const label = `#${t} ${JSON.stringify(raw)}`;
    const spec = normalizeSpec(raw);
    assert.deepEqual(normalizeSpec(spec), spec, label);
    let m;
    assert.doesNotThrow(() => {
      m = buildModel(spec);
    }, label);
    checkModel(m, label);
    if (errors(m).length) continue;
    clean += 1;
    assertNoHoleOnHole(m, label);
    assert.equal(blockedScrews(m), 0, label);
  }
  assert.ok(clean >= N / 6, `${clean} of ${N} without an error — the sweep must reach buildable layouts too`);
});
