// Precision: what the machine and the workshop receive is physically right. Handles inside their fronts, hinges inside
// their doors and never sharing a plate hole across a partition, doors within the hinge maker's width, plinths and
// parameters on their step, exactly the columns asked for, screws that stay inside the boards, every hole inside its
// part on the sheet — and no G-code or DXF at all while the checks find an error. Runs on the base catalog (standard
// handle spacings with their lengths) and the documented hinge and slide systems.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { registerCatalog, baseCatalogData } from '../../engine/catalog.js';
import { buildModel } from '../../engine/model.js';
import { TYPE_ORDER } from '../../engine/types.js';
import { cutSize } from '../../engine/panel.js';
import { nest } from '../../engine/nest.js';
import { toGcode, cncBlockers } from '../../engine/cam.js';
import { toDxf } from '../../engine/dxf.js';
import { HINGE_LIMITS } from '../../engine/hardware.js';
import { drawingAssembly } from '../../engine/drawing-assembly.js';
import { drawingPart, drawingParts } from '../../engine/drawing-part.js';
import { assertPlateHoles, paramVariants } from './check.mjs';

const catalog = registerCatalog(baseCatalogData());
const HANDLES = catalog.handles.map((h) => h.id);
const HINGES = catalog.hingeFamilies.map((h) => h.id);
const SLIDES = catalog.slideFamilies.map((s) => s.id);
const meta = { product: 'Rendetto', hash: 'b'.repeat(64), owner: 'Carbon Stealth VCC', date: '2026-10-03' };
const errorsOf = (m) => m.warnings.filter((w) => w.level === 'error');
const variants = (type) => paramVariants(type).map(([, spec]) => spec);
// the scale in a drawing's title block, and the scales ISO 5455 allows
const ISO_5455 = ['1', '2', '5', '10', '20', '50', '100'];
const scaleOf = (svg) => /Мащаб<\/text><text class="d-tv" x="[\d.]+" y="[\d.]+">1:(\d+)</.exec(svg)?.[1];

test('every handle stays inside its front with a margin, or is left off with a warning', () => {
  for (const type of TYPE_ORDER) {
    for (const handle of HANDLES) {
      for (const spec of [{ type, handle }, ...variants(type).map((v) => ({ ...v, handle }))]) {
        const m = buildModel(spec);
        for (const s of m.symbols.filter((x) => x.type === 'handle')) {
          const front = m.parts.find((p) => p.id === s.partId);
          const h = s.model;
          const half = (h.length ?? (h.holes === 2 ? h.spacing + 40 : h.width ?? 30)) / 2;
          const [lo, hi] = s.horizontal ? [front.box.min[0], front.box.max[0]] : [front.box.min[1], front.box.max[1]];
          const at = s.horizontal ? s.x : s.y;
          assert.ok(at - half >= lo + 19.9 && at + half <= hi - 19.9, `${type} ${handle}: ${front.name} handle body ${at - half}…${at + half} outside ${lo}…${hi}`);
        }
        for (const front of m.parts.filter((p) => p.role === 'door' || p.role === 'drawer-front')) {
          const holes = front.features.filter((f) => f.kind === 'handle');
          const placed = m.symbols.some((x) => x.type === 'handle' && x.partId === front.id);
          if (!placed) {
            assert.equal(holes.length, 0, `${type} ${handle}: ${front.name} has handle holes without a handle`);
            if (handle !== 'none') assert.ok(m.warnings.some((w) => w.text.startsWith(`${front.name}: дръжка`)), `${type} ${handle}: ${front.name} lost its handle silently`);
          }
        }
      }
    }
  }
});

test('the long bars of the agent report: 320 on a base door, 256 and 320 on a wall door', () => {
  for (const [type, handle] of [['base', 'base:bar-320'], ['wall', 'base:bar-256'], ['wall', 'base:bar-320']]) {
    const m = buildModel({ type, handle });
    const door = m.parts.find((p) => p.role === 'door');
    const cut = cutSize(door, m.spec.bandCompensation);
    for (const f of door.features.filter((x) => x.kind === 'handle')) {
      assert.ok(f.u - f.d / 2 >= cut.du0 && f.u + f.d / 2 <= cut.du0 + cut.L, `${type} ${handle}: hole u ${f.u} outside the door`);
    }
  }
});

test('hinges: inside the door, apart from each other, never sharing a plate hole across a partition', () => {
  const specs = [
    { type: 'tv', width: 2600, height: 350, legs: 0, columns: 2, tvFronts: 'doors' },
    { type: 'tv', width: 1910, height: 375, legs: 105, columns: 3, tvFronts: 'doors' },
    { type: 'wardrobe', width: 3000, columns: 2 },
    { type: 'wardrobe', width: 2000, columns: 5 },
    { type: 'bookcase', width: 2400, columns: 4 },
    { type: 'kitchen', modules: 6, moduleWidth: 900 },
  ];
  for (const base of specs) {
    for (const hinge of HINGES) {
      const m = buildModel({ ...base, hinge });
      for (const door of m.parts.filter((p) => p.role === 'door')) {
        if (door.box.max[0] - door.box.min[0] > HINGE_LIMITS.maxWidth + 0.01) {
          assert.ok(errorsOf(m).some((e) => e.text.includes(`над ${HINGE_LIMITS.maxWidth} mm`)), `${door.name}: wider than ${HINGE_LIMITS.maxWidth} without an error`);
        }
        if (!door.hingeYs) {
          assert.ok(errorsOf(m).some((e) => e.text.startsWith(door.name)), `${door.name}: no hinges and no error`);
          continue;
        }
        for (const y of door.hingeYs) assert.ok(y - door.box.min[1] >= 47.5 && door.box.max[1] - y >= 47.5, `${hinge} ${door.name}: hinge at ${y} too close to the edge`);
        door.hingeYs.slice(1).forEach((y, k) => assert.ok(y - door.hingeYs[k] >= 64 - 0.01, `${hinge} ${door.name}: hinges ${door.hingeYs[k]} and ${y} too close`));
        const cups = door.features.filter((f) => f.kind === 'cup');
        for (let i = 0; i < cups.length; i++) for (let j = i + 1; j < cups.length; j++) assert.ok(Math.hypot(cups[i].u - cups[j].u, cups[i].v - cups[j].v) >= cups[i].d + 2, `${door.name}: cups overlap`);
      }
      // a partition: every plate hole serves one plate only (the screws from both faces would meet)
      assertPlateHoles(m, `${hinge} ${base.type}`);
    }
  }
});

test('Hettich: hinges at least 280 mm apart, or an error (catalogue 2025, p. 129)', () => {
  const m = buildModel({ type: 'wall', width: 400, height: 300, hinge: 'base:hettich_sensys' });
  const door = m.parts.find((p) => p.role === 'door');
  const gap = door.hingeYs ? door.hingeYs[1] - door.hingeYs[0] : 0;
  if (gap < 280) assert.ok(errorsOf(m).some((e) => e.text.includes('Hettich изисква поне 280 mm')), 'short Hettich door without the error');
  const tall = buildModel({ type: 'tall', hinge: 'base:hettich_sensys' });
  const d = tall.parts.find((p) => p.role === 'door');
  d.hingeYs.slice(1).forEach((y, k) => assert.ok(y - d.hingeYs[k] >= 280, `tall door hinges ${d.hingeYs[k]} / ${y}`));
  assert.ok(d.hingeYs[0] - d.box.min[1] >= 60 && d.hingeYs[0] - d.box.min[1] <= 100, `bottom hinge ${d.hingeYs[0] - d.box.min[1]} mm from the edge`);
});

test('parameters sit on their step; a plinth under 40 mm is not made', () => {
  for (const legs of [1, 3, 4, 5, 7, 22, 38, 39, 40, 41]) {
    const m = buildModel({ type: 'wardrobe', legs });
    assert.equal(m.spec.legs % 5, 0, `legs ${legs} → ${m.spec.legs}`);
    const plinth = m.parts.find((p) => p.role === 'plinth');
    if (m.spec.legs < 40) assert.equal(plinth, undefined, `legs ${m.spec.legs}: a plinth was made`);
    else assert.ok(plinth && plinth.W >= 37, `legs ${m.spec.legs}: plinth ${plinth?.W}`);
  }
  assert.equal(buildModel({ type: 'kitchen', moduleWidth: 604 }).spec.moduleWidth, 600);
  assert.equal(buildModel({ type: 'base', width: 601.4 }).spec.width, 601);
});

test('a wardrobe has exactly the columns asked for, whatever the number of carcasses', () => {
  for (let width = 800; width <= 3000; width += 110) {
    for (let columns = 2; columns <= 5; columns++) {
      const m = buildModel({ type: 'wardrobe', width, columns, layout: 'shelves' });
      const carcasses = new Set(m.parts.filter((p) => p.role === 'side').map((p) => p.module));
      const partitions = m.parts.filter((p) => p.role === 'partition').length;
      assert.equal(partitions + carcasses.size, columns, `width ${width}, ${columns} columns: got ${partitions + carcasses.size}`);
      const right = Math.max(...m.parts.map((p) => p.box.max[0]));
      assert.equal(right, width, `width ${width}: the carcasses end at ${right}`);
    }
  }
});

test('screws stay inside the boards: bed ledgers and stacked carcasses take 4 × 30', () => {
  for (const spec of [{ type: 'bed' }, { type: 'bed', mattressW: 900 }, { type: 'bookcase', doorZone: 800 }]) {
    const m = buildModel(spec);
    assert.ok(!m.hardware.some((h) => /4×40/.test(h.name)), `${spec.type}: a 4×40 screw is still listed`);
    assert.ok(!m.parts.some((p) => p.features.some((f) => /4×40/.test(f.label ?? ''))), `${spec.type}: a hole still says 4×40`);
  }
  // the centre beam is screwed from both faces: the two rows never share a height
  const beam = buildModel({ type: 'bed', mattressW: 1600 }).parts.find((p) => p.role === 'bed-beam');
  const us = beam.features.filter((f) => f.kind === 'pilot').map((f) => f.u).sort((a, b) => a - b);
  us.slice(1).forEach((u, k) => assert.ok(u - us[k] >= 20, `beam pilots ${us[k]} and ${u} too close`));
});

test('drawer box corners keep 3 mm of board to the bottom groove on every slide system', () => {
  for (const slide of SLIDES) {
    const m = buildModel({ type: 'chest', slide });
    for (const side of m.parts.filter((p) => p.role === 'drawer-side')) {
      const groove = side.features.find((f) => f.type === 'groove');
      for (const h of side.features.filter((f) => f.kind === 'confirmat')) {
        const web = Math.abs(h.v - groove.v1) - (groove.w + h.d) / 2;
        assert.ok(web >= 2.99 || Math.abs(h.v - groove.v1) > 30, `${slide} ${side.name}: ${web} mm to the groove`);
      }
    }
  }
});

test('the kitchen worktop reaches past the closed fronts at every depth', () => {
  for (const depth of [500, 530, 560, 600]) {
    const m = buildModel({ type: 'kitchen', depth });
    const top = m.symbols.find((s) => s.type === 'worktop');
    const fronts = Math.max(...m.parts.filter((p) => p.role === 'door' || p.role === 'drawer-front').map((p) => p.box.max[2]));
    assert.ok(top.z1 - fronts >= 20 && top.z1 - fronts < 30, `depth ${depth}: worktop ${top.z1}, fronts ${fronts}`);
    assert.ok(m.hardware.some((h) => h.key === 'worktop' && h.name.includes(`× ${top.z1} mm`)), `depth ${depth}: worktop line`);
  }
});

test('every hole lands inside its part on the sheet; no G-code or DXF while a check finds an error', () => {
  for (const type of TYPE_ORDER) {
    for (const spec of variants(type)) {
      for (const hinge of [HINGES[0], HINGES[1]]) {
        const m = buildModel({ ...spec, hinge, handle: 'base:bar-128' });
        const n = nest(m);
        const blockers = cncBlockers(m, n);
        if (errorsOf(m).length || n.errors.length) {
          assert.ok(blockers.length > 0, `${type}: an error without a blocker`);
          // sheetOps refuses the model's own errors; a nesting error is refused by the callers through cncBlockers()
          if (errorsOf(m).length) {
            assert.throws(() => toGcode(m, n.sheets[0], { ...meta, sheetCount: n.sheets.length }), /CNC blocked/);
            assert.throws(() => toDxf(m, n.sheets[0]), /CNC blocked/);
          }
          continue;
        }
        assert.deepEqual(blockers, [], `${type} ${JSON.stringify(spec)}: ${blockers.join(' | ')}`);
        for (const sheet of n.sheets) {
          const g = toGcode(m, sheet, { ...meta, sheetCount: n.sheets.length });
          for (const { tool, holes } of g.ops.drillOps) {
            const r = tool.d / 2; // the whole bore, not only its centre: a Ø35 cup reaches 17.5 mm out
            for (const h of holes) {
              const pl = sheet.placements.find((p) => p.partId === h.partId);
              assert.ok(h.X - r >= pl.x - 0.05 && h.X + r <= pl.x + pl.w + 0.05 && h.Y - r >= pl.y - 0.05 && h.Y + r <= pl.y + pl.h + 0.05, `${type}: Ø${tool.d} hole ${h.X},${h.Y} outside ${pl.name}`);
            }
          }
        }
      }
    }
  }
});

test('G-code: feed per minute, Z to reference before every tool change, a safe program name', () => {
  const m = buildModel({ type: 'base' });
  const n = nest(m);
  const g = toGcode(m, n.sheets[0], { ...meta, product: 'Rendetto)\nG0 Z-500\n(', sheetCount: n.sheets.length });
  const lines = g.text.split('\n');
  assert.ok(lines.some((l) => /^G21 G17 G90 G94/.test(l)), 'G94 missing');
  lines.forEach((l, i) => {
    if (/^T\d+ M6$/.test(l)) assert.deepEqual(lines.slice(i - 2, i), ['G91 G28 Z0', 'G90'], `no Z return before ${l}`);
  });
  assert.ok(!lines.some((l) => /^G0 Z-500/.test(l)), 'the program name broke out of its comment');
});

test('drawings: ISO 5455 scales only, the section plane with its arrows, notes from the model', () => {
  for (const type of TYPE_ORDER) {
    const m = buildModel({ type });
    const svg = drawingAssembly(m, meta);
    const scale = scaleOf(svg);
    assert.ok(ISO_5455.includes(scale), `${type}: scale 1:${scale}`);
    assert.equal((svg.match(/class="d-cpah"/g) ?? []).length, 2, `${type}: section arrows`);
    if (type === 'bed') assert.ok(!svg.includes('HDF') && !svg.includes('рафтоносачи'), 'bed notes speak of shelves or HDF');
    for (const p of drawingParts(m)) {
      const sc = scaleOf(drawingPart(m, meta, p.id));
      assert.ok(ISO_5455.includes(sc), `${type} ${p.name}: scale 1:${sc}`);
    }
    assert.ok(!drawingParts(m).some((p) => p.role === 'back' || p.role === 'drawer-bottom'), `${type}: HDF parts get a sheet`);
  }
});
