import PDFDocument from 'pdfkit';
import { fontsOf } from '../interventi/pdf.js';
import { MUTED, unaRiga } from '../interventi/pdf-parti.js';
import { OPZIONI_PDFA } from '../legale/pdfa.js';
import type { BuonoData } from './form.js';
import { Foglio, M, PAGE, W, type BuonoPdfOptions, type Doc } from './pdf-foglio.js';
import {
  chiusura,
  controlli,
  datiGenerali,
  firmeFinali,
  resoconto,
  sequenze,
  testata,
} from './pdf-sezioni.js';

export type { BuonoPdfOptions, FirmaPdf } from './pdf-foglio.js';

/**
 * PDF-ът на „Buono di lavoro“ — A4 като хартиения лист: горе логото на фирмата, заглавието и кодът на
 * модула от настройките; „Dati generali“, „Sequenze di lavoro“ (поне `RIGHE_STAMPA` реда — празните за
 * писане на ръка), „Controlli“ с групата при смяна на таблото, бележките, „Resoconto attività“ и подписите
 * долу; най-долу клаузата на фирмата. Подпис, който го няма, е празно място (подписва се на ръка);
 * невалиден — с думи, без щрихите. Дълъг лист продължава на следваща страница с главата на таблицата.
 * PDF/A-2b, DejaVu Sans вграден.
 */

/** Номерът на страницата и редът „Generato con…“ — под долното поле, на всяка страница. */
function piedi(doc: Doc, o: BuonoPdfOptions, firme: { n: number; nonValide: number }): void {
  const range = doc.bufferedPageRange();
  const generato = o.t('buoni.pdfTesto.generato', { data: o.fmt.dateTime(o.generatoIl) });
  const stato = [
    firme.n > 0 ? o.t('buoni.pdfTesto.firme', { n: firme.n }) : '',
    o.impronta ? o.t('buoni.pdfTesto.impronta', { impronta: o.impronta }) : '',
    firme.nonValide > 0 ? o.t('buoni.pdfTesto.nonValide', { n: firme.nonValide }) : '',
  ]
    .filter(Boolean)
    .join(' ');
  for (let i = range.start; i < range.start + range.count; i += 1) {
    doc.switchToPage(i);
    const bottom = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    const y = PAGE.height - M - 11;
    doc.font('Sans').fontSize(5.8).fillColor(MUTED);
    doc.text(unaRiga(doc, generato, W - 70), M, y, { width: W - 70, lineBreak: false });
    if (stato) doc.text(unaRiga(doc, stato, W - 70), M, y + 7, { width: W - 70, lineBreak: false });
    doc.text(o.t('buoni.pdfTesto.pagina', { n: i + 1, tot: range.count }), M + W - 66, y, {
      width: 66,
      align: 'right',
      lineBreak: false,
    });
    doc.page.margins.bottom = bottom;
  }
}

export function renderBuonoPdf(d: BuonoData, o: BuonoPdfOptions): Promise<Buffer> {
  const fonts = fontsOf(o.fontDir);
  const doc = new PDFDocument({
    ...OPZIONI_PDFA,
    size: 'A4',
    margin: M,
    bufferPages: true,
    info: {
      Title: `${o.t('buoni.titolo')}${d.numero ? ` ${d.numero}` : ''}`,
      Author: o.azienda.name,
      Creator: 'Rilievi Impianti — Carbon Stealth VCC',
    },
  });
  doc.registerFont('Sans', fonts.regular);
  doc.registerFont('Sans-Bold', fonts.bold);
  doc.font('Sans');
  const f = new Foglio(doc, o);
  testata(f, d);
  datiGenerali(f, d);
  sequenze(f, d);
  controlli(f, d);
  resoconto(f, d);
  firmeFinali(f, d);
  chiusura(f);
  const stati = [...o.firme.values()];
  piedi(doc, o, {
    n: stati.filter((s) => s.valida).length,
    nonValide: stati.filter((s) => !s.valida).length,
  });
  const chunks: Buffer[] = [];
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });
  doc.end();
  return done;
}
