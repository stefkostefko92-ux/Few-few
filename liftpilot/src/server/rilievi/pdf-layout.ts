import 'server-only';
// The layout of the sheet's PDF page: A4, 40 pt margins, three columns, the plate on top, a bottom line with the page
// number. Drawing only — the data and the texts come ready (format.ts, the messages). Ported 1:1 from rilievi
// (src/schede/pdf-layout.ts): every constant, font size and offset is rilievi's.
import type { DisplayField } from '@/lib/rilievi/format';
import type { RilieviT } from '@/lib/rilievi/t';

const PAGE = { width: 595.28, height: 841.89 };
export const MARGIN = 40;
export const CONTENT_WIDTH = PAGE.width - MARGIN * 2;
const FOOTER_SPACE = 34;
const GAP = 16;
export const INK = '#000000';
export const MUTED = '#555555';
export const RULE = '#BDBDBD';

export interface PdfContext {
  doc: PDFKit.PDFDocument;
  t: RilieviT;
}

/** The plate's data: the identifiers and the address of the sheet. */
export interface PlateData {
  numeroImpianto: string | null;
  matricola: string | null;
  indirizzo: string | null;
}

function bottom(): number {
  return PAGE.height - MARGIN - FOOTER_SPACE;
}

/** A new page when `needed` does not fit above the bottom line; true when a new one began. */
export function ensureSpace(ctx: PdfContext, needed: number): boolean {
  if (ctx.doc.y + needed <= bottom()) return false;
  ctx.doc.addPage();
  ctx.doc.y = MARGIN;
  return true;
}

/** A cell's value: the ticks as ☑/☐, the empty as a dash. */
function cellText(field: DisplayField): string {
  if (field.options) return field.options.map((o) => `${o.checked ? '☑' : '☐'} ${o.label}`).join('    ');
  return field.value || '—';
}

function cellHeight(ctx: PdfContext, field: DisplayField, width: number): number {
  const { doc } = ctx;
  doc.font('Sans').fontSize(7.5);
  const label = doc.heightOfString(field.label, { width });
  doc.font('Sans').fontSize(10);
  const value = doc.heightOfString(cellText(field), { width });
  return label + 2 + value;
}

function drawCell(ctx: PdfContext, field: DisplayField, x: number, y: number, width: number): void {
  const { doc } = ctx;
  doc.font('Sans').fontSize(7.5).fillColor(MUTED).text(field.label, x, y, { width });
  const valueY = doc.y + 2;
  doc
    .font('Sans')
    .fontSize(10)
    .fillColor(field.value || field.options ? INK : MUTED)
    .text(cellText(field), x, valueY, { width });
}

/** On a whole row: the address, the notes and the ticks (the boxes do not shrink); Sì/No fits a column. */
function isWide(field: DisplayField): boolean {
  return field.wide || (field.options !== undefined && field.kind !== 'yesno');
}

/** The fields in three columns; the wide ones on a whole row. */
export function drawFields(ctx: PdfContext, fields: DisplayField[]): void {
  const { doc } = ctx;
  const columns = 3;
  const colWidth = (CONTENT_WIDTH - GAP * (columns - 1)) / columns;
  let i = 0;
  while (i < fields.length) {
    const first = fields[i];
    if (!first) break;
    const row: DisplayField[] = [first];
    if (!isWide(first)) {
      for (let next = fields[i + 1]; row.length < columns && next && !isWide(next); next = fields[i + row.length]) row.push(next);
    }
    const width = row.length === 1 && isWide(first) ? CONTENT_WIDTH : colWidth;
    const height = Math.max(...row.map((field) => cellHeight(ctx, field, width)));
    ensureSpace(ctx, height + 6);
    const y = doc.y;
    row.forEach((field, column) => drawCell(ctx, field, MARGIN + column * (colWidth + GAP), y, width));
    doc.y = y + height + 6;
    i += row.length;
  }
}

export function drawSectionTitle(ctx: PdfContext, title: string): void {
  const { doc } = ctx;
  // the title and at least one row of fields under it — never a title alone at the bottom of a page
  ensureSpace(ctx, 64);
  doc.y += 4;
  doc.font('Sans-Bold').fontSize(10.5).fillColor(INK).text(title, MARGIN, doc.y);
  const lineY = doc.y + 3;
  doc
    .moveTo(MARGIN, lineY)
    .lineTo(MARGIN + CONTENT_WIDTH, lineY)
    .lineWidth(0.6)
    .stroke(INK);
  doc.y = lineY + 7;
}

/** What the header band holds — the texts come ready from pdf.ts. */
export interface HeaderInfo {
  /** The company's logo (PNG/JPEG as uploaded and checked) and its size in pixels; null — no logo. */
  logo: Buffer | null;
  logoSize: { width: number; height: number } | null;
  aziendaName: string;
  title: string;
  dateLine: string;
  creatorLabel: string;
  creator: string;
  updatedLine: string;
}

const LOGO_BOX = { width: 170, height: 52 };
const HEADER_RIGHT = 220;

/**
 * The header band: top left the company's logo (the title and the company's name under it), on the right the date and
 * who filled the sheet in — in a large type, to be seen on every printed sheet.
 */
export function drawHeader(ctx: PdfContext, info: HeaderInfo): void {
  const { doc } = ctx;
  const top = MARGIN;
  const leftWidth = CONTENT_WIDTH - HEADER_RIGHT - GAP;
  let leftY = top;
  if (info.logo) {
    const size = info.logoSize;
    const scale = size ? Math.min(LOGO_BOX.width / size.width, LOGO_BOX.height / size.height) : 1;
    const drawn = size ? size.height * scale : LOGO_BOX.height;
    doc.image(info.logo, MARGIN, top, { fit: [LOGO_BOX.width, LOGO_BOX.height] });
    leftY = top + drawn + 8;
  }
  doc.font('Sans-Bold').fontSize(15).fillColor(INK).text(info.title, MARGIN, leftY, { width: leftWidth });
  doc
    .font('Sans')
    .fontSize(9)
    .fillColor(MUTED)
    .text(info.aziendaName, MARGIN, doc.y + 1, { width: leftWidth });
  const leftBottom = doc.y;

  const x = MARGIN + CONTENT_WIDTH - HEADER_RIGHT;
  const right = { width: HEADER_RIGHT, align: 'right' } as const;
  doc.font('Sans-Bold').fontSize(9).fillColor(INK).text(info.dateLine, x, top, right);
  doc
    .font('Sans')
    .fontSize(8)
    .fillColor(MUTED)
    .text(info.creatorLabel, x, doc.y + 6, right);
  doc
    .font('Sans-Bold')
    .fontSize(12)
    .fillColor(INK)
    .text(info.creator, x, doc.y + 1, right);
  if (info.updatedLine) {
    doc
      .font('Sans')
      .fontSize(7.5)
      .fillColor(MUTED)
      .text(info.updatedLine, x, doc.y + 4, right);
  }
  doc.y = Math.max(leftBottom, doc.y) + 12;
}

/** The lift's nameplate: number and matricola, address, load/persons/stops/make — as in the car. */
export function drawPlate(ctx: PdfContext, scheda: PlateData, fields: Map<string, DisplayField>): void {
  const { doc, t } = ctx;
  const top = doc.y;
  const height = 104;
  doc.roundedRect(MARGIN, top, CONTENT_WIDTH, height, 7).lineWidth(1.6).stroke(INK);
  for (const [cx, cy] of [
    [MARGIN + 9, top + 9],
    [MARGIN + CONTENT_WIDTH - 9, top + 9],
    [MARGIN + 9, top + height - 9],
    [MARGIN + CONTENT_WIDTH - 9, top + height - 9],
  ] as const) {
    doc.circle(cx, cy, 2.4).lineWidth(0.8).stroke(INK);
  }
  const inner = MARGIN + 22;
  const innerWidth = CONTENT_WIDTH - 44;
  doc.font('Sans').fontSize(7.5).fillColor(MUTED);
  doc.text(t('scheda.field.numeroImpianto').toUpperCase(), inner, top + 16, { width: innerWidth / 2 });
  doc.text(t('scheda.field.matricola').toUpperCase(), inner + innerWidth / 2, top + 16, { width: innerWidth / 2, align: 'right' });
  doc.font('Sans-Bold').fontSize(18).fillColor(INK);
  doc.text(scheda.numeroImpianto ?? '—', inner, top + 26, { width: innerWidth / 2 });
  doc.text(scheda.matricola ?? '—', inner + innerWidth / 2, top + 26, { width: innerWidth / 2, align: 'right' });
  doc
    .font('Sans')
    .fontSize(10)
    .fillColor(scheda.indirizzo ? INK : MUTED)
    .text(scheda.indirizzo ?? '—', inner, top + 52, { width: innerWidth, height: 13, ellipsis: true });
  const lineY = top + 70;
  doc
    .moveTo(inner, lineY)
    .lineTo(inner + innerWidth, lineY)
    .lineWidth(0.5)
    .stroke(RULE);
  const cols = ['portataKg', 'capienzaPersone', 'fermate', 'marca'] as const;
  const colWidth = innerWidth / cols.length;
  cols.forEach((key, i) => {
    const field = fields.get(key);
    doc.font('Sans').fontSize(7).fillColor(MUTED);
    doc.text((field?.label ?? key).toUpperCase(), inner + i * colWidth, lineY + 6, { width: colWidth - 6, height: 9, ellipsis: true });
    doc.font('Sans-Bold').fontSize(10).fillColor(INK);
    doc.text(field?.value || '—', inner + i * colWidth, lineY + 16, { width: colWidth - 6, height: 13, ellipsis: true });
  });
  doc.y = top + height + 10;
}

export function drawFooters(ctx: PdfContext, generated: string): void {
  const { doc, t } = ctx;
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i += 1) {
    doc.switchToPage(i);
    const y = PAGE.height - MARGIN - 14;
    doc
      .moveTo(MARGIN, y - 6)
      .lineTo(MARGIN + CONTENT_WIDTH, y - 6)
      .lineWidth(0.5)
      .stroke(RULE);
    doc.font('Sans').fontSize(7).fillColor(MUTED);
    doc.text(`${generated} — Created and Designed by Carbon Stealth VCC — carbonstealth.eu`, MARGIN, y, { width: CONTENT_WIDTH - 80, lineBreak: false });
    doc.text(t('pdf.page', { page: String(i + 1), pages: String(range.count) }), MARGIN + CONTENT_WIDTH - 80, y, { width: 80, align: 'right', lineBreak: false });
  }
}
