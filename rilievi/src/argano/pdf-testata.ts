import { readFileSync } from 'node:fs';
import type { AziendaCartello } from '../cartelli/pdf.js';
import { pdfFontPaths } from '../schede/pdf.js';

/**
 * Общото на PDF-ите на изчисленията (аргано, ограничител): A4 с поле 40 pt, DejaVu Sans (четен веднъж за
 * процеса), горе логото вляво (без лого — името) и данните на фирмата вдясно, долу на всяка страница кога
 * и от кого е записано и номерът на страницата.
 */
export const M = 40;
export const PAGE = { width: 595.28, height: 841.89 };
export const W = PAGE.width - M * 2;
export const INK = '#000000';
export const MUTED = '#555555';
const LOGO = { width: 170, height: 44 };

const fontCache = new Map<string, { regular: Buffer; bold: Buffer }>();

export function fontsOf(dir: string): { regular: Buffer; bold: Buffer } {
  let fonts = fontCache.get(dir);
  if (!fonts) {
    const paths = pdfFontPaths(dir);
    fonts = { regular: readFileSync(paths.regular), bold: readFileSync(paths.bold) };
    fontCache.set(dir, fonts);
  }
  return fonts;
}

/** Логото и данните на фирмата; връща y под тях. */
export function disegnaTestata(doc: PDFKit.PDFDocument, testata: AziendaCartello): number {
  if (testata.logo) doc.image(testata.logo, M, M, { fit: [LOGO.width, LOGO.height] });
  else
    doc
      .font('Sans-Bold')
      .fontSize(13)
      .fillColor(INK)
      .text(testata.intestazione.nome, M, M, { width: LOGO.width + 40 });
  const destra = { width: W - LOGO.width - 20, align: 'right' } as const;
  doc
    .font('Sans-Bold')
    .fontSize(9)
    .fillColor(INK)
    .text(testata.intestazione.nome, M + LOGO.width + 20, M, destra);
  doc.font('Sans').fontSize(7.5).fillColor(MUTED);
  for (const riga of testata.intestazione.righe) doc.text(riga, M + LOGO.width + 20, doc.y, destra);
  return Math.max(M + LOGO.height, doc.y);
}

/** Под последния ред на всяка страница: `testo` и номерът на страницата (под долното поле). */
export function disegnaPiede(doc: PDFKit.PDFDocument, testo: string): void {
  const pagine = doc.bufferedPageRange();
  for (let i = 0; i < pagine.count; i++) {
    doc.switchToPage(pagine.start + i);
    // Под долното поле: без това pdfkit отваря нова страница за реда.
    doc.page.margins.bottom = 0;
    doc
      .font('Sans')
      .fontSize(7)
      .fillColor(MUTED)
      .text([testo, `${i + 1} / ${pagine.count}`].join('   ·   '), M, PAGE.height - M + 12, {
        width: W,
        align: 'right',
        lineBreak: false,
      });
  }
}

/** Документът като байтове, след `end()`. */
export function inBuffer(doc: PDFKit.PDFDocument): Promise<Buffer> {
  const chunks: Buffer[] = [];
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });
  doc.end();
  return done;
}
