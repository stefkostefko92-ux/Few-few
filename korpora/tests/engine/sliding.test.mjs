// Sliding doors of a wardrobe (engine/sliding.js): Häfele Slido F-Line21 40C — two inset, top-hung doors per carcass on
// a double top track screwed under the top (the top is 18 mm; the groove-mounted track wants 19 mm and more). The
// numbers are the maker's (Sliding Systems Directory 2025, pp. 1.20–1.21; Planofit p. 1.144); where the page is silent
// the program chooses and says so (engine/data/sliding-systems.js). Checked: the doors' sizes and places, the interior
// set back behind them, nothing standing in anything, the limits of the system, the hardware, the machining of the
// doors on the CNC and the rest on the drawing, and the hinged wardrobe exactly as it was.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { registerFixtures } from './fixtures.mjs';
import { checkModel, assertNoHoleOnHole } from './check.mjs';
import { buildModel } from '../../engine/model.js';
import { SLIDING, slidingDoorSize } from '../../engine/sliding.js';
import { STOCK } from '../../engine/materials.js';
import { buildBom } from '../../engine/bom.js';
import { nest } from '../../engine/nest.js';
import { cncBlockers, toGcode, grooveLines, GROOVE_MILL } from '../../engine/cam.js';
import { drawingAssembly } from '../../engine/drawing-assembly.js';
import { drawingPart, drawingSheets } from '../../engine/drawing-part.js';

registerFixtures();

const SYS = SLIDING.hafele_fline21_40c;
const T = STOCK.pb18.thickness;
// a sliding wardrobe the system can carry: doors under 2200 mm
const OK = { type: 'wardrobe', doorType: 'sliding', height: 2200, legs: 100 };
const variants = [
  OK,
  { ...OK, width: 800 },
  { ...OK, width: 2400, columns: 2 },
  { ...OK, width: 3000, columns: 4 }, // two carcasses, two pairs of doors
  { ...OK, layout: 'hanging' },
  { ...OK, layout: 'shelves' },
  { ...OK, layout: 'mixed' },
  { ...OK, depth: 450 },
  { ...OK, legs: 0 },
];
const label = (s) => Object.entries(s).slice(1).map(([k, v]) => `${k}=${v}`).join(' ');
const doorsOf = (m) => m.parts.filter((p) => p.role === 'sliding-door');
const size = (p, i) => p.box.max[i] - p.box.min[i];
const carcasses = (m) => {
  const sides = m.parts.filter((p) => p.role === 'side').sort((a, b) => a.box.min[0] - b.box.min[0]);
  return Array.from({ length: sides.length / 2 }, (_, k) => [sides[2 * k], sides[2 * k + 1]]);
};

test('the system as the maker gives it', () => {
  assert.equal(SYS.maxKg, 40);
  assert.equal(SYS.maxH, 2200);
  assert.equal(SYS.maxW, 1250);
  assert.equal(SYS.overlap, 20);
  assert.equal(SYS.heightDeduction, 23.5); // B = A − 23.5 mm with the screw-fixed track
  assert.equal(SYS.minW, 390); // with one soft close
  assert.equal(SYS.door.T, 16);
  assert.deepEqual(slidingDoorSize(SYS, 1964, 2064), { W: 992, H: 2040.5 });
});

test('two doors per carcass: inside the sides, overlapping 20 mm, the front one 11 mm behind the front edge', () => {
  for (const s of variants) {
    const m = buildModel(s);
    const doors = doorsOf(m);
    const cs = carcasses(m);
    assert.equal(doors.length, 2 * cs.length, label(s));
    for (const [sl, sr] of cs) {
      const zEnd = sl.box.max[2];
      const inner = [sl.box.max[0], sr.box.min[0]];
      const own = doors.filter((d) => d.box.min[0] >= inner[0] - 0.01 && d.box.max[0] <= inner[1] + 0.01);
      assert.equal(own.length, 2, label(s));
      const [rear, front] = own.sort((a, b) => a.box.max[2] - b.box.max[2]);
      const bottom = m.parts.find((p) => p.role === 'bottom' && p.box.min[0] >= sl.box.min[0] && p.box.max[0] <= sr.box.max[0]);
      const top = m.parts.find((p) => p.role === 'top' && p.box.min[0] >= sl.box.min[0] && p.box.max[0] <= sr.box.max[0]);
      const A = top.box.min[1] - bottom.box.max[1];
      const want = slidingDoorSize(SYS, inner[1] - inner[0], A);
      for (const d of own) {
        assert.equal(d.T, SYS.door.T, label(s));
        assert.equal(d.stock, 'pb16', label(s));
        assert.ok(Math.abs(size(d, 0) - want.W) < 0.01, `${label(s)}: width ${size(d, 0)} ≠ ${want.W}`);
        assert.ok(Math.abs(size(d, 1) - want.H) < 0.01, `${label(s)}: height ${size(d, 1)} ≠ ${want.H}`);
        assert.ok(Math.abs(d.box.min[1] - (bottom.box.max[1] + 4)) < 0.01, `${label(s)}: 4 mm above the bottom`);
        assert.equal(d.edgeOps.length, 0, label(s)); // the bottom groove is the drawing's, not a bore
      }
      assert.ok(Math.abs(front.box.max[2] - (zEnd - 11)) < 0.01, label(s));
      assert.ok(Math.abs(front.box.min[2] - rear.box.max[2] - 10) < 0.01, `${label(s)}: 10 mm between the doors`);
      // one door at each side, meeting 20 mm over each other in the middle
      const [l, r] = own.sort((a, b) => a.box.min[0] - b.box.min[0]);
      assert.ok(Math.abs(l.box.min[0] - inner[0]) < 0.01 && Math.abs(r.box.max[0] - inner[1]) < 0.01, label(s));
      assert.ok(Math.abs(l.box.max[0] - r.box.min[0] - SYS.overlap) < 0.01, label(s));
    }
  }
});

test('the interior stands behind the doors and the track: partitions, shelves and rails clear of the front zone', () => {
  for (const s of variants) {
    const m = buildModel(s);
    for (const [sl] of carcasses(m)) {
      const zFree = sl.box.max[2] - SYS.frontZone;
      for (const p of m.parts.filter((x) => ['partition', 'shelf'].includes(x.role) && x.box.min[0] > sl.box.min[0])) {
        assert.ok(p.box.max[2] <= zFree + 0.01, `${label(s)}: ${p.name} reaches ${p.box.max[2]} > ${zFree}`);
      }
    }
    for (const r of m.symbols.filter((x) => x.type === 'rail')) assert.ok(r.z < m.parts[0].box.max[2] - SYS.frontZone, label(s));
    assert.ok(SYS.frontZone >= 11 + 16 + 10 + 16 + 3, 'the doors and the track fit the zone');
    checkModel(m, label(s));
    assertNoHoleOnHole(m, label(s));
  }
});

test('no drawers behind sliding doors: the mixed layout keeps its shelves and says so', () => {
  const m = buildModel({ ...OK, layout: 'mixed', columns: 3 });
  assert.equal(m.parts.filter((p) => p.role === 'drawer-front').length, 0);
  assert.ok(m.warnings.some((w) => w.level === 'info' && /чекмедже/i.test(w.text)));
  assert.equal(m.parts.filter((p) => p.role === 'door').length, 0, 'no hinged doors with sliding ones');
});

test('beyond the system: a door too tall or too heavy is an error that says how much to change', () => {
  const tall = buildModel({ type: 'wardrobe', doorType: 'sliding', height: 2400, legs: 100 });
  const err = tall.warnings.find((w) => w.level === 'error' && /2200/.test(w.text));
  assert.ok(err, JSON.stringify(tall.warnings));
  assert.match(err.text, /40\.5|40,5/); // 2240.5 − 2200: lower the wardrobe by 40.5 mm
  assert.ok(cncBlockers(tall, nest(tall)).length);
  const ok = buildModel(OK);
  assert.deepEqual(ok.warnings.filter((w) => w.level === 'error'), []);
});

test('the hardware: the fitting set, the double track cut to the inner width, two Planofit per door, the screws', () => {
  const m = buildModel({ ...OK, width: 3000, columns: 4 });
  const hw = Object.fromEntries(m.hardware.map((h) => [h.key ?? h.name, h]));
  const set = m.hardware.find((h) => h.sku === '402.33.027');
  assert.ok(set, JSON.stringify(m.hardware.map((h) => h.name)));
  assert.equal(set.qty, 2); // one per carcass
  const track = m.hardware.find((h) => h.sku === '402.30.652');
  assert.equal(track.qty, 2);
  const planofit = m.hardware.find((h) => h.sku === '407.90.202');
  assert.equal(planofit.qty, 2 * doorsOf(m).length);
  assert.ok(hw);
});

test('the doors on the CNC: Planofit bores Ø35 × 12.5 and the 10 × 8 groove on face B; the running gear by the maker', () => {
  const m = buildModel(OK);
  for (const d of doorsOf(m)) {
    const bores = d.features.filter((f) => f.type === 'hole' && f.kind === 'planofit');
    assert.equal(bores.length, 4, d.name);
    for (const b of bores) {
      assert.equal(b.d, 35);
      assert.equal(b.depth, 12.5);
      assert.ok(b.depth < d.T - 3, 'at least 3 mm of board stays under the bore');
    }
    const grooves = d.features.filter((f) => f.type === 'groove' && f.kind === 'planofit');
    assert.equal(grooves.length, 2, d.name);
    for (const g of grooves) {
      assert.equal(g.w, 10);
      assert.equal(g.depth, 8);
      // the groove ends in the centres of its own two bosses (p. 1.144) — one fitting, not a hole too close to a groove
      assert.equal(bores.filter((b) => b.fitting === g.fitting && [g.u1, g.u2].includes(b.u) && b.v === g.v1).length, 2);
    }
    assert.ok(!m.warnings.some((w) => w.text.includes(d.name) && w.text.includes('Planofit')), `${d.name}: no "move the hole" for its own Planofit`);
    // the running gear housings: where they go, not on the CNC (the pocket opens through the top edge)
    const gear = d.features.filter((f) => f.type === 'mark' && f.kind === 'sliding-gear');
    assert.equal(gear.length, 2, d.name);
  }
  const nesting = nest(m);
  assert.deepEqual(cncBlockers(m, nesting), []);
  const sheet = nesting.sheets.find((sh) => sh.placements.some((p) => doorsOf(m).some((d) => d.id === p.partId)));
  const g = toGcode(m, sheet, { product: 'K', hash: 'a'.repeat(64), owner: 'T', date: '2026-11-14' });
  assert.ok(g.text.includes('GROOVES'));
});

test('a groove wider than the cutter is cut in passes side by side; the 4 mm back groove stays one pass', () => {
  const g = { X1: 100, Y1: 50, X2: 100, Y2: 1950, w: 10, depth: 8 };
  const lines = grooveLines(g, GROOVE_MILL);
  // 10 mm with the 4 mm cutter: three passes, the outer ones 3 mm off the centre — the cutter's edge on the groove's
  assert.deepEqual(lines.map((l) => l.X1), [103, 100, 97]);
  assert.ok(lines.every((l) => l.Y1 === 50 && l.Y2 === 1950));
  for (let k = 1; k < lines.length; k++) assert.ok(Math.abs(lines[k].X1 - lines[k - 1].X1) <= 0.8 * GROOVE_MILL.d);
  const back = { X1: 0, Y1: 0, X2: 500, Y2: 0, w: 4, depth: 8 };
  assert.deepEqual(grooveLines(back, GROOVE_MILL), [back]);
});

test('the drawing shows the sliding doors and how to fit what the CNC does not make', () => {
  const m = buildModel(OK);
  const meta = { product: 'K', hash: 'a'.repeat(64), owner: 'T', date: '2026-11-14' };
  const svg = drawingAssembly(m, meta);
  assert.match(svg, /F-Line21/);
  const door = doorsOf(m)[0];
  assert.ok(drawingSheets(m).parts.some(({ part }) => part.id === door.id));
  assert.match(drawingPart(m, meta, door.id), /6 × 9[,.]5/); // the bottom groove for the guides
});

test('the bill of materials: the doors are 16 mm boards in the front decor, banded all round', () => {
  const m = buildModel({ ...OK, frontDecor: 'demo:oak' });
  const bom = buildBom(m);
  for (const d of doorsOf(m)) {
    const row = bom.rows.find((r) => r.id === d.id);
    assert.equal(row.T, 16);
    assert.equal(d.decor, 'demo:oak');
    assert.deepEqual(Object.keys(d.bands).sort(), ['+x', '+y', '-x', '-y'].sort());
  }
});

test('the top under the doors: a wide span between supports sags past the running gear — an error with the cure', () => {
  // one column across 2364 mm of a carcass: the top spans it all
  const wide = buildModel({ ...OK, width: 2400, columns: 2, layout: 'shelves' });
  const sag = wide.warnings.find((w) => w.level === 'error' && /провисн/.test(w.text));
  assert.ok(sag, JSON.stringify(wide.warnings.map((w) => w.text)));
  assert.match(sag.text, /колона/);
  // the default four columns: the partitions carry it
  assert.ok(!buildModel(OK).warnings.some((w) => /провисн/.test(w.text)));
});

test('the track: one line per cut length (carcasses of different widths), the length written the local way', () => {
  const m = buildModel({ ...OK, width: 3000, columns: 5 });
  const tracks = m.hardware.filter((h) => h.sku === '402.30.652');
  assert.equal(tracks.length, 2, JSON.stringify(tracks.map((h) => h.name)));
  assert.notEqual(tracks[0].name, tracks[1].name);
  assert.ok(tracks.every((h) => h.qty === 1 && /2,5 m/.test(h.name)));
  const en = buildModel({ ...OK, width: 3000, columns: 5 }, { lang: 'en' });
  assert.ok(en.hardware.filter((h) => h.sku === '402.30.652').every((h) => /2\.5 m/.test(h.name)));
});

test('a groove narrower than the cutter blocks the CNC files instead of being cut wider', () => {
  const m = buildModel(OK);
  const door = doorsOf(m)[0];
  door.features.push({ type: 'groove', u1: 100, v1: 100, u2: 100, v2: 300, w: 3, depth: 5, kind: 'test' });
  assert.ok(cncBlockers(m, nest(m)).some((b) => /3 mm/.test(b) && /Ø4/.test(b)));
});
