import type { Translator } from '../i18n.js';
import { box, INK, MUTED } from '../interventi/pdf-parti.js';
import type { ValoriVerbale, VoceVerbale } from './voci.js';

/**
 * Частите на PDF-а на протокола (pdf.ts): мерките на листа, клетката SÌ/NO, заглавието на раздела, редът
 * (надпис, текст, „Certificato“) и долът на всяка страница с копието.
 */

export const PAGE = { width: 595.28, height: 841.89 };
export const M = 32;
export const W = PAGE.width - M * 2;
export const LOGO = { width: 170, height: 44 };
/** Долната граница на съдържанието: под нея е редът с копието и страницата. */
export const FONDO = PAGE.height - M - 18;
export const LABEL_W = 128;
export const CERT_W = 78;
export const TEXT_W = W - LABEL_W - CERT_W;
export const FS = 8.5;
export const PAD = 3.5;
export const FILL = '#ececec';

/** „SÌ ☐ NO ☐“ в клетка, с кръстче на избраното. */
export function siNo(
  doc: PDFKit.PDFDocument,
  t: Translator,
  x: number,
  y: number,
  valore: 'si' | 'no' | null,
): void {
  const segni = [
    ['si', t('verbali.si')],
    ['no', t('verbali.no')],
  ] as const;
  segni.forEach(([key, label], i) => {
    const sx = x + i * 36;
    doc.font('Sans').fontSize(FS).fillColor(INK).text(label, sx, y, { lineBreak: false });
    box(doc, sx + doc.widthOfString(label) + 3, y + 1.4, valore === key);
  });
}

/** Колко висок е редът: текстът в средната колона, най-малко един ред (при „Varie“ — няколко). */
export function altezzaRiga(doc: PDFKit.PDFDocument, voce: VoceVerbale, testo: string): number {
  doc.font('Sans').fontSize(FS);
  const h = testo ? doc.heightOfString(testo, { width: TEXT_W - PAD * 2 }) : 0;
  return Math.max(voce.varie ? 34 : 18, h + PAD * 2 + 1);
}

export function intestazioneSezione(
  doc: PDFKit.PDFDocument,
  t: Translator,
  titolo: string,
  certificati: boolean,
  y: number,
): number {
  const h = 15;
  doc.lineWidth(0.6).strokeColor(INK);
  doc.rect(M, y, W - CERT_W, h).fillAndStroke(FILL, INK);
  doc.rect(M + W - CERT_W, y, CERT_W, h).fillAndStroke(FILL, INK);
  doc
    .font('Sans-Bold')
    .fontSize(9)
    .fillColor(INK)
    .text(titolo.toUpperCase(), M + PAD, y + 3, { lineBreak: false });
  if (certificati) {
    doc
      .font('Sans-Bold')
      .fontSize(7.5)
      .text(t('verbali.certificato'), M + W - CERT_W, y + 3.5, {
        width: CERT_W,
        align: 'center',
        lineBreak: false,
      });
  }
  return y + h;
}

export function riga(
  doc: PDFKit.PDFDocument,
  t: Translator,
  voce: VoceVerbale,
  voci: ValoriVerbale,
  y: number,
  h: number,
): void {
  const value = voci[voce.key];
  doc.lineWidth(0.6).strokeColor(INK);
  doc.rect(M, y, LABEL_W, h).stroke();
  doc.rect(M + LABEL_W, y, TEXT_W, h).stroke();
  doc.rect(M + LABEL_W + TEXT_W, y, CERT_W, h).stroke();
  doc
    .font('Sans-Bold')
    .fontSize(FS)
    .fillColor(INK)
    .text(t(`verbali.voce.${voce.key}`), M + PAD, y + PAD + 0.5, { width: LABEL_W - PAD * 2 });
  if (value?.t) {
    doc
      .font('Sans')
      .fontSize(FS)
      .fillColor(INK)
      .text(value.t, M + LABEL_W + PAD, y + PAD + 0.5, { width: TEXT_W - PAD * 2 });
  }
  // „Certificato“ — само на редовете, които го имат; другите клетки остават празни (като на хартията).
  if (voce.certificato) siNo(doc, t, M + LABEL_W + TEXT_W + 8, y + PAD + 0.5, value?.c ?? null);
}

/** Долу на всяка страница: копието (удебелено) и „Pagina n di m“. */
export function piedi(doc: PDFKit.PDFDocument, t: Translator, copia: string): void {
  const { start, count } = doc.bufferedPageRange();
  for (let i = start; i < start + count; i += 1) {
    doc.switchToPage(i);
    const y = PAGE.height - M - 4;
    doc
      .font('Sans-Bold')
      .fontSize(10)
      .fillColor(INK)
      .text(t(`verbali.copia.${copia}`), M, y, {
        width: W,
        align: 'center',
        lineBreak: false,
      });
    if (count > 1) {
      doc
        .font('Sans')
        .fontSize(7)
        .fillColor(MUTED)
        .text(t('verbali.pagina', { n: i - start + 1, tot: count }), M, y + 2, {
          width: W,
          align: 'right',
          lineBreak: false,
        });
    }
  }
}
