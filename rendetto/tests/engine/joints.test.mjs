// Joints and the hardware list: the bed's dimensions come from its own geometry, and what holds the parts together is
// buildable and counted. Runs on the base catalog and the documented slide systems.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { registerCatalog, baseCatalogData } from '../../engine/catalog.js';
import { buildModel } from '../../engine/model.js';
import { TYPES } from '../../engine/types.js';
import { nest } from '../../engine/nest.js';
import { cncBlockers } from '../../engine/cam.js';

const catalog = registerCatalog(baseCatalogData());
const SLIDES = catalog.slideFamilies.map((s) => s.id);
const errorsOf = (m) => m.warnings.filter((w) => w.level === 'error');

const outerBox = (m) => ({
  W: Math.max(...m.parts.map((p) => p.box.max[0])) - Math.min(...m.parts.map((p) => p.box.min[0])),
  D: Math.max(...m.parts.map((p) => p.box.max[2])) - Math.min(...m.parts.map((p) => p.box.min[2])),
});

test('the bed: dimensions in the title bar are the outer size of its boards', () => {
  for (const [mattressW] of TYPES.bed.params.find((p) => p.key === 'mattressW').options) {
    for (const [mattressL] of TYPES.bed.params.find((p) => p.key === 'mattressL').options) {
      const m = buildModel({ type: 'bed', mattressW, mattressL });
      const box = outerBox(m);
      assert.equal(m.dims.W, box.W, `${mattressW}×${mattressL}: width ${m.dims.W} vs boards ${box.W}`);
      assert.equal(m.dims.D, box.D, `${mattressW}×${mattressL}: length ${m.dims.D} vs boards ${box.D}`);
    }
  }
});

test('drawer slides on the two faces of a partition never share a hole; when they would, the CNC is withheld', () => {
  // two neighbouring drawer columns: chest, TV cabinet, and the TV part of a narrow wall unit
  const specs = [{ type: 'chest', columns: 2 }, { type: 'tv', columns: 2 }, { type: 'wallunit', width: 2200 }];
  const slideHoles = (p) => p.features.filter((f) => f.kind === 'slide').length;
  for (const slide of SLIDES) {
    for (const spec of specs) {
      const m = buildModel({ ...spec, slide });
      for (const part of m.parts.filter((p) => p.role === 'partition')) {
        // the two columns are alike: one slide per drawer on each face, as many holes as on both outer sides together
        const sides = m.parts.filter((p) => p.role === 'side' && p.module === part.module);
        if (slideHoles(part) === sides.reduce((a, p) => a + slideHoles(p), 0)) continue;
        const label = `${slide} ${spec.type} ${part.name}`;
        assert.ok(errorsOf(m).some((e) => e.text.startsWith(`${part.name}:`)), `${label}: slide holes shared across the partition without an error`);
        assert.ok(cncBlockers(m, nest(m)).length > 0, `${label}: no CNC blocker`);
      }
    }
  }
});

const bedSpecs = () => {
  const out = [];
  for (const [mattressW] of TYPES.bed.params.find((p) => p.key === 'mattressW').options) {
    for (const footHeight of [0, 450]) for (const railHeight of [200, 250, 350]) out.push({ type: 'bed', mattressW, footHeight, railHeight });
  }
  return out;
};

test('the bed: every confirmat head on the outside gets a cap, with or without a footboard', () => {
  for (const spec of bedSpecs()) {
    const m = buildModel(spec);
    const heads = m.parts.reduce((a, p) => a + p.features.filter((f) => f.type === 'hole' && f.kind === 'confirmat').length, 0);
    const caps = m.hardware.filter((h) => h.key.startsWith('caps:')).reduce((a, h) => a + h.qty, 0);
    assert.equal(caps, heads, `${JSON.stringify(spec)}: ${caps} caps for ${heads} confirmat heads`);
  }
});

test('the bed: both halves of every bed fitting sit clear of the ledgers', () => {
  // distance from a point to a part's box, mm
  const toBox = (w, b) => Math.hypot(...[0, 1, 2].map((i) => Math.max(b.min[i] - w[i], 0, w[i] - b.max[i])));
  for (const spec of bedSpecs()) {
    const m = buildModel(spec);
    const ledgers = m.parts.filter((p) => p.role === 'bed-ledger');
    const marks = m.parts.flatMap((p) => p.features.filter((f) => f.kind === 'bedfit').map((f) => ({ part: p, w: f.world })));
    assert.equal(marks.length, 8, `${JSON.stringify(spec)}: ${marks.length} fitting halves`);
    for (const { part, w } of marks) {
      for (const l of ledgers) assert.ok(toBox(w, l.box) >= 40, `${JSON.stringify(spec)}: fitting on ${part.name} ${toBox(w, l.box).toFixed(1)} mm from ${l.name}`);
    }
  }
});

test('the bed: a footboard lower than the rail is raised to it, with a notice', () => {
  const notice = (m) => m.warnings.some((w) => w.level === 'info' && w.text.startsWith('Таблата при краката'));
  const low = buildModel({ type: 'bed', footHeight: 100, railBottom: 150, railHeight: 250 });
  assert.equal(low.parts.find((p) => p.key === 'foot').box.max[1], 400);
  assert.ok(notice(low), 'a raised footboard without a notice');
  assert.ok(!notice(buildModel({ type: 'bed', footHeight: 450 })), 'a notice for a footboard above the rail');
  assert.ok(!notice(buildModel({ type: 'bed', footHeight: 0 })), 'a notice for a bed without a footboard');
});
