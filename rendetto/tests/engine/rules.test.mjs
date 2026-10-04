// Construction rules kept in one place and checked on the built model: the sizes shown for a project, the front
// material, stacked carcasses screwed clear of the confirmat bores, legs, doors too narrow for their hinge cup, the
// advice on a top that outgrows the sheet, and the one HTML escaper shared by the drawings and the editor.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { registerCatalog, baseCatalogData } from '../../engine/catalog.js';
import { registerRal } from '../../engine/materials.js';
import { buildModel } from '../../engine/model.js';
import { TYPE_ORDER, typeDims, dimsText } from '../../engine/types.js';
import { MIN_WEB } from '../../engine/joinery.js';
import { AX, dot, neg, esc } from '../../engine/util.js';

registerCatalog(baseCatalogData());
registerRal([{ code: 'RAL 9016', name: 'Транспортно бяло', hex: '#f1f0ea' }]);

const extent = (m, i) => Math.max(...m.parts.map((p) => p.box.max[i])) - Math.min(...m.parts.map((p) => p.box.min[i]));

test('a wall cabinet shows its own height, not the height of its top above the floor', () => {
  const m = buildModel({ type: 'wall' });
  assert.deepEqual(typeDims('wall', m.spec), { W: 600, H: 720, D: 320 });
  assert.equal(typeDims('wall', m.spec).H, extent(m, 1));
  assert.equal(dimsText('wall', m.spec), '600 × 720 × 320 mm');
});

test('lacquered RAL fronts: bed boards in MDF without edge band, the desk top in the carcass decor', () => {
  const ral = { frontMaterial: 'ral', frontRal: 'RAL 9016' };
  const bed = buildModel({ type: 'bed', ...ral });
  const boards = bed.parts.filter((p) => p.role === 'bed-head' || p.role === 'bed-foot');
  assert.equal(boards.length, 2);
  for (const p of boards) {
    assert.deepEqual([p.stock, p.decor, p.bands], ['mdf18', 'RAL 9016', {}], p.name);
  }
  const plain = buildModel({ type: 'bed' }).parts.find((p) => p.role === 'bed-head');
  assert.deepEqual([plain.stock, plain.bands['+y']], ['pb18', 2]);
  const desk = buildModel({ type: 'desk', ...ral });
  assert.equal(desk.parts.find((p) => p.key === 'deskTop').decor, desk.spec.carcassDecor);
  const deskDecor = buildModel({ type: 'desk' });
  assert.equal(deskDecor.parts.find((p) => p.key === 'deskTop').decor, deskDecor.spec.frontDecor);
});

// Bore axes in the edges of a board, as segments in its (u, v) plane: from the edge into the board.
function bores(p) {
  return p.edgeOps.flatMap((e) => {
    const into = AX[neg(e.edge)];
    const du = dot(into, AX[p.frame.eu]) * e.depth;
    const dv = dot(into, AX[p.frame.ev]) * e.depth;
    return e.at.map(([u, v]) => ({ u1: u, v1: v, u2: u + du, v2: v + dv, d: e.d }));
  });
}

function toSegment(u, v, s) {
  const du = s.u2 - s.u1;
  const dv = s.v2 - s.v1;
  const t = Math.min(1, Math.max(0, ((u - s.u1) * du + (v - s.v1) * dv) / (du * du + dv * dv)));
  return Math.hypot(u - (s.u1 + t * du), v - (s.v1 + t * dv));
}

test('stacked carcasses: the screws and their pilots stay clear of the confirmat bores', () => {
  for (const width of [400, 900, 2400]) {
    for (const depth of [250, 300, 450]) {
      for (const columns of [1, 4]) {
        for (const doorZone of [400, 800]) {
          const m = buildModel({ type: 'bookcase', width, depth, columns, doorZone });
          const boards = m.parts.filter((p) => p.features.some((f) => f.hw === 'stack'));
          assert.equal(boards.length, 2, `${width}/${depth}/${columns}/${doorZone}: stacked boards`);
          for (const p of boards) {
            for (const f of p.features.filter((x) => x.hw === 'stack')) {
              const d = f.d ?? 3; // the pilot is drilled on site with Ø3 through the clearance hole
              for (const b of bores(p)) {
                const web = toSegment(f.u, f.v, b) - (d + b.d) / 2;
                assert.ok(web >= MIN_WEB, `${width}/${depth}/${columns}/${doorZone} ${p.name}: ${f.kind} at ${f.u},${f.v} is ${web} mm from a confirmat bore`);
              }
            }
          }
        }
      }
    }
  }
});

test('legs under 40 mm are not made: no 5 mm adjustable leg in the hardware list', () => {
  for (const type of ['base', 'tall', 'chest', 'nightstand', 'bookcase', 'tv']) {
    for (const legs of [5, 20, 35, 40]) {
      const m = buildModel({ type, legs });
      const lines = m.hardware.filter((h) => h.name.startsWith('Краче регулируемо'));
      const top = Math.max(...m.parts.map((p) => p.box.max[1]));
      assert.ok(Math.abs(top - m.spec.height) < 0.01, `${type} legs ${legs}: the top is at ${top}, not ${m.spec.height}`);
      if (legs < 40) {
        assert.deepEqual(lines, [], `${type} legs ${legs}: ${lines.map((h) => h.name).join(', ')}`);
        assert.ok(m.warnings.some((w) => w.level === 'info' && w.text.includes('Крачета под 40 mm')), `${type} legs ${legs}: no notice`);
        assert.equal(m.symbols.filter((s) => s.type === 'leg').length, 0, `${type} legs ${legs}: legs drawn`);
      } else {
        assert.ok(lines.some((h) => h.name === 'Краче регулируемо 40 mm'), `${type} legs ${legs}: no 40 mm legs`);
      }
    }
  }
});

test('doors narrower than twice the reach of their hinge cup are reported', () => {
  const m = buildModel({ type: 'wardrobe', width: 800, columns: 5, doorsPerColumn: 2, layout: 'hanging' });
  assert.ok(m.warnings.some((w) => w.level === 'warn' && w.text.startsWith('10 тесни врати')), m.warnings.map((w) => w.text).join(' | '));
  for (const type of TYPE_ORDER) {
    const w = buildModel({ type }).warnings.find((x) => /тесни врати|тясна врата/.test(x.text));
    assert.equal(w, undefined, `${type}: ${w?.text}`);
  }
});

test('a wall unit whose TV top outgrows the sheet says what to change', () => {
  const m = buildModel({ type: 'wallunit', width: 3590, sideWidth: 400 });
  const err = m.warnings.find((w) => w.level === 'error' && w.text.startsWith('ТВ Плот:'));
  assert.ok(err?.text.includes('увеличете ширината на колоните или намалете общата ширина'), err?.text);
});

test('esc: one escaper for the drawings and the editor, for both quote styles', () => {
  assert.equal(esc(`<a title='x' href="y">&</a>`), '&lt;a title=&#39;x&#39; href=&quot;y&quot;&gt;&amp;&lt;/a&gt;');
  assert.equal(esc(null), '');
  assert.equal(esc(undefined), '');
  assert.equal(esc(0), '0');
});
