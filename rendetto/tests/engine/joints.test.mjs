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
