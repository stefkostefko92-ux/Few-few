// CAD import and export: a plan drawn with acad-ts (walls, a rotated shaft, dimensions on an annotation layer, a door
// block) saved as DXF and as DWG, read back, surveyed with the four rays; the exported plan read back as DXF.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as acad from '@node-projects/acad-ts';
import { readCad, CadReadError } from '../cad/read';
import { castRays, dominantAngle, shaftSize, surveyCorners } from '../cad/measure';
import { dwgVersion, MM_PER_UNIT } from '../cad/model';
import { cp1252, planToDxf, toDwg, toDxf } from '../cad/export';
import { projectViews } from '../cad/project';
import { defaultLift, deriveLift } from '../lift';
import { defaultInputs, layout, travel } from '@/shaft';

const rot = (x: number, y: number, a: number): [number, number] => [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a)];

/** A floor plan in millimetres: shaft 1600 × 1750 inside 200 mm walls with a 900 mm opening, turned by `angle`. */
function plan(angle: number): acad.CadDocument {
  const doc = new acad.CadDocument();
  const { header, layers, modelSpace, blockRecords } = doc;
  if (!header || !layers || !modelSpace || !blockRecords) throw new Error('document');
  header.version = acad.ACadVersion.AC1027;
  header.insUnits = acad.UnitsType.Millimeters;
  const walls = new acad.Layer('MURATURE'), dims = new acad.Layer('QUOTE');
  layers.add(walls);
  layers.add(dims);
  const poly = (pts: [number, number][], closed: boolean, layer: acad.Layer): void => {
    const p = new acad.LwPolyline(pts.map(([x, y]) => new acad.XY(...rot(x, y, angle))));
    p.isClosed = closed;
    p.layer = layer;
    modelSpace.entities.add(p);
  };
  // inner face with the 900 mm landing opening in the front wall, its jambs, and the outer face
  poly([[350, 0], [0, 0], [0, 1750], [1600, 1750], [1600, 0], [1250, 0]], false, walls);
  poly([[350, 0], [350, -200]], false, walls);
  poly([[1250, 0], [1250, -200]], false, walls);
  poly([[-200, -200], [1800, -200], [1800, 1950], [-200, 1950]], true, walls);
  // a dimension line across the shaft on the annotation layer: it would stop the rays if it were used
  const l = new acad.Line(new acad.XYZ(...rot(0, 900, angle), 0), new acad.XYZ(...rot(1600, 900, angle), 0));
  l.layer = dims;
  modelSpace.entities.add(l);
  // a block (door swing symbol) inserted outside the shaft
  const block = new acad.BlockRecord('SIMBOLO_PORTA');
  blockRecords.add(block);
  block.entities.add(new acad.Arc(new acad.XYZ(0, 0, 0), 900, 0, Math.PI / 2));
  const ins = new acad.Insert(block);
  const [ix, iy] = rot(2500, 0, angle);
  ins.insertPoint = new acad.XYZ(ix, iy, 0);
  ins.layer = walls;
  modelSpace.entities.add(ins);
  return doc;
}

const dxfBytes = (doc: acad.CadDocument): Uint8Array => {
  const out: string[] = [];
  new acad.DxfWriter({ write: (v: string) => { out.push(v); } }, doc).write();
  return new TextEncoder().encode(out.join(''));
};

test('DXF e DWG letti in segmenti per layer, in millimetri, con i blocchi esplosi', () => {
  const dwgDoc = plan(0);
  if (dwgDoc.header) dwgDoc.header.version = acad.ACadVersion.AC1032;
  for (const [kind, bytes] of [['dxf', dxfBytes(plan(0))], ['dwg', new Uint8Array(acad.DwgWriter.writeToBuffer(dwgDoc))]] as const) {
    const m = readCad(bytes, `pianta.${kind}`);
    assert.equal(m.format, kind);
    assert.equal(m.units, 'mm');
    const walls = m.layers.find((l) => l.name === 'MURATURE'), dims = m.layers.find((l) => l.name === 'QUOTE');
    assert.ok(walls && !walls.hidden, `${kind}: muri`);
    assert.ok(dims?.hidden, `${kind}: le quote sono nascoste per la misura`);
    // 5 + 1 + 1 + 4 segments of walls and 23 of the exploded arc (24 points)
    assert.equal(walls.count, 5 + 1 + 1 + 4 + 23, kind);
    assert.ok(m.bounds.maxX >= 2500 + 899, `${kind}: il blocco è inserito al suo posto`);
  }
  assert.equal(dwgVersion(new TextEncoder().encode('AC1015xxxx')), 'AC1015');
  assert.throws(() => readCad(new TextEncoder().encode('AC1012 old drawing'), 'vecchio.dwg'), (e) => e instanceof CadReadError && e.code === 'dwgVersion');
});

test('misura del vano con quattro raggi, anche su una pianta ruotata', () => {
  for (const deg of [0, 30]) {
    const a = (deg * Math.PI) / 180, m = readCad(dxfBytes(plan(a)), 'pianta.dxf');
    const visible = (i: number) => !m.layers[i].hidden;
    const [px, py] = rot(700, 600, a);
    const angle = dominantAngle(m, visible, px, py, 3000);
    assert.ok(Math.abs(angle - a) < 0.01, `angolo ${angle} ≠ ${a}`);
    const s = castRays(m, visible, px, py, angle, 20000);
    assert.ok(s, 'raggi chiusi');
    // DXF keeps the coordinates to about 1e-4 mm: the rotated walls stay parallel to well under a millimetre
    near(s.left + s.right, 1600, 0.5);
    near(s.up + s.down, 1750, 0.5);
    assert.deepEqual(shaftSize(s, MM_PER_UNIT[m.units], 'down'), { W: 1600, D: 1750 });
    assert.deepEqual(shaftSize(s, MM_PER_UNIT[m.units], 'left'), { W: 1750, D: 1600 });
    const [x0, y0] = surveyCorners(s)[0];
    near(Math.hypot(x0, y0), 0, 0.5);
    // with the dimension layer in use the rays stop on the dimension line across the shaft
    const all = castRays(m, () => true, px, py, angle, 20000);
    near((all?.up ?? 0) + (all?.down ?? 0), 900, 0.5);
  }
});

test('la pianta esportata in DXF si rilegge, in millimetri e con i layer', () => {
  const text = planToDxf(layout(defaultInputs(1600, 1750)), 'Impianto di prova');
  assert.match(text, /\$INSUNITS\s+70\s+4/);
  const m = readCad(new TextEncoder().encode(text), 'progetto.dxf');
  // layers with segments (the reader keeps lines for measuring); the lettering is on TESTI
  for (const l of ['MURI', 'VANO', 'CABINA', 'PORTE', 'GUIDE', 'CONTRAPPESO', 'ASSI', 'QUOTE']) assert.ok(m.layers.some((x) => x.name === l), l);
  assert.match(text, /\nTEXT\n[\s\S]*?\n\s*8\nTESTI\n/);
  // everything around the shaft: walls, dimension rows and lettering written back in model millimetres at 1:20
  assert.ok(m.bounds.minX < -200 && m.bounds.maxX > 1800 && m.bounds.minY < -200 && m.bounds.maxY > 1950);
  assert.ok(m.bounds.minX > -3000 && m.bounds.maxX < 4600 && m.bounds.minY > -3500 && m.bounds.maxY < 4800);
  // the clear shaft on its own layer, exactly 1600 × 1750
  const vano = m.layers.findIndex((x) => x.name === 'VANO'), xs: number[] = [], ys: number[] = [];
  for (let i = 0; i < m.count; i++) {
    if (m.layerOf[i] !== vano) continue;
    xs.push(m.seg[4 * i], m.seg[4 * i + 2]);
    ys.push(m.seg[4 * i + 1], m.seg[4 * i + 3]);
  }
  assert.deepEqual([Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)].map((v) => Math.round(v * 1000) / 1000), [0, 1600, 0, 1750]);
});

function near(a: number, b: number, eps = 1e-6): void {
  assert.ok(Math.abs(a - b) <= eps, `${a} ≠ ${b}`);
}

test('il progetto intero in DXF e DWG: tutte le viste affiancate, la stessa geometria letta da entrambi', () => {
  const d = deriveLift(defaultLift()), views = projectViews(d.layout, d.machine, true);
  // the drawing set's views: three plans, section A-A and its three details, the machine room twice
  assert.equal(views.length, 9);
  const dxf = new TextEncoder().encode(toDxf(views, 'Prova')), dwg = toDwg(views, 'Prova');
  assert.equal(new TextDecoder().decode(dwg.subarray(0, 6)), 'AC1015');
  const a = readCad(dxf, 'progetto.dxf'), b = readCad(dwg, 'progetto.dwg');
  assert.ok(a.count > 1000);
  assert.equal(b.count, a.count);
  assert.deepEqual(b.bounds, a.bounds);
  // side by side along x: as wide as the views together, as tall as the whole section A-A at its real height
  assert.ok(a.bounds.maxX - a.bounds.minX > 30000 && a.bounds.maxY > travel(d.shaft.vertical.floors));
});

test('testi del DWG nella code page 1252: i segni fuori in ASCII', () => {
  assert.equal(cp1252('Ø 560 · 10× – 1470 à'), 'Ø 560 · 10× – 1470 à');
  assert.equal(cp1252('σ ≤ fyk/γM0'), 'sigma <= fyk/gammaM0');
  assert.equal(cp1252('漢'), '?');
});
