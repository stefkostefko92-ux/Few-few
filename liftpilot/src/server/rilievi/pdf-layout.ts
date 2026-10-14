import 'server-only';
// The layout of the sheet's PDF page: A4, 40 pt margins, three columns, a bottom line with the page number (the header
// band and the plate — pdf-head.ts). Drawing only — the data and the texts come ready (format.ts, the messages). Ported 1:1
// from rilievi (src/schede/pdf-layout.ts, commit ae6329cb6): every constant, font size and offset is rilievi's.
import type { DisplayField } from '@/lib/rilievi/format';
import type { RilieviT } from '@/lib/rilievi/t';

const PAGE = { width: 595.28, height: 841.89 };
export const MARGIN = 40;
export const CONTENT_WIDTH = PAGE.width - MARGIN * 2;
const FOOTER_SPACE = 44;
export const GAP = 16;
export const INK = '#000000';
export const MUTED = '#555555';
export const RULE = '#BDBDBD';

/** The font sizes (pt). All 1.5 pt (2 px) above the first ones — asked by the owner for the sheet (PDF and print, October
 *  2026); the screens do not change. */
export const SIZE = {
  label: 9,
  value: 11.5,
  section: 12,
  tableHead: 8.5,
  tableCell: 10.5,
  footer: 8.5,
} as const;

export interface PdfContext {
  doc: PDFKit.PDFDocument;
  t: RilieviT;
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
  doc.font('Sans').fontSize(SIZE.label);
  const label = doc.heightOfString(field.label, { width });
  doc.font('Sans').fontSize(SIZE.value);
  const value = doc.heightOfString(cellText(field), { width });
  return label + 2 + value;
}

function drawCell(ctx: PdfContext, field: DisplayField, x: number, y: number, width: number): void {
  const { doc } = ctx;
  doc.font('Sans').fontSize(SIZE.label).fillColor(MUTED).text(field.label, x, y, { width });
  const valueY = doc.y + 2;
  doc
    .font('Sans')
    .fontSize(SIZE.value)
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
  doc.font('Sans-Bold').fontSize(SIZE.section).fillColor(INK).text(title, MARGIN, doc.y);
  const lineY = doc.y + 3;
  doc
    .moveTo(MARGIN, lineY)
    .lineTo(MARGIN + CONTENT_WIDTH, lineY)
    .lineWidth(0.6)
    .stroke(INK);
  doc.y = lineY + 7;
}

/**
 * The bottom line of every page, on two lines: who downloaded the file and when + the page number, then Carbon Stealth's
 * signature. It stands below the page's bottom margin — the margin is lowered while it is written, otherwise pdfkit would
 * carry the text onto a new empty page.
 */
export function drawFooters(ctx: PdfContext, generated: string): void {
  const { doc, t } = ctx;
  const range = doc.bufferedPageRange();
  const pageWidth = 90;
  for (let i = range.start; i < range.start + range.count; i += 1) {
    doc.switchToPage(i);
    const margin = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    const second = PAGE.height - MARGIN - 8;
    const first = second - 12;
    doc
      .moveTo(MARGIN, first - 6)
      .lineTo(MARGIN + CONTENT_WIDTH, first - 6)
      .lineWidth(0.5)
      .stroke(RULE);
    doc.font('Sans').fontSize(SIZE.footer).fillColor(MUTED);
    doc.text(generated, MARGIN, first, { width: CONTENT_WIDTH - pageWidth, height: 11, ellipsis: true, lineBreak: false });
    doc.text(t('pdf.page', { page: String(i + 1), pages: String(range.count) }), MARGIN + CONTENT_WIDTH - pageWidth, first, { width: pageWidth, align: 'right', lineBreak: false });
    doc.text('Created and Designed by Carbon Stealth VCC — carbonstealth.eu', MARGIN, second, { width: CONTENT_WIDTH, lineBreak: false });
    doc.page.margins.bottom = margin;
  }
}
