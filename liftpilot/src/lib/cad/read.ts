// Reads a DXF or DWG file into a CadModel with acad-ts (MIT, pure TypeScript). It runs in the browser: the drawing
// never leaves the user's computer, only the measures taken on it are saved. DWG from AutoCAD R14 (AC1014) on; older
// files must be saved again or exported as DXF. Blocks are exploded (up to 8 levels), curves cut into segments, and
// mirrored entities (extrusion 0,0,−1) turned back into world coordinates.
import { acad } from './acad';
import { dwgVersion, isAnnotationLayer, unitsOf, type CadLayer, type CadModel } from './model';

export const MAX_SEGMENTS = 400_000;
export const MAX_BYTES = 60 * 1024 * 1024;
const DWG_READABLE = new Set(['AC1014', 'AC1015', 'AC1018', 'AC1021', 'AC1024', 'AC1027', 'AC1032']);

export type CadReadErrorCode = 'tooLarge' | 'dwgVersion' | 'unreadable' | 'empty';
export class CadReadError extends Error {
  constructor(readonly code: CadReadErrorCode, readonly detail = '') {
    super(`${code}${detail ? `: ${detail}` : ''}`);
  }
}

interface XYLike { x: number; y: number }

export function readCad(bytes: Uint8Array, name: string): CadModel {
  if (bytes.byteLength > MAX_BYTES) throw new CadReadError('tooLarge');
  const dwg = dwgVersion(bytes);
  let doc: acad.CadDocument;
  try {
    if (dwg) {
      if (!DWG_READABLE.has(dwg)) throw new CadReadError('dwgVersion', dwg);
      doc = acad.DwgReader.readFromStream(bytes.slice().buffer, null);
    } else {
      doc = acad.DxfReader.readFromStream(bytes, () => undefined);
    }
  } catch (e) {
    if (e instanceof CadReadError) throw e;
    throw new CadReadError('unreadable', e instanceof Error ? e.message.slice(0, 160) : '');
  }
  const space = doc.modelSpace;
  if (!space) throw new CadReadError('empty');

  const layers: CadLayer[] = [], index = new Map<string, number>();
  let seg = new Float64Array(4096), layerOf = new Uint16Array(1024), count = 0, skipped = 0, truncated = false;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const layerIndex = (l: acad.Layer | null, inherited: string | null): number => {
    const own = l?.name ?? '0', nameOf = own === '0' && inherited ? inherited : own;
    let i = index.get(nameOf);
    if (i === undefined) {
      const fileLayer = nameOf === own ? l : doc.layers?.tryGetValue(nameOf) ?? null;
      const off = fileLayer ? !fileLayer.isOn || (fileLayer.layerFlags & acad.LayerFlags.Frozen) !== 0 : false;
      i = layers.length;
      if (i >= 65535) return 65534;
      layers.push({ name: nameOf, count: 0, hidden: off || isAnnotationLayer(nameOf) });
      index.set(nameOf, i);
    }
    return i;
  };
  const push = (x1: number, y1: number, x2: number, y2: number, li: number): void => {
    if (count >= MAX_SEGMENTS) { truncated = true; return; }
    if (!Number.isFinite(x1 + y1 + x2 + y2) || (x1 === x2 && y1 === y2)) return;
    if ((count + 1) * 4 > seg.length) { const s = new Float64Array(seg.length * 2); s.set(seg); seg = s; }
    if (count + 1 > layerOf.length) { const l = new Uint16Array(layerOf.length * 2); l.set(layerOf); layerOf = l; }
    seg.set([x1, y1, x2, y2], count * 4);
    layerOf[count] = li;
    layers[li].count += 1;
    count += 1;
    minX = Math.min(minX, x1, x2); maxX = Math.max(maxX, x1, x2); minY = Math.min(minY, y1, y2); maxY = Math.max(maxY, y1, y2);
  };
  const chain = (pts: readonly XYLike[], closed: boolean, mirror: boolean, li: number): void => {
    const s = mirror ? -1 : 1;
    for (let i = 1; i < pts.length; i++) push(s * pts[i - 1].x, pts[i - 1].y, s * pts[i].x, pts[i].y, li);
    if (closed && pts.length > 2) push(s * pts[pts.length - 1].x, pts[pts.length - 1].y, s * pts[0].x, pts[0].y, li);
  };
  const mirrored = (n: { z: number } | undefined): boolean => !!n && n.z < 0;

  const visit = (e: acad.Entity, depth: number, inherited: string | null): void => {
    if (e.isInvisible || truncated) return;
    if (e instanceof acad.Insert) {
      if (depth >= 8) return;
      const layerName = e.layer?.name && e.layer.name !== '0' ? e.layer.name : inherited;
      for (const x of e.explode()) visit(x, depth + 1, layerName);
      return;
    }
    const li = (): number => layerIndex(e.layer ?? null, inherited);
    if (e instanceof acad.Line) push(e.startPoint.x, e.startPoint.y, e.endPoint.x, e.endPoint.y, li());
    else if (e instanceof acad.LwPolyline) chain(e.getPoints(16), e.isClosed, mirrored(e.normal), li());
    else if (e instanceof acad.Polyline) chain(e.getPoints(16), e.isClosed, mirrored(e.normal), li());
    else if (e instanceof acad.Arc) chain(e.polygonalVertexes(24), false, mirrored(e.normal), li());
    else if (e instanceof acad.Circle) chain(e.polygonalVertexes(48), true, mirrored(e.normal), li());
    else if (e instanceof acad.Ellipse) chain(e.polygonalVertexes(64), false, false, li());
    else if (e instanceof acad.Spline) chain(e.polygonalVertexes(64), e.isClosed, false, li());
    else skipped += 1;
  };
  for (const e of space.entities) visit(e, 0, null);
  if (count === 0) throw new CadReadError('empty');

  return {
    name, format: dwg ? 'dwg' : 'dxf', version: dwg ?? (doc.header ? acad.ACadVersion[doc.header.version] : ''), units: unitsOf(Number(doc.header?.insUnits ?? 0)),
    layers, seg: seg.subarray(0, count * 4), layerOf: layerOf.subarray(0, count), count,
    bounds: { minX, minY, maxX, maxY }, truncated, skipped,
  };
}
