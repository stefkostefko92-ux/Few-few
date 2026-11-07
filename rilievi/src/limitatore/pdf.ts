import PDFDocument from 'pdfkit';
import {
  disegnaPiede,
  disegnaTestata,
  fontsOf,
  inBuffer,
  INK,
  M,
  MUTED,
  W,
} from '../argano/pdf-testata.js';
import type { AziendaCartello } from '../cartelli/pdf.js';
import type { Translator } from '../i18n.js';
import type { SintesiLimitatore } from './righe.js';

/**
 * PDF-ът на изчислението за ограничителя (A4, една страница — като изчислението за аргано, но кратък):
 * горе логото и данните на фирмата, заглавието, нормата и уредбата, после данните (скорост, парашут) и
 * резултатът — същите редове като на страницата, долу кога и от кого е записано. DejaVu Sans, вграден.
 */

export interface LimitatorePdfOptions {
  sintesi: SintesiLimitatore;
  t: Translator;
  impianto: { indirizzo: string; matricola: string; numeroImpianto: string };
  salvato: { quando: string; autore: string };
  testata: AziendaCartello;
  fontDir: string;
}

export function renderCalcoloLimitatore(o: LimitatorePdfOptions): Promise<Buffer> {
  const fonts = fontsOf(o.fontDir);
  const { t, sintesi: s } = o;
  const doc = new PDFDocument({
    size: 'A4',
    margin: M,
    bufferPages: true,
    info: {
      Title: t('limitatore.titolo'),
      Author: o.testata.intestazione.nome,
      Creator: 'Rilievi Impianti — Carbon Stealth VCC',
    },
  });
  doc.registerFont('Sans', fonts.regular);
  doc.registerFont('Sans-Bold', fonts.bold);

  let y = disegnaTestata(doc, o.testata) + 14;
  doc
    .font('Sans-Bold')
    .fontSize(16)
    .fillColor(INK)
    .text(t('limitatore.titolo'), M, y, { width: W });
  doc
    .font('Sans')
    .fontSize(8.5)
    .fillColor(MUTED)
    .text(t('limitatore.normativa'), M, doc.y + 2, { width: W });
  const impianto = [
    o.impianto.indirizzo,
    o.impianto.matricola && `${t('argano.matricola')} ${o.impianto.matricola}`,
    o.impianto.numeroImpianto && `${t('argano.nImpianto')} ${o.impianto.numeroImpianto}`,
  ].filter(Boolean);
  if (impianto.length)
    doc
      .font('Sans-Bold')
      .fontSize(10)
      .fillColor(INK)
      .text(impianto.join('   '), M, doc.y + 6, { width: W });
  y = doc.y + 16;

  /** Ред „надпис — стойност“: стойността удебелена, `grande` — резултатът. */
  const riga = (etichetta: string, valore: string, grande = false) => {
    const size = grande ? 14 : 10;
    doc
      .font('Sans')
      .fontSize(10)
      .fillColor(MUTED)
      .text(etichetta, M, y, { width: W * 0.38 });
    doc
      .font('Sans-Bold')
      .fontSize(size)
      .fillColor(INK)
      .text(valore, M + W * 0.4, y - (grande ? 2 : 0), { width: W * 0.6 });
    y = Math.max(doc.y, y + size) + 10;
  };
  const linea = () => {
    doc
      .lineWidth(0.8)
      .strokeColor(INK)
      .moveTo(M, y)
      .lineTo(M + W, y)
      .stroke();
    y += 10;
  };

  linea();
  riga(t('limitatore.r.vn'), s.vn);
  riga(t('limitatore.r.tipo'), s.tipo);
  linea();
  if (s.v1) {
    riga(t('limitatore.r.v1'), s.v1, true);
    if (s.limite) riga(t('limitatore.r.limite'), s.limite);
    if (s.contatto) riga(t('limitatore.r.contatto'), s.contatto);
  } else if (s.motivo) {
    doc.font('Sans-Bold').fontSize(12).fillColor(INK).text(s.motivo, M, y, { width: W });
  }

  disegnaPiede(
    doc,
    t('limitatore.salvatoIl', { quando: o.salvato.quando, nome: o.salvato.autore || '—' }),
  );
  return inBuffer(doc);
}
