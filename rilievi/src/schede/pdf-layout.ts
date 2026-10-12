import type { Translator } from '../i18n.js';
import type { DisplayField } from './format.js';
import type { SchedaFull } from './service.js';

/**
 * Подредбата на страницата на PDF-а: A4, полета 40 pt, три колони, табелата отгоре, долен ред с номер
 * на страницата. Само рисуване — данните и текстовете идват готови (format.ts, речникът).
 */

const PAGE = { width: 595.28, height: 841.89 };
export const MARGIN = 40;
export const CONTENT_WIDTH = PAGE.width - MARGIN * 2;
const FOOTER_SPACE = 34;
const GAP = 16;
export const INK = '#000000';
export const MUTED = '#555555';
const RULE = '#BDBDBD';

export interface PdfContext {
  doc: PDFKit.PDFDocument;
  t: Translator;
}

function bottom(): number {
  return PAGE.height - MARGIN - FOOTER_SPACE;
}

function ensureSpace(ctx: PdfContext, needed: number): void {
  if (ctx.doc.y + needed > bottom()) {
    ctx.doc.addPage();
    ctx.doc.y = MARGIN;
  }
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

/** На цял ред: адресът, бележките и отметките (квадратчетата не се свиват в тясна колона). */
function isWide(field: DisplayField): boolean {
  return field.wide || field.options !== undefined;
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
  ensureSpace(ctx, 40);
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

/** Какво стои в заглавната лента — текстовете идват готови от pdf.ts. */
export interface HeaderInfo {
  /** Логото на фирмата (прекодирано PNG/JPEG) и размерите му в пиксели; null — няма лого. */
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
 * Заглавната лента: най-горе вляво логото на фирмата (заглавието и името на фирмата под него), вдясно
 * датата и кой е попълнил картата — с едър шрифт, за да се вижда на всеки отпечатан лист.
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
  doc
    .font('Sans-Bold')
    .fontSize(15)
    .fillColor(INK)
    .text(info.title, MARGIN, leftY, { width: leftWidth });
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

/** Табелата на асансьора: номер и матрикула, адрес, портата/лица/спирки — като в кабината. */
export function drawPlate(
  ctx: PdfContext,
  scheda: SchedaFull,
  fields: Map<string, DisplayField>,
): void {
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
  doc.text(t('scheda.field.numeroImpianto').toUpperCase(), inner, top + 16, {
    width: innerWidth / 2,
  });
  doc.text(t('scheda.field.matricola').toUpperCase(), inner + innerWidth / 2, top + 16, {
    width: innerWidth / 2,
    align: 'right',
  });
  doc.font('Sans-Bold').fontSize(18).fillColor(INK);
  doc.text(scheda.numeroImpianto ?? '—', inner, top + 26, { width: innerWidth / 2 });
  doc.text(scheda.matricola ?? '—', inner + innerWidth / 2, top + 26, {
    width: innerWidth / 2,
    align: 'right',
  });
  doc
    .font('Sans')
    .fontSize(10)
    .fillColor(scheda.indirizzo ? INK : MUTED)
    .text(scheda.indirizzo ?? '—', inner, top + 52, {
      width: innerWidth,
      height: 13,
      ellipsis: true,
    });
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
    doc.text((field?.label ?? key).toUpperCase(), inner + i * colWidth, lineY + 6, {
      width: colWidth - 6,
      height: 9,
      ellipsis: true,
    });
    doc.font('Sans-Bold').fontSize(10).fillColor(INK);
    doc.text(field?.value || '—', inner + i * colWidth, lineY + 16, {
      width: colWidth - 6,
      height: 13,
      ellipsis: true,
    });
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
    doc.text(
      `${generated} — Created and Designed by Carbon Stealth VCC — carbonstealth.eu`,
      MARGIN,
      y,
      {
        width: CONTENT_WIDTH - 80,
        lineBreak: false,
      },
    );
    doc.text(t('pdf.page', { page: i + 1, pages: range.count }), MARGIN + CONTENT_WIDTH - 80, y, {
      width: 80,
      align: 'right',
      lineBreak: false,
    });
  }
}
