// The assembly sheet of a Г or П kitchen (engine/drawing-walls.js): the plan of the room — every wall with its letter
// and length, the swing of every base door — and the view of every wall from the front, all inside the frame and
// above the notes and the title block; a straight kitchen keeps its sheet with the section.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { registerFixtures } from './fixtures.mjs';
import { assertWellFormed } from './check.mjs';
import { buildModel } from '../../engine/model.js';
import { drawingAssembly } from '../../engine/drawing-assembly.js';

registerFixtures();
const meta = { product: 'Korpora', hash: 'a'.repeat(64), owner: 'Carbon Stealth VCC', date: '2026-10-02' };

// every rectangle, line and polyline of the views (not the frame, not the title block)
function viewCoords(svg) {
  const out = [];
  for (const m of svg.matchAll(/<(rect|line|polyline) class="d-(vis|front|hid|out|open|gnd|wall)[^"]*"([^>]*)>/g)) {
    const a = m[3];
    const num = (k) => Number(a.match(new RegExp(` ${k}="([-\\d.]+)"`))?.[1]);
    if (m[1] === 'rect') out.push([num('x'), num('y')], [num('x') + num('width'), num('y') + num('height')]);
    else if (m[1] === 'line') out.push([num('x1'), num('y1')], [num('x2'), num('y2')]);
    else for (const p of a.match(/points="([^"]*)"/)[1].trim().split(/\s+/)) out.push(p.split(',').map(Number));
  }
  return out;
}

for (const [shape, walls] of [['left', ['Стена А', 'Стена Б, лява']], ['right', ['Стена А', 'Стена В, дясна']], ['u', ['Стена А', 'Стена Б, лява', 'Стена В, дясна']]]) {
  for (const extra of [{}, { modules: 6, moduleWidth: 900, modulesLeft: 6, modulesRight: 6 }]) {
    test(`${shape} ${JSON.stringify(extra)}: the plan and every wall on sheet 1, inside the frame`, () => {
      const m = buildModel({ type: 'kitchen', shape, ...extra });
      const svg = drawingAssembly(m, meta);
      assertWellFormed(svg, shape);
      assert.match(svg, />План</);
      for (const w of walls) assert.ok(svg.includes(`>${w} — изглед<`), `${shape}: the view of ${w}`);
      assert.ok(!svg.includes('Разрез A–A'), `${shape}: no section`);
      assert.match(svg, shape === 'u' ? /П-образна кухня/ : /Г-образна кухня/);
      const baseDoors = m.parts.filter((p) => p.role === 'door' && p.module.startsWith('М')).length;
      assert.equal((svg.match(/d-swing/g) ?? []).length, baseDoors, `${shape}: the swing of every base door`);
      assert.equal((svg.match(/class="d-wall"/g) ?? []).length, walls.length, `${shape}: the walls of the room`);
      for (const [x, y] of viewCoords(svg)) {
        assert.ok(x >= 22 && x <= 408 && y >= 12 && y <= 250, `${shape}: ${x},${y} outside the drawing area`);
      }
    });
  }
}

test('the straight kitchen keeps its sheet: the front view and section A–A, no plan', () => {
  const svg = drawingAssembly(buildModel({ type: 'kitchen' }), meta);
  assert.ok(svg.includes('Разрез A–A'));
  assert.ok(!svg.includes('>План<'));
});
