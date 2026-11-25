// Machine safety, the G-code and the data behind it: cutting data per cutter, the spindle under the GRBL feed cap, the
// onion skin and the spoilboard, ramps, pecks and through holes, the program header; board data, BOM, DXF and remnants.
// The blockers: machine-blockers.test.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerFixtures, OUTPUT_SPECS, SMALL_PART_SPEC, outputMeta } from './fixtures.mjs';
import { buildModel } from '../../engine/model.js';
import * as nestMod from '../../engine/nest.js';
import * as cam from '../../engine/cam.js';
import { toDxf } from '../../engine/dxf.js';
import { buildBom } from '../../engine/bom.js';
import { STOCK, registerRal } from '../../engine/materials.js';

// namespace imports: a name the engine does not export yet fails its own test, not the whole file
const { nest, remnantOf } = nestMod;
const { toGcode, SPOIL, ONION, GROOVE_MILL, contourTool, POSTS, RAMP_MAX_DEG } = cam;

registerFixtures();

const gcodeOf = (m, sheet, n) => toGcode(m, sheet, { ...outputMeta(m), sheetCount: n.sheets.length });


test('contour cutting data per diameter: fz from the low end of the makers’ chip load, 18 000 rpm up to Ø9,5 and 16 000 above', () => {
  const want = { 6: [18000, 0.33], 8: [18000, 0.4], 10: [16000, 0.51], 12: [16000, 0.64] };
  for (const [d, [rpm, fz]] of Object.entries(want)) {
    const t = contourTool(Number(d));
    assert.deepEqual([t.rpm, t.fz, t.flutes], [rpm, fz, 2], `Ø${d}`);
    const m = buildModel({ type: 'wall', tool: Number(d) });
    const n = nest(m);
    const g = gcodeOf(m, n.sheets[0], n).text;
    const F = Math.round(rpm * 2 * fz);
    assert.match(g, new RegExp(`S${rpm} M3\\n[^]*?F${F}\\n`), `Ø${d}: S${rpm} and F${F} not in the G-code`);
  }
  // the Ø4 groove mill stays at 0,08 mm (Onsrud 57-200 for 1/8 in: 0,076–0,127 mm)
  assert.equal(GROOVE_MILL.fz, 0.08);
});

test('GRBL: when the feed cap cuts the feed, the spindle slows in proportion and keeps the chip load', () => {
  const m = buildModel({ type: 'wall', tool: 6, post: 'grbl', grblMaxFeed: 10000 });
  const n = nest(m);
  const g = gcodeOf(m, n.sheets[0], n).text;
  const t = contourTool(6);
  const S = Math.round((t.rpm * 10000) / Math.round(t.rpm * t.flutes * t.fz));
  assert.match(g, new RegExp(`\\(T5 COMPRESSION D6[^\\n]*\\)\\nM5\\n[^]*?S${S} M3`), `S${S} not set for the contour`);
  assert.ok(S > POSTS.grbl.minRpm && Math.abs(10000 / (S * t.flutes) - t.fz) < 0.002, 'chip load not kept');
  // the spindle never goes below the post’s floor; the tool line says so
  const low = buildModel({ type: 'wall', tool: 10, post: 'grbl' });
  const nl = nest(low);
  const gl = gcodeOf(low, nl.sheets[0], nl).text;
  assert.match(gl, new RegExp(`S${POSTS.grbl.minRpm} M3`));
  assert.match(gl, /CHIP LOAD 0\.1 MM - BELOW 0\.51 - RAISE MAX FEED/);
});

test('the contour leaves 0,5 mm of onion skin and cuts 0,6 mm into the spoilboard', () => {
  assert.equal(SPOIL, 0.6);
  assert.equal(ONION, 0.5);
  const m = buildModel({ type: 'wall' });
  const n = nest(m);
  const g = gcodeOf(m, n.sheets[0], n).text;
  assert.match(g, /\(PROFILE PASS 1\/2 Z-17\.5\)/);
  assert.match(g, /\(PROFILE PASS 2\/2 Z-18\.6\)/);
  assert.ok(toDxf(m, n.sheets[0]).layers.includes('CONTOUR_D10_Z-18P6'));
});

// G-code lines with the modal position after each.
function walk(text) {
  const out = [];
  let [X, Y, Z, motion, F, tool] = [0, 0, 50, 'G0', 0, null];
  for (const raw of text.split('\n')) {
    const t = /^\((T\d+) /.exec(raw.trim());
    if (t) tool = t[1];
    const line = raw.replace(/\(.*?\)/g, '').trim();
    const w = Object.fromEntries([...line.matchAll(/([A-Z])(-?\d+\.?\d*)/g)].map((m) => [m[1], Number(m[2])]));
    const gs = [...line.matchAll(/G(\d+)/g)].map((m) => Number(m[1]));
    for (const gc of gs) if ([0, 1, 2, 3, 80, 81, 83].includes(gc)) motion = `G${gc}`;
    if (w.F !== undefined) F = w.F;
    const from = { X, Y, Z };
    [X, Y, Z] = [w.X ?? X, w.Y ?? Y, w.Z ?? Z];
    out.push({ raw, line, motion, tool, F, from, X, Y, Z, w, gs, moved: w.X !== undefined || w.Y !== undefined || w.Z !== undefined });
  }
  return out;
}

test('every contour entry into material ramps at 15° or less — the second onion pass and short parts too', () => {
  const tan = Math.tan((RAMP_MAX_DEG * Math.PI) / 180);
  assert.equal(RAMP_MAX_DEG, 15);
  const specs = [...OUTPUT_SPECS, SMALL_PART_SPEC, { type: 'desk' }, { type: 'wall', post: 'grbl', grblStepDown: 20 }];
  let zigzag = 0;
  for (const input of specs) {
    const m = buildModel(input);
    const n = nest(m);
    for (const sheet of n.sheets) {
      const where = `${input.type} sheet ${sheet.index}`;
      const cutTo = new Map();
      let start = null;
      let legs = 0;
      for (const l of walk(gcodeOf(m, sheet, n).text)) {
        if (l.tool !== 'T5' || !l.moved) continue;
        if (l.motion === 'G0') {
          start = `${l.X},${l.Y}`;
          legs = 0;
          continue;
        }
        if (l.motion !== 'G1') continue;
        const before = cutTo.get(start) ?? 0;
        if (l.Z < before - 1e-6) {
          const dz = Math.min(l.from.Z, before) - l.Z;
          const dxy = Math.hypot(l.X - l.from.X, l.Y - l.from.Y);
          assert.ok(dxy > 0 && dz <= dxy * tan + 1e-3, `${where}: entry of ${dz.toFixed(2)} mm over ${dxy.toFixed(2)} mm (${l.raw})`);
          cutTo.set(start, l.Z);
          legs += 1;
          if (legs === 2) zigzag += 1;
        }
      }
    }
  }
  assert.ok(zigzag > 0, 'no part needed a zigzag ramp — the test does not reach that branch');
});

test('through holes: the last 2 mm at half feed; deep holes are pecked — G83 with Q on ISO, G1 steps on GRBL', () => {
  for (const post of ['iso', 'grbl']) {
    for (const type of ['base', 'desk', 'bed']) {
      const m = buildModel({ type, post });
      const n = nest(m);
      let through = 0;
      let pecked = 0;
      for (const sheet of n.sheets) {
        const g = gcodeOf(m, sheet, n);
        const lines = walk(g.text);
        for (const { tool, holes } of g.ops.drillOps) {
          const F = post === 'grbl' ? Math.min(tool.feed, m.spec.grblMaxFeed) : tool.feed;
          for (const h of holes) {
            const at = lines.filter((l) => l.X === h.X && l.Y === h.Y && l.tool === tool.id);
            const deep = h.depth / tool.d >= 3;
            if (h.through) {
              through += 1;
              const last = at.filter((l) => l.motion === 'G1' && l.w.Z !== undefined);
              const fin = last.at(-1);
              assert.ok(fin && Math.abs(fin.Z + h.depth) < 1e-6 && Math.abs(fin.from.Z + h.depth - 2) < 1e-6 && fin.F === F / 2, `${post} ${type}: Ø${tool.d} through ${h.X},${h.Y} does not end 2 mm at F${F / 2}`);
            }
            if (!deep) continue;
            pecked += 1;
            if (post === 'iso') {
              assert.ok(at.some((l) => l.motion === 'G83' && l.w.Q > 0 && l.w.R === 3), `${type}: Ø${tool.d} × ${h.depth} not pecked with G83 Q`);
              // Fanuc чете Q без десетична точка в хилядни от mm (Q10 = 0,010 mm) — точката е задължителна.
              assert.ok(at.filter((l) => l.motion === 'G83').every((l) => /Q\d+\.\d*/.test(l.raw)), `${type}: G83 Q без десетична точка`);
            }
            else {
              const downs = at.filter((l) => l.motion === 'G1' && l.w.Z !== undefined && l.Z < 0);
              assert.ok(downs.length >= 2, `${type}: GRBL Ø${tool.d} × ${h.depth} in one stroke`);
            }
          }
        }
        assert.ok(!/G8[13][^\n]*\n[^]*?\bG0 Z-/.test(g.text), 'a rapid below the sheet top');
        if (post === 'grbl') assert.ok(!/G8[1-9]/.test(g.text.replace(/G80/g, '')), `GRBL ${type}: a canned cycle GRBL does not know`);
      }
      if (type === 'base') assert.ok(through > 0, `${post}: base has no through hole`);
      if (type === 'desk') assert.ok(pecked > 0, `${post}: desk has no deep hole`);
    }
  }
});

test('ISO dwells after the spindle start before the first move to the work; GRBL sets the modes ISO does; the park is in the header', () => {
  const iso = buildModel({ type: 'base' });
  const ni = nest(iso);
  const gi = gcodeOf(iso, ni.sheets[0], ni).text;
  const starts = gi.match(/S\d+ M3\n/g).length;
  assert.equal((gi.match(/S\d+ M3\nG4 P5000\nG0 G43 H\d+ Z20\.\n/g) ?? []).length, starts, 'a spindle start without the dwell');
  const grbl = buildModel({ type: 'base', post: 'grbl' });
  const ng = nest(grbl);
  const gg = gcodeOf(grbl, ng.sheets[0], ng).text;
  assert.match(gg, /\nG21 G17 G90 G94 G40 G49 G80 G54\n/);
  for (const g of [gi, gg]) assert.match(g, /\(END: SPINDLE OFF, Z50 ABOVE THE SHEET TOP - CHECK THE Z TRAVEL\)/);
});

test('board data: density, E by thickness and the EN 312 class for every stock; doors weigh by their own board', () => {
  const want = { pb16: [650, 1600, 'P2'], pb18: [650, 1600, 'P2'], pb25: [620, 1500, 'P2'], mdf18: [720, 1600, 'MDF'], hdf3: [850, null, 'HDF'] };
  for (const [id, [density, E, grade]] of Object.entries(want)) assert.deepEqual([STOCK[id].density, STOCK[id].E ?? null, STOCK[id].grade], [density, E, grade], id);
  assert.equal(STOCK.mdf18.mr, false);
  registerRal([{ code: 'RAL 9016', name: 'Транспортно бяло', hex: '#f1f0ea' }]);
  const pb = buildModel({ type: 'wall' }).parts.find((p) => p.role === 'door');
  const mdf = buildModel({ type: 'wall', frontMaterial: 'ral', frontRal: 'RAL 9016' }).parts.find((p) => p.role === 'door');
  assert.equal(mdf.stock, 'mdf18');
  assert.ok(mdf.massKg > pb.massKg * 1.1, `MDF door ${mdf.massKg} kg vs particleboard ${pb.massKg} kg`);
});

// The model does not know which cabinet is under the sink: a note, not a warning — the defaults carry no warning
// (CLAUDE.md, defaults.test.mjs), and base and kitchen are defaults.
test('a kitchen base cabinet notes that the one under the sink needs P3 and PUR', () => {
  for (const type of ['base', 'kitchen']) {
    const w = buildModel({ type }).warnings.find((x) => x.text.includes('P3'));
    assert.equal(w?.level, 'info', type);
    assert.match(w.text, /мивка/);
    assert.match(w.text, /PUR/);
  }
  assert.ok(!buildModel({ type: 'wardrobe' }).warnings.some((x) => x.text.includes('P3')));
});

test('BOM: weight per part and per board, edge band with the board thickness, its width and the glue', () => {
  const m = buildModel({ type: 'base' });
  const bom = buildBom(m);
  for (const r of bom.rows) {
    const kg = ((r.cutL * r.cutW * r.T) / 1e9) * STOCK[r.stock].density;
    assert.ok(Math.abs(r.kg - Math.round(kg * 100) / 100) < 1e-9, `${r.name}: ${r.kg} kg vs ${kg}`);
  }
  for (const b of bom.boards) assert.ok(b.kg > 0, b.decorName);
  assert.ok(Math.abs(bom.boards.reduce((a, b) => a + b.kg, 0) - bom.rows.reduce((a, r) => a + r.kg, 0)) < 0.05);
  for (const b of bom.bands) {
    assert.ok([16, 18, 25].includes(b.boardT), JSON.stringify(b));
    assert.ok(b.width >= b.boardT + 3, JSON.stringify(b));
    assert.equal(b.glue, 'EVA');
  }
});

test('DXF: layer 0, a STYLE table, mm in the README, an unambiguous decimal mark and manual holes on their own layer', () => {
  const m = buildModel({ type: 'base' });
  const n = nest(m);
  const sheet = n.sheets.find((s) => s.placements.some((pl) => m.parts.find((p) => p.id === pl.partId).features.some((f) => f.type === 'hole')));
  // a Ø the demo library has no drill for: drilled by hand, on its own layer
  const part = m.parts.find((p) => sheet.placements.some((pl) => pl.partId === p.id) && p.features.some((f) => f.type === 'hole' && f.kind === 'system'));
  part.features.find((f) => f.type === 'hole' && f.kind === 'system').d = 4.2;
  const dxf = toDxf(m, sheet);
  assert.match(dxf.text, /\n *2\nLAYER\n *70\n *\d+\n *0\nLAYER\n *2\n0\n/);
  assert.match(dxf.text, /\n *2\nSTYLE\n[^]*?\n *2\nSTANDARD\n/);
  assert.match(dxf.text, /\n *9\n\$ACADVER\n *1\nAC1009\n/);
  // R12 has no $INSUNITS (AC1015 brought it): the README says the units
  assert.ok(!/INSUNITS/.test(dxf.text));
  assert.match(readFileSync(new URL('../../README.md', import.meta.url), 'utf8'), /DXF[^\n]*милиметри/);
  assert.ok(dxf.layers.includes('MANUAL_DRILL_D4P2_Z-12'), dxf.layers.join(' '));
  assert.ok(!dxf.layers.some((l) => /\d_\d/.test(l)), `a decimal written as _: ${dxf.layers.join(' ')}`);
});

test('a free rectangle counts as a remnant at 300 × 200 mm either way round', () => {
  const s = 10;
  assert.ok(remnantOf([{ x: 0, y: 0, w: 310, h: 210 }], s, 10));
  assert.ok(remnantOf([{ x: 0, y: 0, w: 210, h: 310 }], s, 10), 'a tall remnant is lost');
  assert.equal(remnantOf([{ x: 0, y: 0, w: 290 + s, h: 900 }], s, 10).w, 290);
  assert.equal(remnantOf([{ x: 0, y: 0, w: 190 + s, h: 900 }], s, 10), null);
});
