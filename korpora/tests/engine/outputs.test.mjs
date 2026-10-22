// Outputs over every furniture type and a few variants: BOM and CSV, hinge boring distances against the
// manufacturer's range, nesting inside the trim without overlaps, G-code (ISO and GRBL) inside the sheet and
// above the spoilboard limit, DXF structure — and, when Python with ezdxf is available, a DXF audit.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { registerFixtures, FIXTURE, OUTPUT_SPECS as specs, outputMeta as metaOf } from './fixtures.mjs';
import { buildModel, SHEET_TRIM } from '../../engine/model.js';
import { buildBom, csvCell, cutListCsv, hardwareCsv } from '../../engine/bom.js';
import { drillCsv, hardwareCards, partHoles } from '../../engine/drill.js';
import { nest } from '../../engine/nest.js';
import { toGcode } from '../../engine/cam.js';
import { toDxf } from '../../engine/dxf.js';
import { cutSize } from '../../engine/panel.js';
import { STOCK } from '../../engine/materials.js';

registerFixtures();

function checkGcode(text, sheet, T, tool) {
  const lines = text.split('\n').filter(Boolean);
  let X = 0;
  let Y = 0;
  let Z = 50;
  let motion = 'G0';
  let canned = false;
  let minZ = Infinity;
  const r = tool / 2;
  for (const raw of lines) {
    const line = raw.replace(/\(.*?\)/g, '').trim();
    if (!line || line === '%') continue;
    assert.ok(!/NaN|undefined|Infinity/.test(raw), `bad token: ${raw}`);
    assert.ok(/^[\x20-\x7e]*$/.test(raw), `non-ASCII in G-code: ${raw}`);
    const w = Object.fromEntries([...line.matchAll(/([A-Z])(-?\d+\.?\d*)/g)].map((m) => [m[1], Number(m[2])]));
    const gs = [...line.matchAll(/G(\d+)/g)].map((m) => Number(m[1]));
    if (gs.includes(81)) canned = true;
    if (gs.includes(80)) canned = false;
    for (const gc of gs) if ([0, 1, 2, 3].includes(gc)) motion = `G${gc}`;
    const nx = w.X ?? X;
    const ny = w.Y ?? Y;
    const nz = w.Z ?? Z;
    if (canned && (w.X !== undefined || w.Y !== undefined)) {
      minZ = Math.min(minZ, nz);
      X = nx;
      Y = ny;
      continue;
    }
    if (motion === 'G2' && (w.I !== undefined || w.J !== undefined)) {
      const cx = X + (w.I ?? 0);
      const cy = Y + (w.J ?? 0);
      const r1 = Math.hypot(X - cx, Y - cy);
      const r2 = Math.hypot(nx - cx, ny - cy);
      assert.ok(Math.abs(r1 - r2) < 0.01 && Math.abs(r1 - r) < 0.01, `arc radius ${r1}/${r2} vs tool ${r}: ${raw}`);
    }
    if (w.X !== undefined || w.Y !== undefined || w.Z !== undefined) {
      X = nx;
      Y = ny;
      Z = nz;
      if (!gs.includes(43)) minZ = Math.min(minZ, Z);
    }
    assert.ok(X >= -r - 0.01 && X <= sheet.w + r + 0.01 && Y >= -r - 0.01 && Y <= sheet.h + r + 0.01, `XY out of sheet: ${raw}`);
  }
  assert.ok(minZ >= -(T + 2), `Z below the spoilboard limit: ${minZ}`);
  assert.ok(lines.some((l) => l.startsWith('M30')), 'missing M30');
}

for (const [ci, input] of specs.entries()) {
  test(`outputs ${ci + 1}: ${input.type}${Object.keys(input).length > 1 ? ' variant' : ''}`, () => {
    const model = buildModel(input);
    const meta = metaOf(model);
    const label = `${ci + 1}-${model.spec.type}`;

    const bom = buildBom(model);
    assert.equal(bom.rows.length, model.parts.length);
    for (const csv of [cutListCsv(bom), hardwareCsv(bom), drillCsv(model)]) assert.ok(csv.split('\r\n').length > 2, `${label}: empty CSV`);
    const holesInCsv = drillCsv(model).split('\r\n').length - 2;
    const holesInModel = model.parts.reduce((a, p) => a + p.features.filter((f) => f.type === 'hole').length + p.edgeOps.reduce((b, o) => b + o.count, 0), 0);
    assert.equal(holesInCsv, holesInModel, `${label}: drill CSV rows vs holes`);
    const drillRows = drillCsv(model).split('\r\n').slice(1, -1).map((l) => l.split(';'));
    for (const p of model.parts) {
      const nos = drillRows.filter((r) => r[0] === p.id).map((r) => r[3]);
      assert.equal(new Set(nos).size, nos.length, `${label}: ${p.id} repeats a hole number in drilling.csv`);
    }
    assert.ok(!drillRows.some((r) => r[3].startsWith('Ч') && r[9].includes('през плочата')), `${label}: an edge hole described as the hole through the face`);

    for (const card of hardwareCards(model)) {
      for (const p of card.parts) {
        if (!p.cup) continue;
        const door = model.parts.find((q) => q.id === p.partId);
        const sys = FIXTURE.hingeSystems.find((s) => s.id === door.hinge.system);
        assert.ok(p.cup.boring >= sys.cup.c[0] - 0.01 && p.cup.boring <= sys.cup.c[1] + 0.01, `${label}: ${p.name} C ${p.cup.boring} outside ${sys.cup.c}`);
        assert.ok(Math.abs(p.cup.boring - door.hinge.c) < 0.11, `${label}: ${p.name} C ${p.cup.boring} vs ${door.hinge.c}`);
        const overlay = p.cup.boring + sys.overlay.base[door.hinge.variant] - door.hinge.plate;
        assert.ok(Math.abs(overlay - door.hinge.wanted) < 0.11, `${label}: ${p.name} overlay ${overlay} vs wanted ${door.hinge.wanted}`);
      }
    }
    for (const p of model.parts) {
      const nums = partHoles(p).map((h) => h.no);
      assert.deepEqual(nums, nums.map((_, i) => i + 1));
    }

    const nesting = nest(model);
    assert.equal(nesting.errors.length, 0, `${label}: ${nesting.errors.join('; ')}`);
    assert.equal(nesting.sheets.reduce((a, s) => a + s.placements.length, 0), model.parts.length, `${label}: not every part is placed`);
    const edge = SHEET_TRIM - 0.01;
    for (const sh of nesting.sheets) {
      const pls = sh.placements;
      for (const p of pls) {
        assert.ok(p.x >= edge && p.y >= edge && p.x + p.w <= sh.w - edge && p.y + p.h <= sh.h - edge, `${label}: placement outside trim: ${p.name}`);
        const part = model.parts.find((q) => q.id === p.partId);
        if (part.grain) assert.equal(p.rot, false, `${label}: ${p.name} rotated against grain`);
        const cut = cutSize(part, model.spec.bandCompensation);
        assert.deepEqual(p.rot ? [p.h, p.w] : [p.w, p.h], [cut.L, cut.W], `${label}: ${p.name} placed at the wrong cut size`);
      }
      for (let i = 0; i < pls.length; i++) {
        for (let j = i + 1; j < pls.length; j++) {
          const [a, b] = [pls[i], pls[j]];
          const s2 = nesting.spacing - 0.01;
          assert.ok(a.x + a.w + s2 <= b.x || b.x + b.w + s2 <= a.x || a.y + a.h + s2 <= b.y || b.y + b.h + s2 <= a.y, `${label}: parts too close: ${a.name} / ${b.name}`);
        }
      }
      const g = toGcode(model, sh, { ...meta, sheetCount: nesting.sheets.length });
      assert.equal(g.ops.manual.length, 0, `${label}: holes without a tool: ${g.ops.manual.map((h) => h.d).join(',')}`);
      assert.match(g.text, /SIMULATE AND DRY RUN BEFORE CUTTING/);
      if (model.spec.post === 'grbl') {
        // after the touch-off on the sheet top the bit lifts to safe Z before the spindle starts
        const pauses = g.text.match(/\nM0\n/g) ?? [];
        assert.ok(pauses.length > 0, `${label}: no tool change pause`);
        assert.equal((g.text.match(/\nM0\nG0 Z20\.\nS\d+ M3\nG4 P2\n/g) ?? []).length, pauses.length, `${label}: the spindle starts before the lift to safe Z`);
      } else {
        const g43 = g.text.split('\n').filter((l) => l.includes('G43'));
        assert.ok(g43.length > 0 && g43.every((l) => l.startsWith('G0 G43 ')), `${label}: G43 approach without an explicit G0`);
      }
      checkGcode(g.text, sh, STOCK[sh.stock].thickness, model.spec.tool);
      const dxf = toDxf(model, sh);
      assert.match(dxf.text, /^ *0\nSECTION\n/);
      assert.match(dxf.text, /\n *0\nEOF\n$/);
      for (const layer of dxf.layers) assert.match(layer, /^[A-Z0-9$_-]{1,31}$/, `${label}: layer name not valid in DXF R12`);
    }
  });
}

test('DXF files pass the ezdxf audit (skipped without Python and ezdxf)', (t) => {
  const py = [
    'import sys, glob',
    'from ezdxf import recover',
    'bad = 0',
    "for f in sorted(glob.glob(sys.argv[1] + '/*.dxf')):",
    '    doc, auditor = recover.readfile(f)',
    '    if auditor.errors:',
    '        bad += 1',
    "        print('DXF errors', f, len(auditor.errors))",
    'sys.exit(1 if bad else 0)',
  ].join('\n');
  try {
    execFileSync('python3', ['-c', 'import ezdxf'], { stdio: 'ignore' });
  } catch {
    t.skip('python3 with ezdxf is not available');
    return;
  }
  // the test writes its own files, so it runs alone and in any order
  const dir = mkdtempSync(join(tmpdir(), 'korpora-dxf-'));
  try {
    let count = 0;
    for (const [ci, input] of specs.entries()) {
      const model = buildModel(input);
      const meta = metaOf(model);
      for (const sh of nest(model).sheets) {
        writeFileSync(join(dir, `${ci + 1}-${model.spec.type}-s${sh.index}.dxf`), toDxf(model, sh).text);
        count += 1;
      }
    }
    assert.ok(count > 0, 'no DXF files were written');
    execFileSync('python3', ['-c', py, dir], { encoding: 'utf8' });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('hardware.csv prints prices with cents; the hardware total is summed in whole cents', () => {
  const hw = (price, qty) => ({ group: 'Обков', name: `Артикул ${price}`, qty, unit: 'бр.', price, currency: 'EUR' });
  const bom = buildBom({ parts: [], spec: {}, hardware: [hw(0.83, 3), hw(0.1, 3), hw(0.2, 1), hw(2.76, 1)] });
  const prices = hardwareCsv(bom).split('\r\n').slice(1, -1).map((l) => l.split(';')[6]);
  assert.deepEqual(prices.sort(), ['0,10', '0,20', '0,83', '2,76']);
  assert.equal(bom.hardwareTotals.EUR, 5.75); // 249 + 30 + 20 + 276 cents
});

test('a CSV cell never starts a spreadsheet formula, numbers stay numbers', () => {
  assert.equal(csvCell('=HYPERLINK("http://x")'), `"'=HYPERLINK(""http://x"")"`);
  assert.equal(csvCell('+1+1'), "'+1+1");
  assert.equal(csvCell('@SUM(A1)'), "'@SUM(A1)");
  assert.equal(csvCell('-cmd'), "'-cmd");
  assert.equal(csvCell('-12'), '-12');
  assert.equal(csvCell('-3,5'), '-3,5');
  assert.equal(csvCell(-7), '-7');
  assert.equal(csvCell('Страница; 2'), '"Страница; 2"');
});
