// DXF R12 (ASCII) of one nested sheet. Layer names carry the operation: DRILL_D<Ø>_Z-<depth>,
// GROOVE_W<width>_Z-<depth>, CONTOUR_D<tool>_Z-<depth>, so CAM software can map layers to tools without guessing.
import { sheetOps, num, SPOIL } from './cam.js';
import { asciiName } from './util.js';

const COLORS = [3, 4, 5, 6, 1, 2, 30, 40, 140, 200, 210, 230];
const zTxt = (v) => num(v).replace(/\.$/, '');

export function toDxf(model, sheet, meta) {
  const ops = sheetOps(model, sheet);
  const { T } = ops;
  const tool = model.spec.tool;
  const contourLayer = `CONTOUR_D${tool}_Z-${zTxt(T + SPOIL)}`;
  const layers = new Map([['SHEET', 8], [contourLayer, 7], ['LABELS', 2]]);
  const holeLayer = (h) => `DRILL_D${zTxt(h.d)}_Z-${zTxt(h.depth)}`;
  const grooveLayer = (g) => `GROOVE_W${zTxt(g.w)}_Z-${zTxt(g.depth)}`;
  const allHoles = [...ops.drillOps.flatMap((o) => o.holes), ...ops.manual];
  for (const name of [...allHoles.map(holeLayer), ...ops.grooves.map(grooveLayer)].sort()) {
    if (!layers.has(name)) layers.set(name, COLORS[(layers.size - 3) % COLORS.length]);
  }
  const out = [];
  const g = (code, value) => out.push(String(code).padStart(3, ' '), String(value));
  g(0, 'SECTION'); g(2, 'HEADER');
  g(9, '$ACADVER'); g(1, 'AC1009');
  g(9, '$INSBASE'); g(10, '0.0'); g(20, '0.0'); g(30, '0.0');
  g(9, '$EXTMIN'); g(10, '0.0'); g(20, '0.0'); g(30, '0.0');
  g(9, '$EXTMAX'); g(10, sheet.w.toFixed(1)); g(20, sheet.h.toFixed(1)); g(30, '0.0');
  g(0, 'ENDSEC');
  g(0, 'SECTION'); g(2, 'TABLES');
  g(0, 'TABLE'); g(2, 'LTYPE'); g(70, 1);
  g(0, 'LTYPE'); g(2, 'CONTINUOUS'); g(70, 0); g(3, 'Solid line'); g(72, 65); g(73, 0); g(40, '0.0');
  g(0, 'ENDTAB');
  g(0, 'TABLE'); g(2, 'LAYER'); g(70, layers.size);
  for (const [name, color] of layers) {
    g(0, 'LAYER'); g(2, name); g(70, 0); g(62, color); g(6, 'CONTINUOUS');
  }
  g(0, 'ENDTAB');
  g(0, 'ENDSEC');
  g(0, 'SECTION'); g(2, 'ENTITIES');
  const rect = (layer, x0, y0, x1, y1) => {
    g(0, 'POLYLINE'); g(8, layer); g(66, 1); g(10, '0.0'); g(20, '0.0'); g(30, '0.0'); g(70, 1);
    for (const [x, y] of [[x0, y0], [x1, y0], [x1, y1], [x0, y1]]) {
      g(0, 'VERTEX'); g(8, layer); g(10, x.toFixed(3)); g(20, y.toFixed(3)); g(30, '0.0');
    }
    g(0, 'SEQEND'); g(8, layer);
  };
  rect('SHEET', 0, 0, sheet.w, sheet.h);
  for (const c of ops.contours) rect(contourLayer, c.x, c.y, c.x + c.w, c.y + c.h);
  for (const h of allHoles) {
    g(0, 'CIRCLE'); g(8, holeLayer(h)); g(10, h.X.toFixed(3)); g(20, h.Y.toFixed(3)); g(30, '0.0'); g(40, (h.d / 2).toFixed(3));
  }
  for (const gr of ops.grooves) {
    g(0, 'LINE'); g(8, grooveLayer(gr));
    g(10, gr.X1.toFixed(3)); g(20, gr.Y1.toFixed(3)); g(30, '0.0');
    g(11, gr.X2.toFixed(3)); g(21, gr.Y2.toFixed(3)); g(31, '0.0');
  }
  for (const c of ops.contours) {
    g(0, 'TEXT'); g(8, 'LABELS');
    g(10, (c.x + 12).toFixed(3)); g(20, (c.y + 12).toFixed(3)); g(30, '0.0');
    g(40, '18.0'); g(1, `${c.partId} ${asciiName(c.name)}`);
  }
  g(0, 'ENDSEC');
  g(0, 'EOF');
  return { text: `${out.join('\n')}\n`, layers: [...layers.keys()], hash: meta.hash };
}
