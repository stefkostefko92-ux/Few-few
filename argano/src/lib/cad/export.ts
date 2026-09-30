// The plan of a shaft design at its main floor as a DXF file (AutoCAD 2007 format, UTF-8 texts, millimetres), with
// acad-ts: the same view as the drawing set, laid out by the drawing kernel at 1:scale and written back in model
// millimetres, so lettering and dimensions plot at their paper size at that scale. One layer per kind of part;
// dimensions drawn as lines, arrowheads and texts, so that every CAD program shows them the same way.
import { chainShapes, renderView, type Entity, type Place, type Pt, type Shape } from '@/drawing';
import { planDims, planEntities, type Layout } from '@/shaft';
import { acad } from './acad';

export type DxfLayer = 'MURI' | 'VANO' | 'CABINA' | 'PORTE' | 'GUIDE' | 'CONTRAPPESO' | 'ASSI' | 'SPAZI' | 'NASCOSTE' | 'DETTAGLI' | 'QUOTE' | 'TESTI' | 'SIMBOLI';

/** AutoCAD colour index of each layer. */
const LAYERS: Readonly<Record<DxfLayer, number>> = {
  MURI: 8, VANO: 7, CABINA: 5, PORTE: 3, GUIDE: 1, CONTRAPPESO: 6, ASSI: 5, SPAZI: 3, NASCOSTE: 8, DETTAGLI: 9, QUOTE: 2, TESTI: 7, SIMBOLI: 7,
};

/** Layer of an entity: annotations by kind, geometry by its fill, then by its line style. */
export function layerOf(e: Entity): DxfLayer {
  if (e.e === 'chain') return 'QUOTE';
  if (e.e === 'text') return 'TESTI';
  if (e.e === 'mark' || e.e === 'tag') return 'SIMBOLI';
  const fill = e.e === 'path' || e.e === 'circle' ? e.fill : undefined, st = e.st;
  if (fill === 'concrete' || st === 'jamb') return 'MURI';
  if (st === 'wall') return 'VANO';
  if (st === 'axis') return 'ASSI';
  if (st === 'space') return 'SPAZI';
  if (st === 'hidden') return 'NASCOSTE';
  if (st === 'steel') return 'GUIDE';
  if (fill === 'car' || fill === 'paper') return 'CABINA';
  if (fill === 'door' || fill === 'steel') return 'PORTE';
  if (fill === 'cw') return 'CONTRAPPESO';
  return 'DETTAGLI';
}

export function planToDxf(L: Layout, title: string, scale = 20): string {
  const doc = new acad.CadDocument();
  const { header, layers: table, modelSpace: space } = doc;
  if (!header || !table || !space) throw new Error('empty CAD document');
  header.version = acad.ACadVersion.AC1021;
  header.insUnits = acad.UnitsType.Millimeters;
  const layer = {} as Record<DxfLayer, acad.Layer>;
  for (const [name, color] of Object.entries(LAYERS) as [DxfLayer, number][]) {
    const l = new acad.Layer(name);
    l.color = new acad.Color(color);
    table.add(l);
    layer[name] = l;
  }
  const add = (e: acad.Entity, l: DxfLayer): void => {
    e.layer = layer[l];
    space.entities.add(e);
  };
  // paper millimetres at 1:scale back to model millimetres
  const M = ([x, y]: Pt): acad.XYZ => new acad.XYZ(x * scale, y * scale, 0);
  const emit = (s: Shape, l: DxfLayer): void => {
    switch (s.t) {
      case 'line':
        add(new acad.Line(M(s.a), M(s.b)), l);
        return;
      case 'path': {
        if (!s.s || s.pts.length < 2) return;
        const pl = new acad.LwPolyline(s.pts.map(([x, y]) => new acad.XY(x * scale, y * scale)));
        pl.isClosed = s.closed;
        add(pl, l);
        return;
      }
      case 'circle': {
        if (!s.s && s.fill?.k !== 'solid') return;
        const c = new acad.Circle();
        c.center = M(s.c);
        c.radius = s.r * scale;
        add(c, l);
        return;
      }
      case 'arc': {
        const a = new acad.Arc();
        a.center = M(s.c);
        a.radius = s.r * scale;
        a.startAngle = (s.a0 * Math.PI) / 180;
        a.endAngle = (s.a1 * Math.PI) / 180;
        add(a, l);
        return;
      }
      case 'text': {
        const t = new acad.TextEntity(s.text);
        // DXF height is the capital height: about 0,73 of the font size for DejaVu Sans
        t.height = s.size * 0.73 * scale;
        t.rotation = ((s.angle ?? 0) * Math.PI) / 180;
        t.insertPoint = M(s.at);
        if (s.align && s.align !== 'l') {
          t.horizontalAlignment = s.align === 'c' ? acad.TextHorizontalAlignment.Center : acad.TextHorizontalAlignment.Right;
          t.alignmentPoint = M(s.at);
        }
        add(t, l);
        return;
      }
      case 'image':
        return;
    }
  };
  const V = L.inputs.vertical, f = Math.min(V.main, V.floors.length - 1), label = V.floors[f]?.label ?? '';
  const ents = [...planEntities(L, 'main', f), ...planDims(L, 'main', f, { level: `piano "${label}"` })];
  const place: Place = { scale, ox: 0, oy: 0 }, { edges, extent } = renderView(ents, place);
  for (const e of ents) {
    const l = layerOf(e);
    for (const s of e.e === 'chain' ? chainShapes(e.c, place, edges) : renderView([e], place).shapes) emit(s, l);
  }
  emit({ t: 'text', at: [extent.x0, extent.y0 - 8], text: title, size: 3.5, cond: false }, 'TESTI');
  emit({ t: 'text', at: [extent.x0, extent.y0 - 13], text: `Scala di stampa 1:${scale}`, size: 2.5, cond: false }, 'TESTI');
  const out: string[] = [];
  new acad.DxfWriter({ write: (v: string) => { out.push(v); } }, doc).write();
  return out.join('');
}
