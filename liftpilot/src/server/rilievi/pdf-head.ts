import 'server-only';
// The top of the PDF's first page: the header band and the plate. The section «Impianto» is not printed on its own —
// everything of it is here: the date, the address, the work order, the make, the matricola, the number and the plate's
// data. Ported 1:1 from rilievi (src/schede/pdf-head.ts, commit ae6329cb6): every constant, font size and offset is
// rilievi's.
import type { DisplayField } from '@/lib/rilievi/format';
import { CONTENT_WIDTH, GAP, INK, MARGIN, MUTED, RULE, SIZE, type PdfContext } from './pdf-layout';

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
  /** The plant's address; null — not filled in (in its place a grey line). */
  address: string | null;
  noAddress: string;
  buonoLabel: string;
  buono: string | null;
}

/** The plate's data: the identifiers of the sheet. */
export interface PlateData {
  numeroImpianto: string | null;
  matricola: string | null;
}

const LOGO_BOX = { width: 170, height: 52 };
const META_WIDTH = 220;
const BUONO_WIDTH = 170;
const TITLE_SIZE = 16.5;

/**
 * The header band. Top left the company's logo (without a logo — its name), on the right the date and who filled the
 * sheet in. Under them the title, centred; under it on the left the plant's address — bold, at the title's size, on the
 * right the work order (decided with the owner on the photos, October 2026).
 */
export function drawHeader(ctx: PdfContext, info: HeaderInfo): void {
  const { doc } = ctx;
  const top = MARGIN;
  const x = MARGIN + CONTENT_WIDTH - META_WIDTH;
  const right = { width: META_WIDTH, align: 'right' } as const;
  let leftBottom: number;
  if (info.logo) {
    const size = info.logoSize;
    const scale = size ? Math.min(LOGO_BOX.width / size.width, LOGO_BOX.height / size.height) : 1;
    doc.image(info.logo, MARGIN, top, { fit: [LOGO_BOX.width, LOGO_BOX.height] });
    leftBottom = top + (size ? size.height * scale : LOGO_BOX.height);
  } else {
    doc.font('Sans-Bold').fontSize(13.5).fillColor(INK).text(info.aziendaName, MARGIN, top, { width: CONTENT_WIDTH - META_WIDTH - GAP });
    leftBottom = doc.y;
  }
  doc.font('Sans-Bold').fontSize(10.5).fillColor(INK).text(info.dateLine, x, top, right);
  doc.font('Sans').fontSize(9.5).fillColor(MUTED).text(info.creatorLabel, x, doc.y + 5, right);
  doc.font('Sans-Bold').fontSize(13.5).fillColor(INK).text(info.creator, x, doc.y + 1, right);
  if (info.updatedLine) doc.font('Sans').fontSize(9).fillColor(MUTED).text(info.updatedLine, x, doc.y + 3, right);
  const rowBottom = Math.max(leftBottom, doc.y);

  doc.font('Sans-Bold').fontSize(TITLE_SIZE).fillColor(INK).text(info.title, MARGIN, rowBottom + 10, { width: CONTENT_WIDTH, align: 'center' });
  const subTop = doc.y + 4;
  doc
    .font('Sans-Bold')
    .fontSize(TITLE_SIZE)
    .fillColor(info.address ? INK : MUTED)
    .text(info.address ?? info.noAddress, MARGIN, subTop, { width: CONTENT_WIDTH - BUONO_WIDTH - GAP });
  const addressBottom = doc.y;
  const bx = MARGIN + CONTENT_WIDTH - BUONO_WIDTH;
  const buonoRight = { width: BUONO_WIDTH, align: 'right' } as const;
  doc.font('Sans').fontSize(9.5).fillColor(MUTED).text(info.buonoLabel, bx, subTop, buonoRight);
  doc
    .font('Sans-Bold')
    .fontSize(13.5)
    .fillColor(info.buono ? INK : MUTED)
    .text(info.buono ?? '—', bx, doc.y + 1, buonoRight);
  doc.y = Math.max(addressBottom, doc.y) + 12;
}

/**
 * The lift's nameplate: the matricola on the left, the number on the right (by the photos), then load / persons / stops
 * / make — as in the car. The address is in the header band.
 */
export function drawPlate(ctx: PdfContext, scheda: PlateData, fields: Map<string, DisplayField>): void {
  const { doc, t } = ctx;
  const top = doc.y;
  const height = 100;
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
  const half = innerWidth / 2;
  doc.font('Sans').fontSize(SIZE.label).fillColor(MUTED);
  doc.text(t('scheda.field.matricola').toUpperCase(), inner, top + 16, { width: half });
  doc.text(t('scheda.field.numeroImpianto').toUpperCase(), inner + half, top + 16, { width: half, align: 'right' });
  doc.font('Sans-Bold').fontSize(19.5).fillColor(INK);
  doc.text(scheda.matricola ?? '—', inner, top + 28, { width: half });
  doc.text(scheda.numeroImpianto ?? '—', inner + half, top + 28, { width: half, align: 'right' });
  const lineY = top + 58;
  doc
    .moveTo(inner, lineY)
    .lineTo(inner + innerWidth, lineY)
    .lineWidth(0.5)
    .stroke(RULE);
  const cols = ['portataKg', 'capienzaPersone', 'fermate', 'marca'] as const;
  const colWidth = innerWidth / cols.length;
  cols.forEach((key, i) => {
    const field = fields.get(key);
    doc.font('Sans').fontSize(8.5).fillColor(MUTED);
    doc.text((field?.label ?? key).toUpperCase(), inner + i * colWidth, lineY + 6, { width: colWidth - 6, height: 11, ellipsis: true });
    doc.font('Sans-Bold').fontSize(SIZE.value).fillColor(INK);
    doc.text(field?.value || '—', inner + i * colWidth, lineY + 18, { width: colWidth - 6, height: 15, ellipsis: true });
  });
  doc.y = top + height + 10;
}
