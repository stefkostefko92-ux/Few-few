import test from 'node:test';
import assert from 'node:assert/strict';
import { CATALOG, byId } from '../src/catalog.js';
import { analyse } from '../src/geo/check.js';
import { loopGap, segDist } from '../src/geo/path.js';

// Overall dimensions each drawing states (mm); every one must be an extent of the model.
const STATED = {
  'A 65 170 7': [170, 75], 'A 45 170 7': [170, 70], 'A 45 175 2': [175, 60], 'A 37 150 7': [150, 70], 'A 37 170 2': [170, 60],
  'SG 225 50': [225, 150, 50], 'SN 60 65': [65, 65, 60], 'SN 65 200': [200, 65, 65], 'BRACCIO 160 190': [190, 30, 5],
};
function stated(code) {
  if (STATED[code]) return STATED[code];
  const [fam, a, b] = code.split(' ');
  const n = [Number(a), Number(b)];
  if (fam === 'B') return [n[1], n[0], n[0] === 65 ? 65 : 60];
  if (fam === 'SU' || fam === 'SD') return [...n, 65];
  if (fam === 'SC') return [n[1], n[0], 65];
  if (fam === 'SG') return [n[1], n[0], 50];
  throw new Error(`no stated size for ${code}`);
}

test('the catalogue lists all 48 articles once', () => {
  assert.equal(CATALOG.length, 48);
  assert.equal(new Set(CATALOG.map((i) => i.code)).size, 48);
  assert.equal(byId('SU-220-160').code, 'SU 220 160');
});

for (const item of CATALOG) {
  test(`${item.code}: closed solid with the catalogue's dimensions`, () => {
    const mb = item.build().build();
    const a = analyse(mb);
    assert.equal(a.open, 0, 'open edges');
    assert.equal(a.nonManifold, 0, 'non-manifold edges');
    assert.equal(a.degenerate, 0, 'degenerate triangles');
    assert.ok(a.volume > 0, 'outward-facing surfaces');
    const extents = a.size.map((v) => Math.round(v * 100) / 100);
    for (const d of stated(item.code)) assert.ok(extents.some((e) => Math.abs(e - d) < 0.01), `${d} mm not among extents ${extents}`);
    // Mass sanity: steel at 7.85 g/cm³, between 0.15 and 1.5 kg for every bracket in the book.
    const kg = a.volume * 7.85e-6;
    assert.ok(kg > 0.15 && kg < 1.5, `mass ${kg.toFixed(3)} kg`);
  });

  test(`${item.code}: holes clear of each other, of the outline and of the bends`, () => {
    const mb = item.build().build();
    for (const f of mb.faces) {
      const n = f.loop.length;
      for (const [i, h] of f.holes.entries()) {
        for (const h2 of f.holes.slice(i + 1)) assert.ok(loopGap(h, h2) >= 3, `${f.name}: holes ${loopGap(h, h2).toFixed(2)} mm apart`);
        for (let e = 0; e < n; e++) {
          const a = f.loop[e];
          const b = f.loop[(e + 1) % n];
          const gap = Math.min(...h.map((p) => segDist(p, a, b)));
          // A bend edge is the tangent line: the hole must stay out of the bend itself.
          const need = f.flags[e] == null ? 3 : 1.2;
          assert.ok(gap >= need, `${f.name}: hole ${gap.toFixed(2)} mm from ${f.flags[e] == null ? 'edge' : 'bend'}`);
        }
      }
    }
  });
}

// SG 225 50 (p. 61, as the owner described the real part): one lower part, 30 mm deep along the
// whole plate and 150 mm at the arm (x 50-95), carrying the two slots across the arm and the Ø12
// hole; the plate's top edge carries nothing. Built with y up and z away from the plate.
test('SG 225 50: slotted lower part with the hole, plain top edge', () => {
  const mb = byId('SG-225-50').build().build();
  const strip = [Infinity, -Infinity];
  const arm = [Infinity, -Infinity, -Infinity];
  let top = 0;
  for (let i = 0; i < mb.pos.length; i += 3) {
    const [x, y, z] = [mb.pos[i], mb.pos[i + 1], mb.pos[i + 2]];
    if (y >= 45 && z > 5 + 1e-6) top++;
    if (y > 5 + 1e-6 || z < 10) continue; // the flat of the lower part, behind the bend
    if (z <= 30 + 1e-6) [strip[0], strip[1]] = [Math.min(strip[0], x), Math.max(strip[1], x)];
    else [arm[0], arm[1], arm[2]] = [Math.min(arm[0], x), Math.max(arm[1], x), Math.max(arm[2], z)];
  }
  assert.equal(top, 0, 'nothing folded off the top edge');
  assert.ok(strip[0] < 1e-6 && Math.abs(strip[1] - 225) < 1e-6, `30 mm strip from x = ${strip[0]} to ${strip[1]}`);
  assert.ok(Math.abs(arm[0] - 50) < 1e-6 && Math.abs(arm[1] - 95) < 1e-6 && Math.abs(arm[2] - 150) < 1e-6, `arm x ${arm[0]}-${arm[1]}, to z = ${arm[2]}`);
  const span = (h, k) => Math.max(...h.map((p) => p[k])) - Math.min(...h.map((p) => p[k]));
  const mid = (h, k) => (Math.max(...h.map((p) => p[k])) + Math.min(...h.map((p) => p[k]))) / 2;
  const base = mb.faces.find((f) => f.name === 'base');
  const [hole, ...slots] = base.holes;
  assert.ok(Math.abs(span(hole, 0) - 12) < 0.01 && Math.abs(mid(hole, 0) - 38) < 0.01, 'Ø12 hole 38 mm from the end');
  assert.equal(slots.length, 2);
  for (const h of slots) assert.ok(Math.abs(span(h, 0) - 27) < 0.01 && Math.abs(span(h, 1) - 12) < 0.01, `slot ${span(h, 0).toFixed(1)} x ${span(h, 1).toFixed(1)} mm across the arm`);
  assert.equal(mb.faces.find((f) => f.name === 'plate').holes.length, 1, 'the plate keeps only its long slot');
});

// SU and SD arms carry a flange folded down along their straight side, 30 mm deep from the arm's
// top, from the wall flange to the arm end (pp. 20-38). Built in the wall frame: y up, z out.
const APRON_SIDE = { SU: 220, 'SD 150': 90, 'SD 220': 160 };
for (const item of CATALOG.filter((i) => i.family === 'SU' || i.family === 'SD')) {
  test(`${item.code}: stiffening flange under the arm, 30 mm deep, wall flange to arm end`, () => {
    const mb = item.build().build();
    assert.ok(mb.faces.some((f) => f.name === 'apron'));
    const side = APRON_SIDE[item.family === 'SU' ? 'SU' : item.code.split(' ').slice(0, 2).join(' ')];
    const Lp = Number(item.code.split(' ')[2]);
    let low = Infinity;
    let near = Infinity;
    let far = -Infinity;
    for (let i = 0; i < mb.pos.length; i += 3) {
      const [x, y, z] = [mb.pos[i], mb.pos[i + 1], mb.pos[i + 2]];
      if (x < side - 5.001 || x > side + 1e-6 || y > 54 || z < 5.25) continue; // not the wall flange
      low = Math.min(low, y);
      near = Math.min(near, z);
      far = Math.max(far, z);
    }
    assert.ok(Math.abs(low - 35) < 1e-6, `bottom edge at y = ${low}`);
    assert.ok(near > 5 && near < 6, `reaches the wall flange (z = ${near})`);
    assert.ok(Math.abs(far - Lp) < 1e-6, `runs to the arm end (z = ${far})`);
  });
}
