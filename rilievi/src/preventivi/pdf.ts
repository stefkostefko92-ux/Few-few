import PDFDocument from 'pdfkit';
import { fontsOf } from '../interventi/pdf.js';
import { inRighe, INK, MUTED, unaRiga } from '../interventi/pdf-parti.js';
import { OPZIONI_PDFA } from '../legale/pdfa.js';
import { dateFromDay } from '../time.js';
import { validaFino } from './dati.js';
import type { PreventivoData } from './form.js';
import {
  accettazione,
  M,
  PAGE,
  Pagina,
  tabella,
  totali,
  W,
  type Doc,
  type PreventivoPdfOptions,
} from './pdf-parti.js';
import { VERSIONE_SOFTWARE } from '../versione.js';

export type { PreventivoPdfOptions } from './pdf-parti.js';

/**
 * PDF-ът на офертата — A4 като писмо: горе вляво логото на фирмата (без лого — името), вдясно данните ѝ от
 * настройките; заглавието с номера, деня и до кога важи; „Spett.le“ — клиентът; предметът и уредбата;
 * таблицата на редовете, обобщението по ставки на ДДС, бележките, условията и „Per accettazione“. Долу на
 * всяка страница — номерът на офертата, „Generato con…“ и „Pagina n di N“. PDF/A-2b, DejaVu Sans вграден.
 */

function testata(p: Pagina, d: PreventivoData): void {
  const { doc, o } = p;
  const { t, fmt } = o;
  if (o.logo) doc.image(o.logo, M, M, { fit: [170, 46] });
  else
    doc
      .font('Sans-Bold')
      .fontSize(12)
      .fillColor(INK)
      .text(unaRiga(doc, o.intestazione.nome, 200), M, M + 6, { lineBreak: false });
  // Вдясно — данните на фирмата; името — само ако вляво е логото (иначе то е вляво).
  const xDati = M + W - 250;
  let yDati = M;
  if (o.logo) {
    doc.font('Sans-Bold').fontSize(8.5).fillColor(INK);
    doc.text(unaRiga(doc, o.intestazione.nome, 250), xDati, yDati, {
      width: 250,
      align: 'right',
      lineBreak: false,
    });
    yDati += 12;
  } else yDati += 4;
  doc.font('Sans').fontSize(7).fillColor(MUTED);
  o.intestazione.righe.forEach((riga, i) => {
    doc.text(unaRiga(doc, riga, 250), xDati, yDati + i * 9, {
      width: 250,
      align: 'right',
      lineBreak: false,
    });
  });
  p.y = M + 62;
  doc.font('Sans-Bold').fontSize(16).fillColor(INK);
  doc.text(t('preventivi.pdf.titolo', { numero: o.numero }), M, p.y, { lineBreak: false });
  doc.font('Sans').fontSize(8.5).fillColor(INK);
  doc.text(
    t('preventivi.pdf.del', {
      data: fmt.day(dateFromDay(d.data)),
      fino: fmt.day(dateFromDay(validaFino(d.data, d.validitaGiorni))),
    }),
    M,
    p.y + 21,
    { lineBreak: false },
  );
  // „Spett.le“ — клиентът, вдясно като в писмо.
  const xc = M + W - 250;
  let yc = p.y;
  doc
    .font('Sans')
    .fontSize(7)
    .fillColor(MUTED)
    .text(t('preventivi.pdf.spettabile'), xc, yc, { lineBreak: false });
  yc += 10;
  doc.font('Sans-Bold').fontSize(9.5).fillColor(INK);
  const cliente = inRighe(doc, d.cliente, 250, 2);
  doc.text(cliente, xc, yc, { width: 250 });
  yc += doc.heightOfString(cliente, { width: 250 }) + 1;
  doc.font('Sans').fontSize(8).fillColor(INK);
  for (const riga of [
    d.clienteIndirizzo,
    d.clientePiva ? t('preventivi.pdf.piva', { piva: d.clientePiva }) : null,
    d.clienteEmail,
  ]) {
    if (!riga) continue;
    const testo = inRighe(doc, riga, 250, 2);
    doc.text(testo, xc, yc, { width: 250 });
    yc += doc.heightOfString(testo, { width: 250 });
  }
  p.y = Math.max(p.y + 44, yc + 12);
  doc.font('Sans-Bold').fontSize(9).fillColor(INK);
  const oggetto = inRighe(doc, `${t('preventivi.pdf.oggetto')} ${d.oggetto}`, W, 3);
  doc.text(oggetto, M, p.y, { width: W });
  p.y += doc.heightOfString(oggetto, { width: W }) + 3;
  if (d.impianto) {
    doc.font('Sans').fontSize(8.5);
    const impianto = inRighe(doc, `${t('preventivi.pdf.impianto')} ${d.impianto}`, W, 2);
    doc.text(impianto, M, p.y, { width: W });
    p.y += doc.heightOfString(impianto, { width: W }) + 3;
  }
  p.y += 8;
}

function piedi(doc: Doc, o: PreventivoPdfOptions): void {
  const range = doc.bufferedPageRange();
  const sinistra = o.t('preventivi.pdf.piede', {
    versione: VERSIONE_SOFTWARE,
    numero: o.numero,
    data: o.fmt.dateTime(o.generatoIl),
  });
  for (let i = range.start; i < range.start + range.count; i += 1) {
    doc.switchToPage(i);
    const bottom = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    const y = PAGE.height - M - 8;
    doc.font('Sans').fontSize(6).fillColor(MUTED);
    doc.text(unaRiga(doc, sinistra, W - 80), M, y, { width: W - 80, lineBreak: false });
    doc.text(o.t('preventivi.pdf.pagina', { n: i + 1, tot: range.count }), M + W - 76, y, {
      width: 76,
      align: 'right',
      lineBreak: false,
    });
    doc.page.margins.bottom = bottom;
  }
}

export function renderPreventivoPdf(d: PreventivoData, o: PreventivoPdfOptions): Promise<Buffer> {
  const fonts = fontsOf(o.fontDir);
  const doc = new PDFDocument({
    ...OPZIONI_PDFA,
    size: 'A4',
    margin: M,
    bufferPages: true,
    info: {
      Title: o.t('preventivi.pdf.titolo', { numero: o.numero }),
      Author: o.intestazione.nome,
      Creator: 'Rilievi Impianti — Carbon Stealth VCC',
    },
  });
  doc.registerFont('Sans', fonts.regular);
  doc.registerFont('Sans-Bold', fonts.bold);
  doc.font('Sans');
  const p = new Pagina(doc, o);
  testata(p, d);
  tabella(p, d);
  totali(p, d);
  if (d.note) p.blocco(o.t('preventivi.campo.note'), d.note);
  if (d.condizioni) p.blocco(o.t('preventivi.campo.condizioni'), d.condizioni);
  accettazione(p);
  piedi(doc, o);
  const chunks: Buffer[] = [];
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });
  doc.end();
  return done;
}
