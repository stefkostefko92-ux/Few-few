import PDFDocument from 'pdfkit';
import {
  disegnaPiede,
  disegnaTestata,
  fontsOf,
  inBuffer,
  INK,
  M,
  MUTED,
  PAGE,
  W,
} from '../argano/pdf-testata.js';
import type { AziendaCartello } from '../cartelli/pdf.js';
import type { Translator } from '../i18n.js';
import type { SezioneLimitatore } from './righe.js';

/**
 * PDF-ът на изчислението за ограничителя (A4, отделен от картата — като изчислението за аргано): горе
 * логото и данните на фирмата, заглавието, нормата и уредбата, после четирите раздела на листа ред по ред
 * (надпис, стойност с мярка, OK/NO на проверките; под надписа — точката на нормата), накрая обхватът и
 * бележката на листа, долу кога и от кого е записано. DejaVu Sans, вграден.
 */

export interface LimitatorePdfOptions {
  sezioni: SezioneLimitatore[];
  t: Translator;
  impianto: { indirizzo: string; matricola: string; numeroImpianto: string };
  salvato: { quando: string; autore: string };
  testata: AziendaCartello;
  fontDir: string;
}

const COLONNE = { etichetta: W * 0.64, valore: W * 0.23, esito: W * 0.08 };

export function renderCalcoloLimitatore(o: LimitatorePdfOptions): Promise<Buffer> {
  const fonts = fontsOf(o.fontDir);
  const { t } = o;
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
  y = doc.y + 10;

  const nuovaPagina = (altezza: number) => {
    if (y + altezza > PAGE.height - M - 14) {
      doc.addPage();
      y = M;
    }
  };
  for (const sezione of o.sezioni) {
    y += 4;
    nuovaPagina(60);
    doc
      .lineWidth(0.8)
      .strokeColor(INK)
      .moveTo(M, y)
      .lineTo(M + W, y)
      .stroke();
    doc
      .font('Sans-Bold')
      .fontSize(10.5)
      .fillColor(INK)
      .text(sezione.titolo, M, y + 5, { width: W });
    y = doc.y + 4;
    for (const r of sezione.righe) {
      const valore = r.unita ? `${r.valore} ${r.unita}` : r.valore;
      doc.font('Sans').fontSize(8.5);
      const hEtichetta = doc.heightOfString(r.etichetta, { width: COLONNE.etichetta });
      doc.fontSize(7);
      const hNota = r.nota ? doc.heightOfString(r.nota, { width: COLONNE.etichetta }) + 1 : 0;
      doc.font('Sans-Bold').fontSize(8.5);
      const h = Math.max(
        hEtichetta + hNota,
        doc.heightOfString(valore, { width: COLONNE.valore }),
        11,
      );
      nuovaPagina(h);
      doc
        .font('Sans')
        .fontSize(8.5)
        .fillColor(INK)
        .text(r.etichetta, M, y, { width: COLONNE.etichetta });
      if (r.nota)
        doc
          .fontSize(7)
          .fillColor(MUTED)
          .text(r.nota, M, y + hEtichetta + 1, { width: COLONNE.etichetta });
      doc
        .font('Sans-Bold')
        .fontSize(8.5)
        .fillColor(INK)
        .text(valore, M + W * 0.67, y, { width: COLONNE.valore, align: 'right' });
      if (r.ok !== undefined)
        doc.text(r.ok === null ? '—' : r.ok ? 'OK' : 'NO', M + W * 0.92, y, {
          width: COLONNE.esito,
          align: 'right',
        });
      y += h + 2.5;
    }
  }
  y += 4;
  doc.font('Sans').fontSize(7.5).fillColor(MUTED);
  for (const chiave of ['ambito', 'importante'] as const) {
    const testo = t(`limitatore.avvertenze.${chiave}`);
    nuovaPagina(doc.heightOfString(testo, { width: W }) + 4);
    doc.text(testo, M, y, { width: W });
    y = doc.y + 4;
  }

  disegnaPiede(
    doc,
    t('limitatore.salvatoIl', { quando: o.salvato.quando, nome: o.salvato.autore || '—' }),
  );
  return inBuffer(doc);
}
