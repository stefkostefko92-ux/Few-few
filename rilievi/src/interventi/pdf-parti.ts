import { FIRMA_H, FIRMA_W, pathFirma, type Firma } from './firma.js';
import { codiceVoce, type GruppoVoci, type ValoriVoci } from './voci.js';

/** Рисуването на частите на листа за интервенция в PDF-а (pdf.ts): колоните, кутийките, подписите. */
export const INK = '#000000';
export const MUTED = '#555555';
const FILL = '#ececec';
export const FS = 7;
export const BOX = 6.4;

/** Текстът на един ред с текущия шрифт: по-дългият се съкращава с „…“ (pdfkit не го прави при `continued`). */
export function unaRiga(doc: PDFKit.PDFDocument, text: string, width: number): string {
  if (doc.widthOfString(text) <= width) return text;
  let low = 0;
  let high = text.length;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if (doc.widthOfString(`${text.slice(0, mid).trimEnd()}…`) <= width) low = mid;
    else high = mid - 1;
  }
  return `${text.slice(0, low).trimEnd()}…`;
}

/** Текстът в най-много `righe` реда с текущия шрифт, съкратен с „…“. */
export function inRighe(
  doc: PDFKit.PDFDocument,
  text: string,
  width: number,
  righe: number,
): string {
  const max = doc.heightOfString('X', { width }) * righe + 0.5;
  if (doc.heightOfString(text, { width }) <= max) return text;
  let low = 0;
  let high = text.length;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if (doc.heightOfString(`${text.slice(0, mid).trimEnd()}…`, { width }) <= max) low = mid;
    else high = mid - 1;
  }
  return `${text.slice(0, low).trimEnd()}…`;
}

const GRUPPO_H = 11;
/** Колоната отвътре: откъде започва текстът на точката и колко е широк. */
const textXOf = (x: number) => x + 4 + BOX + 4 + 12;
const textWOf = (width: number) => width - (textXOf(0) - 0) - 4;

/** Текстът на точката (празното място — със записаното или „……“) и мястото за „C“/„P“. */
function rigaVoce(voce: GruppoVoci['voci'][number], value: ValoriVoci[string] | undefined) {
  return {
    testo: voce.testo.replace('{q}', value?.q ? value.q : '……'),
    scelteW: voce.scelte ? voce.scelte.length * 20 : 0,
  };
}

function altezzaVoce(doc: PDFKit.PDFDocument, testo: string, textW: number, fs: number): number {
  doc.font('Sans').fontSize(fs);
  return Math.max(fs + 3, doc.heightOfString(testo, { width: textW }) + 2.4);
}

/** Колко е висока колоната при този размер — без да се рисува (изборът на размера в pdf.ts). */
export function misuraColonna(
  doc: PDFKit.PDFDocument,
  gruppi: readonly GruppoVoci[],
  voci: ValoriVoci,
  width: number,
  fs: number,
): number {
  let h = 0;
  for (const gruppo of gruppi) {
    h += GRUPPO_H;
    for (const voce of gruppo.voci) {
      const { testo, scelteW } = rigaVoce(voce, voci[codiceVoce(voce.n)]);
      h += altezzaVoce(doc, testo, textWOf(width) - scelteW, fs);
    }
  }
  return h;
}

/** Една колона с групите; връща къде свършва. */
export function drawColonna(
  doc: PDFKit.PDFDocument,
  gruppi: readonly GruppoVoci[],
  voci: ValoriVoci,
  x: number,
  top: number,
  width: number,
  fs: number = FS,
): number {
  let y = top;
  const textX = textXOf(x);
  const textW = textWOf(width);
  doc.lineWidth(0.6).strokeColor(INK);
  for (const gruppo of gruppi) {
    doc.rect(x, y, width, GRUPPO_H).fillAndStroke(FILL, INK);
    doc
      .font('Sans-Bold')
      .fontSize(7.6)
      .fillColor(INK)
      .text(gruppo.titolo.toUpperCase(), x, y + 1.3, { width, align: 'center' });
    y += GRUPPO_H;
    for (const voce of gruppo.voci) {
      const key = codiceVoce(voce.n);
      const value = voci[key];
      // 84: „C“ и „P“ с кутийките си — в края на реда.
      const { testo, scelteW } = rigaVoce(voce, value);
      const h = altezzaVoce(doc, testo, textW - scelteW, fs);
      doc.rect(x, y, width, h).stroke();
      box(doc, x + 4, y + (h - BOX) / 2, Boolean(value?.x));
      doc
        .font('Sans-Bold')
        .fontSize(fs)
        .fillColor(INK)
        .text(key, x + 4 + BOX + 3, y + 1.3, { lineBreak: false });
      doc
        .font('Sans')
        .fontSize(fs)
        .text(testo, textX, y + 1.3, { width: textW - scelteW });
      (voce.scelte ?? []).forEach((scelta, i) => {
        const sx = x + width - scelteW + i * 20;
        doc
          .font('Sans')
          .fontSize(fs)
          .fillColor(INK)
          .text(scelta, sx, y + 1.3, { lineBreak: false });
        box(doc, sx + 7, y + (h - BOX) / 2, Boolean(value?.c?.includes(scelta)));
      });
      y += h;
    }
  }
  return y;
}

/** Кутийка с кръстче, когато е отметната — както се „crocetta“ на блока. */
export function box(doc: PDFKit.PDFDocument, x: number, y: number, checked: boolean): void {
  doc.save().lineWidth(0.6).strokeColor(INK).rect(x, y, BOX, BOX).stroke();
  if (checked) {
    doc
      .lineWidth(1.1)
      .moveTo(x + 1.1, y + 1.1)
      .lineTo(x + BOX - 1.1, y + BOX - 1.1)
      .moveTo(x + BOX - 1.1, y + 1.1)
      .lineTo(x + 1.1, y + BOX - 1.1)
      .stroke();
  }
  doc.restore();
}

export function tickAt(
  doc: PDFKit.PDFDocument,
  x: number,
  y: number,
  checked: boolean,
  label: string,
): void {
  box(doc, x, y, checked);
  doc
    .font('Sans')
    .fontSize(8)
    .fillColor(INK)
    .text(label, x + BOX + 3, y - 0.8, { lineBreak: false });
}

export function dotted(doc: PDFKit.PDFDocument, x0: number, x1: number, y: number): void {
  doc
    .save()
    .lineWidth(0.5)
    .strokeColor(MUTED)
    .dash(0.8, { space: 1.6 })
    .moveTo(x0, y)
    .lineTo(x1, y)
    .stroke()
    .undash()
    .restore();
}

export function drawFirma(
  doc: PDFKit.PDFDocument,
  label: string,
  nome: string | null,
  firma: Firma | null,
  x: number,
  y: number,
  width: number,
): number {
  const height = 52;
  // „Firma del tecnico: Mario Rossi“ на един ред, под него полето с подписа. Връща долния му край.
  doc.font('Sans').fontSize(8).fillColor(MUTED);
  const prefix = `${label}: `;
  const prefixW = doc.widthOfString(prefix);
  doc.text(prefix, x, y, { lineBreak: false });
  doc.font('Sans-Bold').fillColor(INK);
  doc.text(unaRiga(doc, nome ?? '—', width - prefixW), x + prefixW, y, { lineBreak: false });
  const top = y + 12;
  doc.save().lineWidth(0.6).strokeColor(INK).rect(x, top, width, height).stroke().restore();
  if (!firma) return top + height;
  const scale = Math.min(width / FIRMA_W, height / FIRMA_H);
  const offsetX = x + (width - FIRMA_W * scale) / 2;
  doc
    .save()
    .translate(offsetX, top)
    .scale(scale)
    .path(pathFirma(firma))
    .lineWidth(4)
    .lineCap('round')
    .lineJoin('round')
    .strokeColor(INK)
    .stroke()
    .restore();
  return top + height;
}
