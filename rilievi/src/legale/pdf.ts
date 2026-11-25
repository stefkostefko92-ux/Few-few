import PDFDocument from 'pdfkit';
import { fontsOf, inBuffer, INK, M, MUTED, PAGE, W } from '../argano/pdf-testata.js';
import type { Translator } from '../i18n.js';
import type { Articolo, TestoLegaleDoc } from './testi.js';

export interface CopiaOptions {
  /** Заглавието горе; по подразбиране — „Copia delle condizioni accettate“. */
  titolo?: string;
  /** Приетите текстове, в реда на показване (условията с приложенията, после правилата). */
  testi: readonly TestoLegaleDoc[];
  /** Какво, кой, кога — редове „етикет: стойност“ над текста. */
  riepilogo: ReadonlyArray<readonly [string, string]>;
  t: Translator;
  fontDir: string;
}

/**
 * Копието на приетото за писмото до администратора (траен носител): кой, кога, коя версия и отпечатък,
 * кои клаузи са одобрени специално — и целият текст, член по член. Номер на страница и името на
 * софтуера долу на всяка страница.
 */
export function renderCopiaAccettazione(o: CopiaOptions): Promise<Buffer> {
  const fonts = fontsOf(o.fontDir);
  const doc = new PDFDocument({
    size: 'A4',
    margin: M,
    bufferPages: true,
    info: {
      Title: o.titolo ?? o.t('legale.copia.titolo'),
      Creator: 'Rilievi Impianti — Carbon Stealth VCC',
    },
  });
  doc.registerFont('Sans', fonts.regular);
  doc.registerFont('Sans-Bold', fonts.bold);
  const testo = (text: string, size = 9.5, font = 'Sans', gap = 4): void => {
    doc.font(font).fontSize(size).fillColor(INK).text(text, M, doc.y, { width: W });
    doc.moveDown(gap / size);
  };

  doc
    .font('Sans-Bold')
    .fontSize(16)
    .fillColor(INK)
    .text(o.titolo ?? o.t('legale.copia.titolo'), M, M);
  doc.moveDown(0.4);
  for (const [label, value] of o.riepilogo) {
    doc.font('Sans-Bold').fontSize(9.5).text(`${label}: `, M, doc.y, { width: W, continued: true });
    doc.font('Sans').text(value);
  }
  doc.moveDown(0.8);

  const articoli = (list: readonly Articolo[]): void => {
    for (const a of list) {
      testo(`Art. ${a.numero} — ${a.titolo}`, 10.5, 'Sans-Bold', 2);
      for (const p of a.paragrafi) testo(p);
    }
  };
  for (const d of o.testi) {
    testo(d.titolo, 13, 'Sans-Bold', 2);
    doc
      .font('Sans')
      .fontSize(8.5)
      .fillColor(MUTED)
      .text(o.t('legale.versione', { versione: d.versione }), M, doc.y, { width: W });
    doc.moveDown(0.6);
    for (const p of d.premessa) testo(p);
    articoli(d.articoli);
    for (const allegato of d.allegati) {
      doc.moveDown(0.6);
      testo(allegato.titolo, 12, 'Sans-Bold', 2);
      articoli(allegato.articoli);
    }
    doc.moveDown(1);
  }

  const range = doc.bufferedPageRange();
  for (let i = 0; i < range.count; i += 1) {
    doc.switchToPage(range.start + i);
    // Под долното поле: без това pdfkit отваря нова страница за реда.
    doc.page.margins.bottom = 0;
    doc
      .font('Sans')
      .fontSize(7.5)
      .fillColor(MUTED)
      .text(
        `Rilievi Impianti — Carbon Stealth VCC · ${i + 1}/${range.count}`,
        M,
        PAGE.height - M + 8,
        {
          width: W,
          align: 'right',
          lineBreak: false,
        },
      );
  }
  return inBuffer(doc);
}
