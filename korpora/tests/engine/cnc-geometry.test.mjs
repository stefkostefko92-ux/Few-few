// The CNC files against the geometry they come from, over the specs of the output tests: the last profile pass of the
// G-code cuts every part at its nested size (tool centre r outside the part) and through the sheet; every hole drilled
// on a sheet is a row of drilling.csv at the same place, Ø and depth; the DXF carries the same holes on layers named
// after their real Ø and depth, the nested rectangles on the contour layer and every groove.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { registerFixtures, OUTPUT_SPECS, outputMeta } from './fixtures.mjs';
import { buildModel } from '../../engine/model.js';
import { drillCsv } from '../../engine/drill.js';
import { nest } from '../../engine/nest.js';
import { toGcode, SPOIL, GROOVE_MILL } from '../../engine/cam.js';
import { toDxf } from '../../engine/dxf.js';
import { cutSize, THROUGH_EXTRA } from '../../engine/panel.js';
import { STOCK } from '../../engine/materials.js';
import { r1 } from '../../engine/util.js';

registerFixtures();

const near = (a, b, tol) => Math.abs(a - b) <= tol;

// G-code lines with the modal position after each: comment, motion mode, whether the line moved.
function walkGcode(text) {
  const out = [];
  let [X, Y, Z, motion] = [0, 0, 50, 'G0'];
  for (const raw of text.split('\n')) {
    const comment = /^\((.*)\)$/.exec(raw.trim())?.[1] ?? null;
    const line = raw.replace(/\(.*?\)/g, '').trim();
    const w = Object.fromEntries([...line.matchAll(/([A-Z])(-?\d+\.?\d*)/g)].map((m) => [m[1], Number(m[2])]));
    for (const m of line.matchAll(/G(\d+)/g)) if (['0', '1', '2', '3'].includes(m[1])) motion = `G${m[1]}`;
    const moved = w.X !== undefined || w.Y !== undefined || w.Z !== undefined;
    [X, Y, Z] = [w.X ?? X, w.Y ?? Y, w.Z ?? Z];
    out.push({ comment, motion, moved, X, Y, Z, F: w.F });
  }
  return out;
}

// Rows of a semicolon CSV with quoted cells.
function csvRows(text) {
  return text
    .split('\r\n')
    .filter(Boolean)
    .map((line) => [...line.matchAll(/(?:^|;)("(?:[^"]|"")*"|[^;]*)/g)].map((m) => m[1].replace(/^"|"$/g, '').replaceAll('""', '"')));
}
const csvNum = (s) => Number(s.replace(',', '.'));

// Entities of an ASCII DXF: CIRCLE, LINE, and POLYLINE with its vertices.
function dxfEntities(text) {
  const lines = text.split('\n');
  const pairs = [];
  for (let i = 0; i + 1 < lines.length; i += 2) pairs.push([Number(lines[i]), lines[i + 1]]);
  const start = pairs.findIndex(([c, v]) => c === 2 && v === 'ENTITIES');
  const out = [];
  let cur = null;
  let poly = null;
  for (const [code, value] of pairs.slice(start + 1)) {
    if (code === 0) {
      if (value === 'VERTEX' && poly) cur = { type: 'VERTEX' };
      else if (value === 'SEQEND') {
        cur = null;
        poly = null;
      } else {
        cur = { type: value };
        if (value === 'POLYLINE') poly = Object.assign(cur, { vertices: [] });
        if (value !== 'ENDSEC' && value !== 'EOF') out.push(cur);
      }
      if (cur?.type === 'VERTEX') poly.vertices.push(cur);
      continue;
    }
    if (!cur) continue;
    if (code === 8) cur.layer = value;
    else cur[code] = Number(value);
  }
  return out;
}
const layerNum = (s) => Number(s.replace('_', '.'));

for (const [ci, input] of OUTPUT_SPECS.entries()) {
  test(`CNC geometry ${ci + 1}: ${input.type}${Object.keys(input).length > 1 ? ' variant' : ''}`, () => {
    const model = buildModel(input);
    const label = `${ci + 1}-${model.spec.type}`;
    const byId = new Map(model.parts.map((p) => [p.id, p]));
    const csv = csvRows(drillCsv(model)).slice(1).filter((r) => !r[3].startsWith('Ч'));
    const nesting = nest(model);
    for (const sheet of nesting.sheets) {
      const T = STOCK[sheet.stock].thickness;
      const g = toGcode(model, sheet, { ...outputMeta(model), sheetCount: nesting.sheets.length });
      const r = g.tools.at(-1).d / 2;
      const where = `${label} sheet ${sheet.index}`;

      // the last profile pass: every part at its nested size, the tool centre r outside it, down to the spoilboard
      const lines = walkGcode(g.text);
      const last = lines.findLastIndex((l) => l.comment?.startsWith('PROFILE PASS'));
      assert.ok(last >= 0, `${where}: no profile pass`);
      const boxes = new Map();
      let part = null;
      for (const l of lines.slice(last + 1)) {
        if (l.comment !== null) {
          const id = l.comment.split(' ')[0];
          part = sheet.placements.some((p) => p.partId === id) ? id : null;
          continue;
        }
        if (!part || !l.moved || (l.motion !== 'G1' && l.motion !== 'G2')) continue;
        const b = boxes.get(part) ?? { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity, z: Infinity };
        boxes.set(part, { x0: Math.min(b.x0, l.X), y0: Math.min(b.y0, l.Y), x1: Math.max(b.x1, l.X), y1: Math.max(b.y1, l.Y), z: Math.min(b.z, l.Z) });
      }
      assert.equal(boxes.size, sheet.placements.length, `${where}: not every part has a contour in the last pass`);
      for (const pl of sheet.placements) {
        const b = boxes.get(pl.partId);
        const want = [pl.x - r, pl.y - r, pl.x + pl.w + r, pl.y + pl.h + r];
        assert.ok([b.x0, b.y0, b.x1, b.y1].every((v, i) => near(v, want[i], 0.002)), `${where}: ${pl.name} contour ${[b.x0, b.y0, b.x1, b.y1]} vs ${want}`);
        assert.ok(near(b.z, -(T + SPOIL), 0.001), `${where}: ${pl.name} cut to Z${b.z}, not through`);
      }

      // every hole drilled on the sheet is a row of drilling.csv: the same place, Ø and depth, one to one
      const dia = new Map(g.tools.map((t) => [t.id, t.d]));
      const drilled = g.moves.filter((m) => m.type === 'drill').map((m) => ({ X: m.at[0], Y: m.at[1], d: dia.get(m.tool), depth: m.depth }));
      const expected = [];
      for (const pl of sheet.placements) {
        const cut = cutSize(byId.get(pl.partId), model.spec.bandCompensation);
        for (const row of csv.filter((c) => c[0] === pl.partId)) {
          const [u, v] = [csvNum(row[4]) - cut.du0, csvNum(row[5]) - cut.dv0];
          const [X, Y] = pl.rot ? [pl.x + cut.W - v, pl.y + u] : [pl.x + u, pl.y + v];
          expected.push({ X, Y, d: csvNum(row[6]), depth: r1(Math.min(csvNum(row[7]), T + THROUGH_EXTRA)), what: `${pl.name} hole ${row[3]}` });
        }
      }
      assert.equal(drilled.length, expected.length, `${where}: holes in the G-code vs drilling.csv`);
      const left = [...drilled];
      for (const e of expected) {
        const i = left.findIndex((h) => near(h.X, e.X, 0.1) && near(h.Y, e.Y, 0.1) && h.d === e.d && near(h.depth, e.depth, 0.001));
        assert.ok(i >= 0, `${where}: ${e.what} (${e.X}, ${e.Y}, Ø${e.d} × ${e.depth}) is not drilled`);
        left.splice(i, 1);
      }

      // the DXF: the same holes (centre, radius, a layer named after Ø and depth), the nested rectangles, the grooves
      const ents = dxfEntities(toDxf(model, sheet).text);
      const circles = ents.filter((e) => e.type === 'CIRCLE');
      assert.equal(circles.length, drilled.length + g.ops.manual.length, `${where}: DXF circles vs holes`);
      const holes = [...drilled];
      for (const c of circles) {
        const m = /^DRILL_D(\d+(?:_\d+)?)_Z-(\d+(?:_\d+)?)$/.exec(c.layer);
        assert.ok(m, `${where}: circle on layer ${c.layer}`);
        const [d, depth] = [layerNum(m[1]), layerNum(m[2])];
        assert.ok(near(c[40], d / 2, 0.001), `${where}: circle radius ${c[40]} on ${c.layer}`);
        const i = holes.findIndex((h) => near(h.X, c[10], 0.001) && near(h.Y, c[20], 0.001) && h.d === d && near(h.depth, depth, 0.001));
        assert.ok(i >= 0, `${where}: DXF circle ${c[10]}, ${c[20]} on ${c.layer} is not a hole of the G-code`);
        holes.splice(i, 1);
      }
      const contourLayer = `CONTOUR_D${model.spec.tool}_Z-${String(r1(T + SPOIL)).replace('.', '_')}`;
      const rects = ents.filter((e) => e.type === 'POLYLINE' && e.layer === contourLayer).map((e) => e.vertices.map((v) => [v[10], v[20]]));
      assert.equal(rects.length, sheet.placements.length, `${where}: DXF contours on ${contourLayer} vs placements`);
      for (const pl of sheet.placements) {
        const want = [[pl.x, pl.y], [pl.x + pl.w, pl.y], [pl.x + pl.w, pl.y + pl.h], [pl.x, pl.y + pl.h]];
        assert.ok(rects.some((v) => v.length === 4 && v.every(([x, y], i) => near(x, want[i][0], 0.001) && near(y, want[i][1], 0.001))), `${where}: no DXF contour for ${pl.name}`);
      }
      const grooves = sheet.placements.reduce((a, pl) => a + byId.get(pl.partId).features.filter((f) => f.type === 'groove').length, 0);
      assert.equal(ents.filter((e) => e.type === 'LINE' && e.layer.startsWith('GROOVE_')).length, grooves, `${where}: DXF grooves`);
    }
  });
}

// The deepest step a milling tool takes below what it has already cut at the same spot. A cut starts where a rapid
// left the tool; the onion skin's last pass starts where the first did, so it steps only through the skin.
function deepestStep(text) {
  let [tool, cut, worst] = [null, null, 0];
  const cutTo = new Map();
  for (const l of walkGcode(text)) {
    const t = l.comment && /^(T\d+) /.exec(l.comment);
    if (t) tool = t[1];
    if (!l.moved) continue;
    if (l.motion === 'G0') {
      cut = `${l.X},${l.Y}`;
      continue;
    }
    if (tool !== GROOVE_MILL.id && tool !== 'T5') continue;
    const before = cutTo.get(cut) ?? 0;
    if (l.Z < before) {
      worst = Math.max(worst, before - l.Z);
      cutTo.set(cut, l.Z);
    }
  }
  return worst;
}

test('GRBL mills in steps of at most the step down and never feeds above the cap; the header says both', () => {
  const runs = [
    { type: 'wall', tool: 6, onion: false },
    { type: 'kitchen', modules: 3 },
    { type: 'wardrobe', grblStepDown: 1.5, grblMaxFeed: 1200 },
    { type: 'chest', grblStepDown: 20, grblMaxFeed: 10000 },
  ];
  for (const input of runs) {
    const model = buildModel({ ...input, post: 'grbl' });
    const { grblStepDown: step, grblMaxFeed: cap } = model.spec;
    const nesting = nest(model);
    for (const sheet of nesting.sheets) {
      const where = `${input.type} sheet ${sheet.index}`;
      const g = toGcode(model, sheet, { ...outputMeta(model), sheetCount: nesting.sheets.length });
      assert.ok(g.text.includes(`(STEP DOWN ${step} MM - MAX FEED ${cap} MM/MIN - SET IN THE PROJECT)`), `${where}: the limits are not in the header`);
      const feeds = walkGcode(g.text).filter((l) => l.F !== undefined).map((l) => l.F);
      assert.ok(feeds.length > 0 && Math.max(...feeds) <= cap, `${where}: feed ${Math.max(...feeds)} above ${cap}`);
      assert.ok(g.moves.every((m) => !m.F || m.F <= cap), `${where}: the time estimate sees a feed above the cap`);
      const worst = deepestStep(g.text);
      assert.ok(worst > 0 && worst <= step + 1e-6, `${where}: a milling step of ${worst} mm, the limit is ${step}`);
    }
  }
  // the same check on ISO finds the full-depth pass of an industrial machine: it would catch the old GRBL output
  const iso = buildModel({ type: 'wall', tool: 6, onion: false });
  const sheet = nest(iso).sheets[0];
  assert.ok(deepestStep(toGcode(iso, sheet, { ...outputMeta(iso), sheetCount: 1 }).text) > 18, 'ISO no longer cuts at full depth');
});
