// Joints and the hardware list: the bed's dimensions come from its own geometry, and what holds the parts together is
// buildable and counted. Runs on the base catalog and the documented slide systems.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { registerCatalog, baseCatalogData } from '../../engine/catalog.js';
import { buildModel } from '../../engine/model.js';
import { TYPES, typeDims } from '../../engine/types.js';
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
      const dims = typeDims('bed', m.spec);
      assert.equal(dims.W, box.W, `${mattressW}×${mattressL}: width ${dims.W} vs boards ${box.W}`);
      assert.equal(dims.D, box.D, `${mattressW}×${mattressL}: length ${dims.D} vs boards ${box.D}`);
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

test('back panels: nails only where two backs meet behind a partition, about one per 150 mm', () => {
  const nailsOf = (m) => m.hardware.find((h) => h.key === 'nails')?.qty ?? 0;
  for (const spec of [{ type: 'base' }, { type: 'nightstand' }, { type: 'tall' }]) assert.equal(nailsOf(buildModel(spec)), 0, `${spec.type}: a back in grooves all round got nails`);
  for (const spec of [{ type: 'wardrobe' }, { type: 'wardrobe', width: 3000, columns: 5 }, { type: 'bookcase', columns: 4 }, { type: 'tv' }, { type: 'chest', columns: 2 }]) {
    const m = buildModel(spec);
    const partitions = m.parts.filter((p) => p.role === 'partition');
    const inside = (x) => partitions.some((p) => x > p.box.min[0] && x < p.box.max[0]);
    // the length of back edge that meets a partition, and how many backs have such an edge
    let edge = 0;
    let backs = 0;
    for (const b of m.parts.filter((p) => p.role === 'back')) {
      const n = [b.box.min[0], b.box.max[0]].filter(inside).length;
      edge += n * b.L;
      backs += n ? 1 : 0;
    }
    const nails = nailsOf(m);
    assert.ok(edge > 0, `${spec.type}: no back meets a partition`);
    assert.ok(nails >= edge / 150 && nails < edge / 150 + backs, `${spec.type}: ${nails} nails for ${edge} mm of partition edges`);
  }
});

test('drawer boxes are cut from board as thick as the slide system wants, or the drawer is not made', async () => {
  // registered last: the extra slide systems never become a default for the tests above
  const { registerSlideSystems, registerSlides } = await import('../../engine/hardware.js');
  const { SLIDE_SYSTEMS } = await import('../../engine/data/slide-systems.js');
  const gtv = SLIDE_SYSTEMS.find((s) => s.id === 'gtv_h45');
  registerSlideSystems([18, 15].map((t) => ({ ...gtv, id: `test_box${t}`, boxSide: t })));
  registerSlides([18, 15].map((t) => ({ id: `test:box${t}`, system: `test_box${t}`, brand: 'Test', name: `Водач (тест), кутия ${t} mm`, products: {} })));
  for (const [slide, stock, T] of [[SLIDES.find((s) => s.includes('gtv_h45')), 'pb16', 16], ['test:box18', 'pb18', 18]]) {
    const m = buildModel({ type: 'nightstand', slide });
    const box = m.parts.filter((p) => p.role === 'drawer-side' || p.role === 'drawer-back');
    assert.ok(box.length > 0, `${slide}: no drawer box`);
    for (const p of box) assert.ok(p.stock === stock && p.T === T, `${slide}: ${p.name} is ${p.stock} ${p.T} mm`);
  }
  const m = buildModel({ type: 'nightstand', slide: 'test:box15' });
  assert.equal(m.parts.filter((p) => p.role === 'drawer-side').length, 0, 'a 15 mm box was made from another board');
  assert.ok(errorsOf(m).some((e) => e.text.includes('15 mm')), 'no error for a box side without its board');
});
