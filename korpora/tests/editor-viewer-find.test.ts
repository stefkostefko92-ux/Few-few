// The 3D hangs the fixed member of a drawer slide on the carcass side beside the drawer (editor/viewer-find.js). In a
// Г or П kitchen every wall has its own coordinates, so a side found by x and y alone could be a cabinet of another
// wall: the search stays in the drawer's wall.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { browserModule } from './editor-modules.js';

interface Box {
  min: number[];
  max: number[];
}
interface Part {
  id: string;
  role: string;
  run?: string;
  box: Box;
  frame: { n: string };
}
interface Model {
  parts: Part[];
  groups: Array<{ type: string; partIds: string[] }>;
}

test('the side beside every drawer of a Г or П kitchen is found on the drawer’s own wall', async () => {
  const { registerFixtures } = await browserModule<{ registerFixtures(): void }>(
    'tests/engine/fixtures.mjs',
    ['registerFixtures'],
  );
  const { buildModel } = await browserModule<{ buildModel(spec: object): Model }>(
    'engine/model.js',
    ['buildModel'],
  );
  const { panelAt } = await browserModule<{
    panelAt(model: Model, x: number, y: number, run: string | undefined): Part | null;
  }>('editor/viewer-find.js', ['panelAt']);
  registerFixtures();
  for (const shape of ['line', 'left', 'right', 'u']) {
    const m = buildModel({ type: 'kitchen', shape, modulesLeft: 3, modulesRight: 3 });
    let found = 0;
    for (const g of m.groups.filter((x) => x.type === 'drawer')) {
      for (const side of m.parts.filter(
        (p) => g.partIds.includes(p.id) && p.role === 'drawer-side',
      )) {
        const left = side.frame.n === '+x';
        const out = left ? (side.box.min[0] ?? 0) : (side.box.max[0] ?? 0);
        const y = ((side.box.min[1] ?? 0) + (side.box.max[1] ?? 0)) / 2;
        // the carcass face is the slide's clearance away (12,5–13 mm with the systems of the catalogue)
        const panel = [12.5, 13, 12]
          .map((gap) => panelAt(m, out + (left ? -gap : gap), y, side.run))
          .find(Boolean);
        assert.ok(panel, `${shape}: a side beside ${side.id}`);
        assert.equal(
          panel.run,
          side.run,
          `${shape}: ${side.id} hangs on a cabinet of another wall`,
        );
        found += 1;
      }
    }
    assert.ok(found > 0, `${shape}: drawers`);
  }
});
