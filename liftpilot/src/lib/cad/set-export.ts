// The CAD files of an issued drawing set, the same set as its signed PDF: its views at full size as a project's CAD
// files have them (project.ts), sheet 1 as the PDF draws it (the data, the loads, the notes, the checks) at the scale
// of the first view and to its left, and sheet 1's title block as the block CARTIGLIO, whose attributes are the words
// that change from set to set (the drawing number, the revision, the dates, the plant number, the client, the place;
// title-block.ts), so that a CAD program lists and edits them. Under the first view the set's number, revision and
// SHA-256, not the id of a record. acad-ts 3.2.0 writes the attributes of a DXF as plain texts and the end of an
// insert's attributes twice: the DXF is mended here (mendAttributes); its DWG has them right. Pure.
import { A4, COND, FRAME, fitted, renderView, type Pt, type Shape } from '@/drawing';
import { TITLE_H } from '../tavole/datasheet';
import { titleFields, titleFrame, type TitleData, type TitleField } from '../tavole/title-block';
import { acad } from './acad';
import { GAP, cadDocument, cp1252, dxfText, writer, type CadFormat, type CadView } from './export';

/** The name of the title block's block. */
export const TITLE_BLOCK = 'CARTIGLIO';

/** The layer of sheet 1 and of its title block's insert (the block's own lines on layer 0, taking the insert's; not a
 *  layer named as the block: acad-ts reads the two as one). */
const SHEET_LAYER = 'FOGLIO_1';

/** Paper millimetres around the title block within which a shape of sheet 1 belongs to it. */
const EPS = 0.05;

export interface IssuedSet {
  views: readonly CadView[];
  /** sheet 1 as the PDF draws it, paper millimetres */
  sheet: readonly Shape[];
  /** what its title block writes */
  title: TitleData;
  /** the line under the first view: the set, its revision, its hash */
  caption: string;
}

/** The points a shape of a sheet is drawn through (a text by its anchor). */
function pointsOf(s: Shape): Pt[] {
  switch (s.t) {
    case 'line':
      return [s.a, s.b];
    case 'path':
      return [...s.pts];
    case 'circle':
    case 'arc':
      return [[s.c[0] - s.r, s.c[1] - s.r], [s.c[0] + s.r, s.c[1] + s.r]];
    case 'text':
      return [s.at];
    case 'image':
      return [[s.box.x0, s.box.y0], [s.box.x1, s.box.y1]];
  }
}

/** A shape of sheet 1 inside its title block (it leaves the sheet for the block). */
export const inTitleBlock = (s: Shape): boolean =>
  pointsOf(s).every(([x, y]) => x >= FRAME.x0 - EPS && x <= FRAME.x1 + EPS && y >= FRAME.y0 - EPS && y <= FRAME.y0 + TITLE_H + EPS);

/** A text of the title block placed as the sheets letter it: capital height, insertion and alignment, condensed. */
function letter(t: acad.TextEntity, at: Pt, size: number, align: TitleField['align'], M: (p: Pt) => acad.XYZ, scale: number): void {
  t.height = size * 0.73 * scale;
  t.widthFactor = COND;
  t.insertPoint = M(at);
  if (align !== 'l') {
    t.horizontalAlignment = align === 'c' ? acad.TextHorizontalAlignment.Center : acad.TextHorizontalAlignment.Right;
    t.alignmentPoint = M(at);
  }
}

/** The tag of each attribute by its handle (hexadecimal, as a DXF writes it), with the prompt of a definition. */
export type AttributeTags = ReadonlyMap<string, { tag: string; prompt?: string }>;

/** The set in one document, with the tags of its attributes. */
export function setDocument(x: IssuedSet, format: CadFormat): { doc: acad.CadDocument; tags: AttributeTags } {
  const doc = cadDocument(x.views, x.caption, format), { layers: table, modelSpace: space, blockRecords: blocks } = doc;
  if (!table || !space || !blocks) throw new Error('empty CAD document');
  const text = format === 'dwg' ? cp1252 : (t: string): string => t, degrees = format === 'dxf';
  const layer = new acad.Layer(SHEET_LAYER);
  layer.color = new acad.Color(7);
  table.add(layer);
  const add = (e: acad.Entity): void => {
    e.layer = layer;
    space.entities.add(e);
  };
  // sheet 1 to the left of the first view, at its scale, its foot level with the view's
  const first = x.views[0], S = first?.scale ?? 50, ext = first ? renderView(first.entities, { scale: S, ox: 0, oy: 0 }).extent : { x0: 0, y0: 0 };
  const dx = ext.x0 * S - GAP - A4.w * S, dy = ext.y0 * S;
  const emit = writer(add, S, dx, text, { dy, cond: COND, degrees });
  for (const s of x.sheet) if (!inTitleBlock(s)) emit(s, SHEET_LAYER);
  // the title block: its lines and labels a block at paper size, its words the attributes of the insert at the scale
  // (the company by name: a CAD file carries no logo)
  const d: TitleData = { ...x.title, logo: false, clientLogo: false }, yb = FRAME.y0 + TITLE_H, fields = titleFields(d, yb);
  const block = new acad.BlockRecord(TITLE_BLOCK);
  block.blockEntity.flags = acad.BlockTypeFlags.NonConstantAttributeDefinitions;
  blocks.add(block);
  const inBlock = writer((e: acad.Entity) => { block.entities.add(e); }, 1, 0, text, { cond: COND, degrees });
  for (const s of titleFrame(d, yb)) inBlock(s, '0');
  const paper = ([px, py]: Pt): acad.XYZ => new acad.XYZ(px, py, 0), model = ([px, py]: Pt): acad.XYZ => new acad.XYZ(px * S + dx, py * S + dy, 0);
  const defs = fields.map((f) => {
    const a = new acad.AttributeDefinition();
    a.tag = f.tag;
    a.prompt = text(f.prompt);
    a.value = '';
    letter(a, f.at, f.size, f.align, paper, 1);
    block.entities.add(a);
    return a;
  });
  const insert = new acad.Insert(block);
  insert.insertPoint = new acad.XYZ(dx, dy, 0);
  insert.xScale = S;
  insert.yScale = S;
  insert.zScale = S;
  for (const a of insert.attributes) {
    const f = fields.find((g) => g.tag === a.tag);
    if (!f) continue;
    // the value as the sheet letters it: smaller (or narrower) when it would not fit its cell
    const shape = fitted(f.at, f.text, f.size, f.width, { align: f.align, ...(f.bold ? { bold: true } : {}) });
    a.value = text(f.text);
    letter(a, f.at, shape.size, f.align, model, S);
    a.owner = insert;
  }
  add(insert);
  // acad-ts gives an insert's attributes no handle and no end of their sequence: both are registered with the document
  // (its registerCollection wires each item of a list)
  const end = new acad.Seqend(insert);
  insert.attributes.seqend = end;
  const wire = doc as unknown as { registerCollection(items: Iterable<acad.CadObject>): void };
  wire.registerCollection(insert.attributes);
  wire.registerCollection([end]);
  const hex = (h: number): string => h.toString(16).toUpperCase();
  const tags = new Map<string, { tag: string; prompt?: string }>([
    ...defs.map((a): [string, { tag: string; prompt: string }] => [hex(a.handle), { tag: a.tag, prompt: a.prompt }]),
    ...[...insert.attributes].map((a): [string, { tag: string }] => [hex(a.handle), { tag: a.tag }]),
  ]);
  return { doc, tags };
}

const code = (c: number): string => String(c).padStart(3);

/** The attributes of a DXF written by acad-ts 3.2.0 as the DXF reference has them: each ATTDEF and ATTRIB ends with
 *  its own subclass (the prompt, the tag, the flags, the vertical justification) in place of a second AcDbText, and the
 *  end of an insert's attributes (SEQEND) is written once. `tags`: by the handle of each attribute. */
export function mendAttributes(dxf: string, tags: AttributeTags): string {
  const lines = dxf.split('\n'), records: string[][] = [];
  for (let i = 0; i + 1 < lines.length; i += 2) {
    if (lines[i].trim() === '0' || !records.length) records.push([]);
    records[records.length - 1].push(lines[i], lines[i + 1]);
  }
  const tail = lines.length % 2 ? lines[lines.length - 1] : '';
  const value = (r: readonly string[], c: string): string | undefined => {
    for (let i = 2; i + 1 < r.length; i += 2) if (r[i].trim() === c) return r[i + 1].trim();
    return undefined;
  };
  const out: string[] = [];
  records.forEach((r, k) => {
    const type = r[1]?.trim(), next = records[k + 1];
    // the first of two SEQEND of the same handle is the one left incomplete
    if (type === 'SEQEND' && next?.[1]?.trim() === 'SEQEND' && value(next, '5') === value(r, '5')) return;
    const t = type === 'ATTDEF' || type === 'ATTRIB' ? tags.get(value(r, '5') ?? '') : undefined;
    const marks = r.flatMap((v, i) => (i % 2 === 0 && v.trim() === '100' && r[i + 1].trim() === 'AcDbText' ? [i] : []));
    if (!t || marks.length < 2) {
      out.push(...r);
      return;
    }
    // the second AcDbText holds only the vertical alignment (73): the attribute's subclass takes its place (74)
    const at = marks[marks.length - 1], rest = r.slice(at + 2), vj = rest[0]?.trim() === '73' ? rest[1].trim() : '0';
    const own = type === 'ATTDEF'
      ? [code(100), 'AcDbAttributeDefinition', code(3), t.prompt ?? '', code(2), t.tag, code(70), '0', code(73), '0', code(74), vj]
      : [code(100), 'AcDbAttribute', code(2), t.tag, code(70), '0', code(73), '0', code(74), vj];
    out.push(...r.slice(0, at), ...own, ...(rest[0]?.trim() === '73' ? rest.slice(2) : rest));
  });
  return [...out, tail].join('\n');
}

/** The set as DXF text (AutoCAD 2007). */
export function setToDxf(x: IssuedSet): string {
  const { doc, tags } = setDocument(x, 'dxf');
  return mendAttributes(dxfText(doc), tags);
}

/** The set as DWG bytes (AutoCAD 2000). */
export const setToDwg = (x: IssuedSet): Uint8Array => acad.DwgWriter.writeToBuffer(setDocument(x, 'dwg').doc);
