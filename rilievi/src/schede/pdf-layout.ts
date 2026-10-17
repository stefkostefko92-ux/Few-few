import type { Translator } from '../i18n.js';
import type { DisplayField } from './format.js';

/**
 * Подредбата на страницата на PDF-а: A4, полета 40 pt, три колони, долен ред с номер на страницата
 * (заглавната лента и табелата — pdf-head.ts). Само рисуване — данните и текстовете идват готови
 * (format.ts, речникът).
 */

const PAGE = { width: 595.28, height: 841.89 };
export const MARGIN = 40;
export const CONTENT_WIDTH = PAGE.width - MARGIN * 2;
const FOOTER_SPACE = 44;
export const GAP = 16;
export const INK = '#000000';
export const MUTED = '#555555';
export const RULE = '#BDBDBD';

/**
 * Размерите на шрифта (pt). Всички са с 1,5 pt (2 px) над първите — поискано от собственика за листа
 * (PDF и печат, октомври 2026); екранът на портала не се променя.
 */
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
  t: Translator;
}

function bottom(): number {
  return PAGE.height - MARGIN - FOOTER_SPACE;
}

/** Нова страница, ако `needed` не се побира до долния ред; true — ако е започнала нова. */
export function ensureSpace(ctx: PdfContext, needed: number): boolean {
  if (ctx.doc.y + needed <= bottom()) return false;
  ctx.doc.addPage();
  ctx.doc.y = MARGIN;
  return true;
}

/** Стойността на клетка: отметките като ☑/☐, празното като тире. */
function cellText(field: DisplayField): string {
  if (field.options) {
    return field.options.map((o) => `${o.checked ? '☑' : '☐'} ${o.label}`).join('    ');
  }
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

/** На цял ред: адресът, бележките и отметките (квадратчетата не се свиват); Sì/No се побира в колона. */
function isWide(field: DisplayField): boolean {
  return field.wide || (field.options !== undefined && field.kind !== 'yesno');
}

/** Полетата в три колони; широките — на цял ред. */
export function drawFields(ctx: PdfContext, fields: DisplayField[]): void {
  const { doc } = ctx;
  const columns = 3;
  const colWidth = (CONTENT_WIDTH - GAP * (columns - 1)) / columns;
  let i = 0;
  while (i < fields.length) {
    const row: DisplayField[] = [];
    if (isWide(fields[i]!)) {
      row.push(fields[i]!);
    } else {
      while (
        row.length < columns &&
        i + row.length < fields.length &&
        !isWide(fields[i + row.length]!)
      ) {
        row.push(fields[i + row.length]!);
      }
    }
    const width = row.length === 1 && isWide(row[0]!) ? CONTENT_WIDTH : colWidth;
    const height = Math.max(...row.map((field) => cellHeight(ctx, field, width)));
    ensureSpace(ctx, height + 6);
    const y = doc.y;
    row.forEach((field, column) =>
      drawCell(ctx, field, MARGIN + column * (colWidth + GAP), y, width),
    );
    doc.y = y + height + 6;
    i += row.length;
  }
}

export function drawSectionTitle(ctx: PdfContext, title: string): void {
  const { doc } = ctx;
  // Заглавието и поне един ред полета под него — заглавие сам-само в дъното на страницата няма.
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
 * Долният ред на всяка страница, на два реда: кой и кога е изтеглил файла + номерът на страницата, после
 * подписът на Carbon Stealth. Стои под долното поле на страницата — полето се сваля, докато се пише,
 * иначе pdfkit би пренесъл текста на нова празна страница.
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
    doc.text(generated, MARGIN, first, {
      width: CONTENT_WIDTH - pageWidth,
      height: 11,
      ellipsis: true,
      lineBreak: false,
    });
    doc.text(
      t('pdf.page', { page: i + 1, pages: range.count }),
      MARGIN + CONTENT_WIDTH - pageWidth,
      first,
      {
        width: pageWidth,
        align: 'right',
        lineBreak: false,
      },
    );
    doc.text('Created and Designed by Carbon Stealth VCC — carbonstealth.eu', MARGIN, second, {
      width: CONTENT_WIDTH,
      lineBreak: false,
    });
    doc.page.margins.bottom = margin;
  }
}
