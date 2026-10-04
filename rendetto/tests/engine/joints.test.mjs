// Joints and the hardware list: the bed's dimensions come from its own geometry, and what holds the parts together is
// buildable and counted. Runs on the base catalog and the documented slide systems.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { registerCatalog, baseCatalogData } from '../../engine/catalog.js';
import { buildModel } from '../../engine/model.js';
import { TYPES } from '../../engine/types.js';

registerCatalog(baseCatalogData());

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
