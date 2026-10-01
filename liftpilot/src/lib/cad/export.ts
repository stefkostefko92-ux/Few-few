// CAD files of the drawings with acad-ts, in millimetres: DXF (AutoCAD 2007 format, UTF-8 texts) and DWG (AutoCAD 2000
// format: every DWG reader opens it, LibreDWG reads it without a warning; its texts are in code page 1252, a sign
// outside it written in ASCII). Each view is laid out by the drawing kernel at 1:scale and written back in model
// millimetres, so lettering and dimensions plot at their paper size at that scale; several views stand side by side in
// model space, the first at its own coordinates (the shaft's corner at the origin, a section's 0 at the lowest floor),
// the next ones moved along x only. One layer per kind of part; dimensions drawn as lines, arrowheads and texts, so
// that every CAD program shows them the same way. The plan of a shaft design alone here, every view of a project in
// project.ts.
import { chainShapes, renderView, type Entity, type Place, type Pt, type Shape } from '@/drawing';
import { planDims, planEntities, type Layout } from '@/shaft';
import { acad } from './acad';

export type DxfLayer = 'MURI' | 'VANO' | 'CABINA' | 'PORTE' | 'GUIDE' | 'CONTRAPPESO' | 'ASSI' | 'SPAZI' | 'NASCOSTE' | 'DETTAGLI' | 'QUOTE' | 'TESTI' | 'SIMBOLI';

/** AutoCAD colour index of each layer. */
const LAYERS: Readonly<Record<DxfLayer, number>> = {
  MURI: 8, VANO: 7, CABINA: 5, PORTE: 3, GUIDE: 1, CONTRAPPESO: 6, ASSI: 5, SPAZI: 3, NASCOSTE: 8, DETTAGLI: 9, QUOTE: 2, TESTI: 7, SIMBOLI: 7,
};

/** Model millimetres between two views side by side. */
const GAP = 2500;

// Windows-1252 beyond Latin-1, and the signs of the drawings outside it in ASCII
const CP1252 = '€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ';
const ASCII: Readonly<Record<string, string>> = { '≥': '>=', '≤': '<=', '≠': '<>', '≈': '~', '→': '->', '←': '<-', '−': '-', 'α': 'alfa', 'β': 'beta', 'γ': 'gamma', 'μ': 'mu', 'σ': 'sigma' };

/** A text for code page 1252 (a DWG before AutoCAD 2007). */
export const cp1252 = (t: string): string =>
  [...t].map((c) => (c.charCodeAt(0) < 0x80 || (c.charCodeAt(0) >= 0xa0 && c.charCodeAt(0) <= 0xff) || CP1252.includes(c) ? c : ASCII[c] ?? '?')).join('');

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

/** A view to write: its entities in model millimetres, the scale its lettering is sized for, its title. */
export interface CadView {
  title: string;
  scale: number;
  entities: readonly Entity[];
}

/** The views in one document; `title` under the first view (what the drawing is, its record and its hash). */
export function cadDocument(views: readonly CadView[], title: string, version: acad.ACadVersion): acad.CadDocument {
  const doc = new acad.CadDocument();
  const { header, layers: table, modelSpace: space } = doc;
  if (!header || !table || !space) throw new Error('empty CAD document');
  header.version = version;
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
  let cursor: number | null = null;
  const text = version < acad.ACadVersion.AC1021 ? cp1252 : (t: string): string => t;
  views.forEach((v, i) => {
    const place: Place = { scale: v.scale, ox: 0, oy: 0 }, { edges, extent } = renderView(v.entities, place);
    // the first view where its coordinates are, the next ones after it along x
    const dx = cursor === null ? 0 : cursor - extent.x0 * v.scale;
    const emit = writer(add, v.scale, dx, text);
    for (const e of v.entities) {
      const l = layerOf(e);
      for (const s of e.e === 'chain' ? chainShapes(e.c, place, edges) : renderView([e], place).shapes) emit(s, l);
    }
    const lines = [v.title, `Scala di stampa 1:${v.scale}`, ...(i === 0 && title ? [title] : [])];
    lines.forEach((text, k) => emit({ t: 'text', at: [extent.x0, extent.y0 - 8 - 5 * k], text, size: k ? 2.5 : 3.5, cond: false }, 'TESTI'));
    cursor = extent.x1 * v.scale + dx + GAP;
  });
  return doc;
}

/** Writes paper shapes (paper millimetres at 1:scale) as entities in model millimetres, moved by dx along x. */
function writer(add: (e: acad.Entity, l: DxfLayer) => void, scale: number, dx: number, text: (t: string) => string): (s: Shape, l: DxfLayer) => void {
  const M = ([x, y]: Pt): acad.XYZ => new acad.XYZ(x * scale + dx, y * scale, 0);
  return (s, l) => {
    switch (s.t) {
      case 'line':
        add(new acad.Line(M(s.a), M(s.b)), l);
        return;
      case 'path': {
        if (!s.s || s.pts.length < 2) return;
        const pl = new acad.LwPolyline(s.pts.map(([x, y]) => new acad.XY(x * scale + dx, y * scale)));
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
        const t = new acad.TextEntity(text(s.text));
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
}

/** DXF text (AutoCAD 2007). */
export function toDxf(views: readonly CadView[], title: string): string {
  const out: string[] = [];
  new acad.DxfWriter({ write: (v: string) => { out.push(v); } }, cadDocument(views, title, acad.ACadVersion.AC1021)).write();
  return out.join('');
}

/** DWG bytes (AutoCAD 2000). */
export const toDwg = (views: readonly CadView[], title: string): Uint8Array => acad.DwgWriter.writeToBuffer(cadDocument(views, title, acad.ACadVersion.AC1015));

/** The plan of a shaft design at its main floor, at 1:scale. */
export function planToDxf(L: Layout, title: string, scale = 20): string {
  const V = L.inputs.vertical, f = Math.min(V.main, V.floors.length - 1), label = V.floors[f]?.label ?? '';
  return toDxf([{ title, scale, entities: [...planEntities(L, 'main', f), ...planDims(L, 'main', f, { level: `piano "${label}"` })] }], '');
}
