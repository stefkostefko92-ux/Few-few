// CAD files of the drawings with acad-ts, in millimetres: DXF (AutoCAD 2007 format, UTF-8 texts) and DWG (AutoCAD 2000
// format: every DWG reader opens it, LibreDWG reads it without a warning; its texts are in code page 1252, a sign
// outside it written in ASCII). Each view is laid out by the drawing kernel at 1:scale — where its sheet lays it out,
// with what the sheet draws around it, lettered condensed as the sheet letters it — and written back in model
// millimetres, so lettering and dimensions plot at their paper size at that scale; several views stand side by side in
// model space, the first at its own coordinates (the shaft's corner at the origin, a section's 0 at the lowest floor),
// the next ones moved along x only, each with its title, subtitle, sheet and scale under it. One layer per kind of
// part; dimensions drawn as lines, arrowheads and texts, so that every CAD program shows them the same way; concrete
// hatched with ANSI31, the dark fills solid. The plan of a shaft design alone here, every view of a project in
// project.ts, an issued set with its sheet 1 and its other paper sheets in set-export.ts.
import { COND, moveShapes, renderView, shapeBox, union, type Box, type Entity, type Fill, type Pt, type Shape } from '@/drawing';
import { planDims, planEntities, type Layout } from '@/shaft';
import { acad } from './acad';

export type DxfLayer = 'MURI' | 'VANO' | 'CABINA' | 'PORTE' | 'GUIDE' | 'CONTRAPPESO' | 'ASSI' | 'SPAZI' | 'NASCOSTE' | 'DETTAGLI' | 'QUOTE' | 'TESTI' | 'SIMBOLI';

/** AutoCAD colour index of each layer. */
const LAYERS: Readonly<Record<DxfLayer, number>> = {
  MURI: 8, VANO: 7, CABINA: 5, PORTE: 3, GUIDE: 1, CONTRAPPESO: 6, ASSI: 5, SPAZI: 3, NASCOSTE: 8, DETTAGLI: 9, QUOTE: 2, TESTI: 7, SIMBOLI: 7,
};

/** Model millimetres between two views side by side. */
export const GAP = 2500;

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

/** A view to write: its entities in model millimetres, the scale its lettering is sized for, its title; of a drawing
 *  set, its subtitle, the number of its sheet, where its sheet puts the model's origin (`origin`, paper millimetres: the
 *  view is laid out there, as the sheet lays it out, and moved back) and what the sheet draws around it (`notes`: the
 *  legends, the landings' sides, the section marks, the notes — paper millimetres of the same sheet). */
export interface CadView {
  title: string;
  scale: number;
  entities: readonly Entity[];
  subtitle?: string;
  sheet?: number;
  origin?: Pt;
  notes?: readonly Shape[];
}

/** A text is on layer TESTI, every other mark of a sheet (the legend's boxes and symbols, a section's marks) on SIMBOLI. */
const noteLayer = (s: Shape): DxfLayer => (s.t === 'text' ? 'TESTI' : 'SIMBOLI');

/** A view as laid out at its scale where its sheet lays it out (so every choice of where a text goes is the sheet's,
 *  to the last rounding), moved to paper millimetres with the model's origin at 0: its shapes by entity, the notes of
 *  its sheet, the extent of both. */
export function laidOut(v: CadView): { parts: Shape[][]; notes: Shape[]; extent: Box } {
  const [ox, oy] = v.origin ?? [0, 0], r = renderView(v.entities, { scale: v.scale, ox, oy });
  const parts = r.parts.map((p) => moveShapes(p, -ox, -oy)), notes = moveShapes(v.notes ?? [], -ox, -oy);
  let b: Box = { x0: r.extent.x0 - ox, y0: r.extent.y0 - oy, x1: r.extent.x1 - ox, y1: r.extent.y1 - oy };
  for (const s of notes) b = union(b, shapeBox(s));
  return { parts, notes, extent: b };
}

/** The two files: DXF in the AutoCAD 2007 format, DWG in the AutoCAD 2000 one. */
export type CadFormat = 'dxf' | 'dwg';
const VERSION: Readonly<Record<CadFormat, acad.ACadVersion>> = { dxf: acad.ACadVersion.AC1021, dwg: acad.ACadVersion.AC1015 };

/** The views in one document; `title` under the first view (what the drawing is, its record and its hash). */
export function cadDocument(views: readonly CadView[], title: string, format: CadFormat): acad.CadDocument {
  const doc = new acad.CadDocument(), version = VERSION[format];
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
    // the view as the sheets lay it out (the values where the sheets put them), each entity on its layer; the notes of
    // its sheet where the sheet has them; lettered as the sheet letters them (its texts condensed, as they were placed)
    const { extent, parts, notes } = laidOut(v);
    // the first view where its coordinates are, the next ones after it along x
    const dx = cursor === null ? 0 : cursor - extent.x0 * v.scale;
    const emit = writer(add, v.scale, dx, text, { degrees: format === 'dxf', cond: COND });
    v.entities.forEach((e, k) => {
      const l = layerOf(e);
      for (const s of parts[k] ?? []) emit(s, l);
    });
    for (const s of notes) emit(s, noteLayer(s));
    // under it all: the title, the subtitle, the sheet and the scale (and under the first view what the file is)
    const lines = [v.title, ...(v.subtitle ? [v.subtitle] : []), `${v.sheet ? `Foglio ${v.sheet} · ` : ''}Scala di stampa 1:${v.scale}`, ...(i === 0 && title ? [title] : [])];
    lines.forEach((text, k) => emit({ t: 'text', at: [extent.x0, extent.y0 - 8 - 5 * k], text, size: k ? 2.5 : 3.5, cond: false }, 'TESTI'));
    cursor = extent.x1 * v.scale + dx + GAP;
  });
  return doc;
}

/** How shapes are written besides their scale: moved by `dy` along y too; condensed lettering `cond` times as wide (a
 *  sheet's tables, lettered to fit); the angle of a hatch's lines in degrees (a DXF) or in radians (a DWG). */
export interface WriteOptions {
  dy?: number;
  cond?: number;
  degrees?: boolean;
}

/** ANSI31, the section hatch of masonry and concrete: lines at 45°, 3,175 mm apart at scale 1. */
const ANSI31 = { angle: 45, spacing: 3.175 } as const;
/** The hatch's scale for each unit of the view's scale: lines 1,6 mm apart on paper. */
const HATCH_PER_SCALE = 0.5;

/** The hatch of a closed outline (model millimetres): ANSI31 for concrete, solid for the dark fills (arrowheads, the
 *  dots of the leaders, the black parts of the symbols); none for the tints of the car, the doors, the counterweight. */
function hatchOf(pts: readonly acad.XY[], fill: Fill | undefined, scale: number, degrees: boolean): acad.Hatch | null {
  const kind = fill?.k === 'pattern' ? 'concrete' : fill?.k === 'solid' && (fill.ink === 'dark' || fill.ink === 'ink') ? 'solid' : null;
  if (!kind || pts.length < 3) return null;
  const h = new acad.Hatch(), edge = new acad.HatchBoundaryPathPolyline();
  edge.vertices = pts.map((p) => new acad.XYZ(p.x, p.y, 0));
  edge.isClosed = true;
  const path = new acad.HatchBoundaryPath([edge]);
  path.flags = acad.BoundaryPathFlags.External | acad.BoundaryPathFlags.Polyline;
  h.paths.push(path);
  // (acad-ts names DXF's pattern types wrong: its "SolidFill", 1, is the predefined pattern of a .pat file)
  h.patternType = acad.HatchPatternType.SolidFill;
  if (kind === 'solid') {
    h.isSolid = true;
    h.pattern = acad.HatchPattern.solid;
    h.patternScale = 1;
    return h;
  }
  const pattern = new acad.HatchPattern('ANSI31'), line = new acad.HatchPatternLine(), a = (ANSI31.angle * Math.PI) / 180;
  line.offset = new acad.XY(-Math.sin(a) * ANSI31.spacing, Math.cos(a) * ANSI31.spacing);
  pattern.lines.push(line);
  h.pattern = pattern;
  h.patternScale = HATCH_PER_SCALE * scale;
  // acad-ts writes the angle of a line as it is given: a DXF reader takes degrees, a DWG one radians
  line.angle = degrees ? ANSI31.angle : a;
  return h;
}

/** Writes paper shapes (paper millimetres at 1:scale) as entities in model millimetres, moved by dx along x. */
export function writer<L extends string>(add: (e: acad.Entity, l: L) => void, scale: number, dx: number, text: (t: string) => string, o: WriteOptions = {}): (s: Shape, l: L) => void {
  const dy = o.dy ?? 0, M = ([x, y]: Pt): acad.XYZ => new acad.XYZ(x * scale + dx, y * scale + dy, 0);
  return (s, l) => {
    switch (s.t) {
      case 'line':
        add(new acad.Line(M(s.a), M(s.b)), l);
        return;
      case 'path': {
        const pts = s.pts.map(([x, y]) => new acad.XY(x * scale + dx, y * scale + dy)), h = s.closed ? hatchOf(pts, s.fill, scale, o.degrees ?? false) : null;
        if (h) add(h, l);
        if (!s.s || s.pts.length < 2) return;
        const pl = new acad.LwPolyline(pts);
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
        if (o.cond && s.cond) t.widthFactor = o.cond;
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

/** A document as DXF text. */
export function dxfText(doc: acad.CadDocument): string {
  const out: string[] = [];
  new acad.DxfWriter({ write: (v: string) => { out.push(v); } }, doc).write();
  return out.join('');
}

/** DXF text (AutoCAD 2007). */
export const toDxf = (views: readonly CadView[], title: string): string => dxfText(cadDocument(views, title, 'dxf'));

/** DWG bytes (AutoCAD 2000). */
export const toDwg = (views: readonly CadView[], title: string): Uint8Array => acad.DwgWriter.writeToBuffer(cadDocument(views, title, 'dwg'));

/** The plan of a shaft design at its main floor, at 1:scale. */
export function planToDxf(L: Layout, title: string, scale = 20): string {
  const V = L.inputs.vertical, f = Math.min(V.main, V.floors.length - 1), label = V.floors[f]?.label ?? '';
  return toDxf([{ title, scale, entities: [...planEntities(L, 'main', f), ...planDims(L, 'main', f, { level: `piano "${label}"` })] }], '');
}
