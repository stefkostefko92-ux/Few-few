import { unaRiga } from '../interventi/pdf-parti.js';
import type { DisplayField } from './format.js';
import {
  CONTENT_WIDTH,
  GAP,
  INK,
  MARGIN,
  MUTED,
  RULE,
  SIZE,
  type PdfContext,
} from './pdf-layout.js';
import type { SchedaFull } from './service.js';

const GRANDE = 19.5;
const GRANDE_MIN = 8;

/**
 * Голямата стойност на табелата на ЕДИН ред (матрикулата е свободен текст до 40 знака от 10 ноември 2026,
 * номерът — до 20 цифри): размерът пада от 19,5 до 8 pt (колкото надписите на табелата), докато се
 * събере, и чак тогава — „…“; иначе pdfkit я пренася върху реда с товара и спирките.
 */
function grandeInRiga(
  doc: PDFKit.PDFDocument,
  text: string,
  width: number,
): { size: number; text: string } {
  let size = GRANDE;
  doc.fontSize(size);
  while (size > GRANDE_MIN && doc.widthOfString(text) > width) {
    size -= 0.5;
    doc.fontSize(size);
  }
  return { size, text: unaRiga(doc, text, width) };
}

/**
 * Горната част на първата страница на PDF-а: заглавната лента и табелата. Разделът „Impianto“ не се
 * печата отделно — всичко от него е тук: датата, адресът, бонът, марката, матрикулата, номерът и
 * данните от табелата.
 */

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
  /** Адресът на уредбата; null — не е попълнен (на мястото му — сив надпис). */
  address: string | null;
  noAddress: string;
  buonoLabel: string;
  buono: string | null;
}

const LOGO_BOX = { width: 170, height: 52 };
const META_WIDTH = 220;
const BUONO_WIDTH = 170;
const TITLE_SIZE = 16.5;

/**
 * Заглавната лента. Горе вляво логото на фирмата (без лого — името ѝ), вдясно датата и кой е
 * попълнил картата. Под тях заглавието, в средата; под него вляво адресът на уредбата — удебелен, със
 * същия размер като заглавието, вдясно бонът (решено със собственика по снимките, октомври 2026).
 */
export function drawHeader(ctx: PdfContext, info: HeaderInfo): void {
  const { doc } = ctx;
  const top = MARGIN;
  const x = MARGIN + CONTENT_WIDTH - META_WIDTH;
  const right = { width: META_WIDTH, align: 'right' } as const;
  let leftBottom = top;
  if (info.logo) {
    const size = info.logoSize;
    const scale = size ? Math.min(LOGO_BOX.width / size.width, LOGO_BOX.height / size.height) : 1;
    doc.image(info.logo, MARGIN, top, { fit: [LOGO_BOX.width, LOGO_BOX.height] });
    leftBottom = top + (size ? size.height * scale : LOGO_BOX.height);
  } else {
    doc
      .font('Sans-Bold')
      .fontSize(13.5)
      .fillColor(INK)
      .text(info.aziendaName, MARGIN, top, { width: CONTENT_WIDTH - META_WIDTH - GAP });
    leftBottom = doc.y;
  }
  doc.font('Sans-Bold').fontSize(10.5).fillColor(INK).text(info.dateLine, x, top, right);
  doc
    .font('Sans')
    .fontSize(9.5)
    .fillColor(MUTED)
    .text(info.creatorLabel, x, doc.y + 5, right);
  doc
    .font('Sans-Bold')
    .fontSize(13.5)
    .fillColor(INK)
    .text(info.creator, x, doc.y + 1, right);
  if (info.updatedLine) {
    doc
      .font('Sans')
      .fontSize(9)
      .fillColor(MUTED)
      .text(info.updatedLine, x, doc.y + 3, right);
  }
  const rowBottom = Math.max(leftBottom, doc.y);

  doc
    .font('Sans-Bold')
    .fontSize(TITLE_SIZE)
    .fillColor(INK)
    .text(info.title, MARGIN, rowBottom + 10, { width: CONTENT_WIDTH, align: 'center' });
  const subTop = doc.y + 4;
  doc
    .font('Sans-Bold')
    .fontSize(TITLE_SIZE)
    .fillColor(info.address ? INK : MUTED)
    .text(info.address ?? info.noAddress, MARGIN, subTop, {
      width: CONTENT_WIDTH - BUONO_WIDTH - GAP,
    });
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
 * Табелата на асансьора: матрикулата вляво, номерът вдясно (по снимките), после портата / лица /
 * спирки / марка — като в кабината. Адресът е в заглавната лента.
 */
export function drawPlate(
  ctx: PdfContext,
  scheda: SchedaFull,
  fields: Map<string, DisplayField>,
): void {
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
  doc.text(t('scheda.field.numeroImpianto').toUpperCase(), inner + half, top + 16, {
    width: half,
    align: 'right',
  });
  doc.font('Sans-Bold').fillColor(INK);
  // Двете стойности делят реда: номерът (до 20 цифри) взима колкото му трябва от дясната половина,
  // матрикулата — останалото без 16 pt между тях; по-малкият шрифт стои на същата основна линия.
  const yDi = (size: number) => top + 28 + (GRANDE - size) * 0.8;
  const numero = grandeInRiga(doc, scheda.numeroImpianto ?? '—', half - 8);
  doc.fontSize(numero.size).text(numero.text, inner + half, yDi(numero.size), {
    width: half,
    align: 'right',
    lineBreak: false,
  });
  const restante = innerWidth - doc.widthOfString(numero.text) - 16;
  const matricola = grandeInRiga(doc, scheda.matricola ?? '—', restante);
  doc.fontSize(matricola.size).text(matricola.text, inner, yDi(matricola.size), {
    width: restante,
    lineBreak: false,
  });
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
    doc.text((field?.label ?? key).toUpperCase(), inner + i * colWidth, lineY + 6, {
      width: colWidth - 6,
      height: 11,
      ellipsis: true,
    });
    doc.font('Sans-Bold').fontSize(SIZE.value).fillColor(INK);
    doc.text(field?.value || '—', inner + i * colWidth, lineY + 18, {
      width: colWidth - 6,
      height: 15,
      ellipsis: true,
    });
  });
  doc.y = top + height + 10;
}
