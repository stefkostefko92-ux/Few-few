import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Translator } from '../i18n.js';
import { box, INK } from '../interventi/pdf-parti.js';
import { fontsOf } from '../interventi/pdf.js';
import type { ValoriVerbale, VoceVerbale } from './voci.js';

/**
 * Частите на PDF-а на протокола (pdf.ts) — мерките и клетките на хартиения лист на собственика (5 ноември
 * 2026, „uguale identico“): рамка около страницата, логото горе в средата, редът „Quadro: …“ в една клетка
 * с текста след надписа, вдясно „Certificato / Si No“ в клетката на всеки ред, който го има (другите —
 * празни), заглавието на раздела — центриран ред през цялата ширина. Шрифтът е serif като на листа
 * (DejaVu Serif — кирилицата е покрита); без него — DejaVu Sans.
 */

export const PAGE = { width: 595.28, height: 841.89 };
/** Рамката на листа и полето вътре в нея. */
export const CORNICE = 28;
export const M = 50;
export const W = PAGE.width - M * 2;
export const LOGO = { width: 380, height: 92 };
/** Долът на рамката; под нея е само редът с отпечатъка. */
export const FONDO_CORNICE = PAGE.height - CORNICE;
export const FONDO = FONDO_CORNICE - 14;
export const CERT_W = 70;
export const TESTO_W = W - CERT_W;
export const FS = 10;
export const PAD = 4;
export const RIGA_H = 27;
export const VARIE_H = 54;
export const TESTA_SEZIONE = 17;

const serifCache = new Map<string, { regular: Buffer; bold: Buffer }>();

/** DejaVu Serif (в образа — `fonts-dejavu-core`); ако го няма — DejaVu Sans, който портът проверява при старт. */
export function fontsVerbale(dir: string): { regular: Buffer; bold: Buffer } {
  let fonts = serifCache.get(dir);
  if (!fonts) {
    const regular = join(dir, 'DejaVuSerif.ttf');
    const bold = join(dir, 'DejaVuSerif-Bold.ttf');
    fonts =
      existsSync(regular) && existsSync(bold)
        ? { regular: readFileSync(regular), bold: readFileSync(bold) }
        : fontsOf(dir);
    serifCache.set(dir, fonts);
  }
  return fonts;
}

/** Рамката около страницата — като на хартиения лист. */
export function cornice(doc: PDFKit.PDFDocument): void {
  doc
    .save()
    .lineWidth(0.8)
    .strokeColor(INK)
    .rect(CORNICE, CORNICE, PAGE.width - CORNICE * 2, PAGE.height - CORNICE * 2)
    .stroke()
    .restore();
}

/** Логото на фирмата горе в средата (без лого — името ѝ); връща долния край. */
export function intestazione(
  doc: PDFKit.PDFDocument,
  logo: Buffer | null,
  azienda: string,
): number {
  const top = CORNICE + 16;
  if (logo) {
    doc.image(logo, M + (W - LOGO.width) / 2, top, {
      fit: [LOGO.width, LOGO.height],
      align: 'center',
      valign: 'center',
    });
  } else {
    doc
      .font('Serif-Bold')
      .fontSize(18)
      .fillColor(INK)
      .text(azienda, M, top + LOGO.height / 2 - 12, {
        width: W,
        align: 'center',
        height: 26,
        ellipsis: true,
      });
  }
  return top + LOGO.height;
}

/** „Si ☐   No ☐“ — кутийката до думата, с кръстче на избраното. */
export function siNo(
  doc: PDFKit.PDFDocument,
  etichette: { si: string; no: string },
  x: number,
  y: number,
  valore: 'si' | 'no' | null,
  passo: number,
  fs = FS,
  font: 'Serif' | 'Serif-Bold' = 'Serif',
): void {
  (['si', 'no'] as const).forEach((key, i) => {
    const sx = x + i * passo;
    doc.font(font).fontSize(fs).fillColor(INK).text(etichette[key], sx, y, { lineBreak: false });
    box(doc, sx + doc.widthOfString(etichette[key]) + 3, y + fs * 0.18, valore === key);
  });
}

/** Надписът на реда и текстът след него — един абзац в лявата клетка. */
const testoRiga = (t: Translator, voce: VoceVerbale, testo: string) =>
  `${t(`verbali.voce.${voce.key}`)}:${testo ? ` ${testo}` : ''}`;

/** Колко висок е редът: като на листа (Varie — двойно), или колкото текстът му. */
export function altezzaRiga(
  doc: PDFKit.PDFDocument,
  t: Translator,
  voce: VoceVerbale,
  testo: string,
): number {
  doc.font('Serif').fontSize(FS);
  const h = doc.heightOfString(testoRiga(t, voce, testo), { width: TESTO_W - PAD * 2 });
  return Math.max(voce.varie ? VARIE_H : RIGA_H, h + PAD * 2 + 2);
}

/** Заглавието на раздела — центриран ред през цялата ширина. */
export function intestazioneSezione(doc: PDFKit.PDFDocument, titolo: string, y: number): number {
  doc.lineWidth(0.7).strokeColor(INK).rect(M, y, W, TESTA_SEZIONE).stroke();
  doc
    .font('Serif')
    .fontSize(11)
    .fillColor(INK)
    .text(titolo, M, y + 3, { width: W, align: 'center', lineBreak: false });
  return y + TESTA_SEZIONE;
}

/** Един ред: „Quadro: …“ вляво, вдясно „Certificato / Si No“ или празна клетка. */
export function riga(
  doc: PDFKit.PDFDocument,
  t: Translator,
  voce: VoceVerbale,
  voci: ValoriVerbale,
  y: number,
  h: number,
): void {
  const value = voci[voce.key];
  doc.lineWidth(0.7).strokeColor(INK);
  doc.rect(M, y, TESTO_W, h).stroke();
  doc.rect(M + TESTO_W, y, CERT_W, h).stroke();
  doc
    .font('Serif')
    .fontSize(FS)
    .fillColor(INK)
    .text(testoRiga(t, voce, value?.t ?? ''), M + PAD, y + PAD, { width: TESTO_W - PAD * 2 });
  if (!voce.certificato) return;
  const x = M + TESTO_W;
  doc
    .font('Serif')
    .fontSize(8.5)
    .fillColor(INK)
    .text(t('verbali.certificato'), x, y + 3, { width: CERT_W, align: 'center', lineBreak: false });
  siNo(
    doc,
    { si: t('verbali.carta.si'), no: t('verbali.carta.no') },
    x + 7,
    y + 14,
    value?.c ?? null,
    31,
    8.5,
  );
}
