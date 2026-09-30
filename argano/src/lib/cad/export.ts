// The plan drawing of a shaft design as a DXF file (AutoCAD 2007 format, UTF-8 texts, millimetres), with acad-ts:
// one layer per kind of part, polylines for outlines, dimensions drawn as lines, ticks and texts so that every CAD
// program shows them the same way.
import { acad } from './acad';
import { explodeDim, type DimPrim, type Drawing, type PlanLayer, type Pt } from '@/shaft';

/** AutoCAD colour index of each layer. */
const LAYERS: Readonly<Record<PlanLayer, number>> = { MURI: 8, VANO: 7, CABINA: 5, PORTE: 3, GUIDE: 1, CONTRAPPESO: 6, QUOTE: 2, TESTI: 7 };

export function planToDxf(d: Drawing, title: string): string {
  const doc = new acad.CadDocument();
  const { header, layers: table, modelSpace: space } = doc;
  if (!header || !table || !space) throw new Error('empty CAD document');
  header.version = acad.ACadVersion.AC1021;
  header.insUnits = acad.UnitsType.Millimeters;
  const layer = {} as Record<PlanLayer, acad.Layer>;
  for (const [name, color] of Object.entries(LAYERS) as [PlanLayer, number][]) {
    const l = new acad.Layer(name);
    l.color = new acad.Color(color);
    table.add(l);
    layer[name] = l;
  }
  const add = (e: acad.Entity, l: PlanLayer): void => {
    e.layer = layer[l];
    space.entities.add(e);
  };
  const line = (a: Pt, b: Pt, l: PlanLayer): void => add(new acad.Line(new acad.XYZ(a[0], a[1], 0), new acad.XYZ(b[0], b[1], 0)), l);
  const text = (at: Pt, h: number, value: string, align: 'l' | 'c' | 'r', rotation: number, l: PlanLayer): void => {
    const t = new acad.TextEntity(value);
    t.height = h;
    t.rotation = rotation;
    t.insertPoint = new acad.XYZ(at[0], at[1], 0);
    if (align !== 'l') {
      t.horizontalAlignment = align === 'c' ? acad.TextHorizontalAlignment.Center : acad.TextHorizontalAlignment.Right;
      t.alignmentPoint = new acad.XYZ(at[0], at[1], 0);
    }
    add(t, l);
  };
  const dim = (p: DimPrim): void => {
    const e = explodeDim(p);
    for (const [a, b] of e.lines) line(a, b, 'QUOTE');
    text(e.text.at, e.text.h, e.text.value, 'c', e.text.angle, 'QUOTE');
  };
  for (const p of d.prims) {
    if (p.k === 'poly') {
      const pl = new acad.LwPolyline(p.pts.map(([x, y]) => new acad.XY(x, y)));
      pl.isClosed = p.closed;
      add(pl, p.layer);
    } else if (p.k === 'line') line(p.a, p.b, p.layer);
    else if (p.k === 'text') text(p.at, p.h, p.text, p.align, p.vertical ? Math.PI / 2 : 0, p.layer);
    else dim(p);
  }
  text([d.bounds.minX, d.bounds.minY - 120], 60, title, 'l', 0, 'TESTI');
  const out: string[] = [];
  new acad.DxfWriter({ write: (v: string) => { out.push(v); } }, doc).write();
  return out.join('');
}
