import PDFDocument from 'pdfkit';
import type { ViewHelpers } from '../http/view.js';
import type { Translator } from '../i18n.js';
import { firmaSalvata } from '../interventi/firma.js';
import { drawFirma, INK, MUTED, unaRiga } from '../interventi/pdf-parti.js';
import { fontsOf } from '../interventi/pdf.js';
import { improntaLeggibile } from '../interventi/sigillo.js';
import {
  altezzaRiga,
  FONDO,
  intestazioneSezione,
  LOGO,
  M,
  PAD,
  piedi,
  riga,
  siNo,
  W,
} from './pdf-parti.js';
import type { VerbaleFull } from './service.js';
import { SEZIONI_VERBALE, valoriVerbale } from './voci.js';

/**
 * PDF-ът на „Verbale di chiusura cantiere“ — A4 като хартиения лист на собственика (5 ноември 2026): горе
 * логото на фирмата и заглавието, таблицата „Indirizzo | N° buono“, разделите с редовете (надпис, текст,
 * вдясно „Certificato“ SÌ/NO там, където го има), „Verbale positivo“, датата и двата подписа. Два
 * екземпляра от едно и също подписано съдържание — „Copia azienda“ и „Copia installatore“: надписът е
 * долу на всяка страница и в заглавието на файла. Дълъг текст прелива на следваща страница; подписите не
 * се делят. DejaVu Sans, вграден — като останалите PDF-и на портала.
 */

export const COPIE = ['azienda', 'installatore'] as const;
export type Copia = (typeof COPIE)[number];

export interface VerbalePdfOptions {
  t: Translator;
  fmt: ViewHelpers;
  fontDir: string;
  logo: Buffer | null;
  copia: Copia;
}

function nuovoDoc(options: VerbalePdfOptions, azienda: string): PDFKit.PDFDocument {
  const fonts = fontsOf(options.fontDir);
  const doc = new PDFDocument({
    size: 'A4',
    // Долното поле е малко: редът с копието се рисува там накрая, без pdfkit да добавя страница.
    margins: { top: M, left: M, right: M, bottom: 8 },
    bufferPages: true,
    info: {
      Title: `${options.t('verbali.titolo')} — ${options.t(`verbali.copia.${options.copia}`)}`,
      Author: azienda,
      Creator: 'Rilievi Impianti — Carbon Stealth VCC',
    },
  });
  doc.registerFont('Sans', fonts.regular);
  doc.registerFont('Sans-Bold', fonts.bold);
  return doc;
}

/** Целият протокол; страниците — по нужда. */
function disegna(doc: PDFKit.PDFDocument, row: VerbaleFull, options: VerbalePdfOptions): void {
  const { t, fmt } = options;
  if (options.logo) {
    doc.image(options.logo, M, M, { fit: [LOGO.width, LOGO.height] });
  } else {
    doc
      .font('Sans-Bold')
      .fontSize(13)
      .fillColor(INK)
      .text(row.azienda.name, M, M, {
        width: LOGO.width + 40,
        height: LOGO.height,
        ellipsis: true,
      });
  }
  doc
    .font('Sans-Bold')
    .fontSize(16)
    .fillColor(INK)
    .text(t('verbali.titolo'), M + W - 300, M + 10, { width: 300, align: 'right' });

  // „Indirizzo | N° buono“ — като таблицата горе на листа.
  let y = M + LOGO.height + 14;
  const indW = W * 0.68;
  const testa = 34;
  doc.lineWidth(0.8).strokeColor(INK);
  doc.rect(M, y, indW, testa).stroke();
  doc.rect(M + indW, y, W - indW, testa).stroke();
  const cella = (label: string, value: string, x: number, width: number) => {
    doc
      .font('Sans')
      .fontSize(7.5)
      .fillColor(MUTED)
      .text(label, x + PAD + 1, y + 4, { lineBreak: false });
    doc.font('Sans-Bold').fontSize(10).fillColor(INK);
    doc.text(unaRiga(doc, value || '—', width - PAD * 2 - 2), x + PAD + 1, y + 16, {
      lineBreak: false,
    });
  };
  cella(t('verbali.campo.indirizzo'), row.indirizzo ?? '', M, indW);
  cella(t('verbali.campo.buono'), row.buono ?? '', M + indW, W - indW);
  y += testa + 12;

  const voci = valoriVerbale(row.voci);
  for (const sezione of SEZIONI_VERBALE) {
    const titolo = t(`verbali.sezione.${sezione.key}`);
    const certificati = sezione.voci.some((v) => v.certificato);
    const prima = altezzaRiga(doc, sezione.voci[0]!, voci[sezione.voci[0]!.key]?.t ?? '');
    // Заглавието на раздела не остава само в края на страницата.
    if (y + 15 + prima > FONDO) {
      doc.addPage();
      y = M;
    }
    y = intestazioneSezione(doc, t, titolo, certificati, y);
    for (const voce of sezione.voci) {
      const h = altezzaRiga(doc, voce, voci[voce.key]?.t ?? '');
      if (y + h > FONDO) {
        doc.addPage();
        y = intestazioneSezione(doc, t, `${titolo} (${t('verbali.segue')})`, certificati, M);
      }
      riga(doc, t, voce, voci, y, h);
      y += h;
    }
    y += 7;
  }

  // „Verbale positivo“, датата и подписите — заедно, на една страница.
  const firmaW = (W - 24) / 2;
  const chiusura = 22 + 18 + 64 + (row.confermatoAt ? 34 : 0);
  if (y + chiusura > FONDO) {
    doc.addPage();
    y = M;
  }
  doc.lineWidth(0.8).strokeColor(INK).rect(M, y, W, 20).stroke();
  doc
    .font('Sans-Bold')
    .fontSize(9.5)
    .fillColor(INK)
    .text(t('verbali.positivo'), M + PAD + 1, y + 5.5, { lineBreak: false });
  siNo(doc, t, M + 160, y + 5.8, row.positivo === null ? null : row.positivo ? 'si' : 'no');
  y += 22 + 6;
  doc
    .font('Sans')
    .fontSize(9)
    .fillColor(MUTED)
    .text(`${t('verbali.campo.data')} `, M, y, { continued: true })
    .font('Sans-Bold')
    .fillColor(INK)
    .text(fmt.day(row.data), { lineBreak: false });
  y += 18;
  const firme = [
    [t('verbali.firma.tecnico'), row.firmaTecnicoNome, firmaSalvata(row.firmaTecnico)],
    [t('verbali.firma.supervisore'), row.firmaSupervisoreNome, firmaSalvata(row.firmaSupervisore)],
  ] as const;
  let end = y;
  firme.forEach(([label, nome, firma], i) => {
    end = drawFirma(doc, label, nome, firma, M + i * (firmaW + 24), y, firmaW);
  });
  y = end;
  if (row.confermatoAt) {
    doc
      .font('Sans')
      .fontSize(7)
      .fillColor(MUTED)
      .text(
        t('verbali.confermato', {
          at: fmt.dateTime(row.confermatoAt),
          name: row.confermatoBy?.name ?? '—',
        }),
        M,
        y + 5,
        { width: W, align: 'center', lineBreak: false },
      );
    y += 14;
    if (row.impronta) {
      // Отпечатъкът — цял (до два реда), не съкратен: по него се сверява подписаното.
      doc
        .font('Sans')
        .fontSize(6.5)
        .fillColor(MUTED)
        .text(t('verbali.sigillo.pdf', { impronta: improntaLeggibile(row.impronta) }), M, y, {
          width: W,
          align: 'center',
        });
    }
  }
}

export function renderVerbalePdf(row: VerbaleFull, options: VerbalePdfOptions): Promise<Buffer> {
  const doc = nuovoDoc(options, row.azienda.name);
  disegna(doc, row, options);
  piedi(doc, options.t, options.copia);
  const chunks: Buffer[] = [];
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });
  doc.end();
  return done;
}
