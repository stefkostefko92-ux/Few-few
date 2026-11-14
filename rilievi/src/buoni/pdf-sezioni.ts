import { inRighe, INK, MUTED, tickAt, unaRiga } from '../interventi/pdf-parti.js';
import type { BuonoData } from './form.js';
import {
  Foglio,
  giorno,
  M,
  NOTE_MIN,
  RIGA,
  RIGA_CTL,
  RIGA_FIRME,
  RIGA_SEQ,
  W,
} from './pdf-foglio.js';
import { postoControllo, postoFinale, postoRiga } from './posti.js';
import { CONTROLLI, RIGHE_STAMPA } from './voci.js';

/** Разделите на листа в реда им — от главата до клаузата долу (pdf.ts ги вика един след друг). */

export function testata(f: Foglio, d: BuonoData): void {
  const { doc, o } = f;
  const { t } = o;
  if (o.logo) doc.image(o.logo, M, M, { fit: [150, 38] });
  else
    doc
      .font('Sans-Bold')
      .fontSize(11)
      .fillColor(INK)
      .text(unaRiga(doc, o.azienda.name, 150), M, M + 4, { lineBreak: false });
  doc
    .font('Sans-Bold')
    .fontSize(15)
    .fillColor(INK)
    .text(t('buoni.intestazione'), M + 160, M + 4, { width: W - 320, align: 'center' });
  if (d.numero)
    doc
      .font('Sans-Bold')
      .fontSize(9.5)
      .text(unaRiga(doc, `${t('buoni.campo.numero')} ${d.numero}`, W - 320), M + 160, M + 24, {
        width: W - 320,
        align: 'center',
      });
  if (o.azienda.buonoCodice) {
    doc.font('Sans').fontSize(7).fillColor(INK);
    doc.text(inRighe(doc, o.azienda.buonoCodice, 150, 3), M + W - 150, M + 2, {
      width: 150,
      align: 'right',
    });
  }
  f.y = M + 44;
}

export function datiGenerali(f: Foglio, d: BuonoData): void {
  const { o } = f;
  const { t } = o;
  const c = (k: string) => t(`buoni.campo.${k}`);
  f.titolo(t('buoni.sezione.dati'));
  f.cella(M, 95, RIGA, c('dataConferma'), giorno(o, d.dataConferma));
  f.cella(M + 95, 160, RIGA, c('geometra'), d.geometra);
  f.cella(M + 255, 144, RIGA, c('ordine'), d.ordine);
  f.cella(M + 399, W - 399, RIGA, c('offerta'), d.offerta);
  f.y += RIGA;
  f.cella(M, 130, RIGA, c('inizioPrevisto'), giorno(o, d.inizioPrevisto));
  f.cella(M + 130, 130, RIGA, c('finePrevista'), giorno(o, d.finePrevista));
  f.cella(M + 260, W - 260, RIGA, c('matricola'), d.matricola);
  f.y += RIGA;
  f.cella(M, W, RIGA, c('ubicazione'), d.ubicazione);
  f.y += RIGA;
  // P.O.S. SÌ / NO и бележката до него — като на листа.
  f.cella(M, 150, RIGA, c('pos'), null);
  tickAt(f.doc, M + 40, f.y + 8, d.pos === true, 'SI');
  tickAt(f.doc, M + 80, f.y + 8, d.pos === false, 'NO');
  f.rect(M + 150, f.y, W - 150, RIGA);
  f.doc
    .font('Sans-Bold')
    .fontSize(7.5)
    .fillColor(INK)
    .text(t('buoni.posNota'), M + 156, f.y + 7, { width: W - 162, lineBreak: false });
  f.y += RIGA;
  f.cellaTesto(c('note'), d.note, NOTE_MIN, 6);
}

const COL_SEQ = { n: 20, esito: 74, firma: 130, fornitore: 104 };

function intestazioneSequenze(f: Foglio): void {
  const { t } = f.o;
  const x = sequenzeX();
  f.rect(M, f.y, W, 14, true);
  f.doc.font('Sans-Bold').fontSize(6.5).fillColor(INK);
  const head = (testo: string, x0: number, w: number) =>
    f.doc.text(unaRiga(f.doc, testo, w - 4), x0 + 2, f.y + 4, { width: w - 4, lineBreak: false });
  head(t('buoni.riga.numero'), x.n, COL_SEQ.n);
  head(t('buoni.riga.descrizione'), x.descr, x.descrW);
  head(t('buoni.riga.esito'), x.esito, COL_SEQ.esito);
  head(t('buoni.riga.dataFirma'), x.firma, COL_SEQ.firma);
  head(t('buoni.riga.fornitore'), x.fornitore, COL_SEQ.fornitore);
  f.y += 14;
}

function sequenzeX() {
  const descrW = W - COL_SEQ.n - COL_SEQ.esito - COL_SEQ.firma - COL_SEQ.fornitore;
  return {
    n: M,
    descr: M + COL_SEQ.n,
    descrW,
    esito: M + COL_SEQ.n + descrW,
    firma: M + COL_SEQ.n + descrW + COL_SEQ.esito,
    fornitore: M + W - COL_SEQ.fornitore,
  };
}

export function sequenze(f: Foglio, d: BuonoData): void {
  const { doc, o } = f;
  f.titolo(o.t('buoni.sezione.sequenze'));
  intestazioneSequenze(f);
  const x = sequenzeX();
  const righe = Math.max(RIGHE_STAMPA, d.sequenze.length);
  for (let i = 0; i < righe; i += 1) {
    const r = d.sequenze[i];
    doc.font('Sans').fontSize(8);
    const descr = r?.descrizione ? inRighe(doc, r.descrizione, x.descrW - 6, 4) : '';
    const h = Math.max(
      RIGA_SEQ,
      descr ? doc.heightOfString(descr, { width: x.descrW - 6 }) + 8 : 0,
    );
    f.spazio(h, () => intestazioneSequenze(f));
    for (const [x0, w] of [
      [x.n, COL_SEQ.n],
      [x.descr, x.descrW],
      [x.esito, COL_SEQ.esito],
      [x.firma, COL_SEQ.firma],
      [x.fornitore, COL_SEQ.fornitore],
    ] as const)
      f.rect(x0, f.y, w, h);
    doc
      .font('Sans')
      .fontSize(7.5)
      .fillColor(MUTED)
      .text(String(i + 1), x.n, f.y + 4, { width: COL_SEQ.n, align: 'center', lineBreak: false });
    if (r) {
      doc
        .font('Sans')
        .fontSize(8)
        .fillColor(INK)
        .text(descr, x.descr + 3, f.y + 4, { width: x.descrW - 6 });
      f.esito(x.esito + 4, f.y + 6, r.esito);
      const data = giorno(o, r.data);
      if (data)
        doc
          .font('Sans')
          .fontSize(7)
          .fillColor(INK)
          .text(data, x.firma + 3, f.y + 3, { lineBreak: false });
      f.firma(postoRiga(r.id), x.firma + 46, f.y + 2, COL_SEQ.firma - 50, h - 4);
      if (r.fornitore)
        doc
          .font('Sans')
          .fontSize(7.5)
          .fillColor(INK)
          .text(inRighe(doc, r.fornitore, COL_SEQ.fornitore - 6, 3), x.fornitore + 3, f.y + 4, {
            width: COL_SEQ.fornitore - 6,
          });
    }
    f.y += h;
  }
}

const COL_CTL = { esito: 74, data: 80, firma: 130 };

export function controlli(f: Foglio, d: BuonoData): void {
  const { doc, o } = f;
  const { t } = o;
  const nomeW = W - COL_CTL.esito - COL_CTL.data - COL_CTL.firma;
  const xs = { esito: M + nomeW, data: M + nomeW + COL_CTL.esito, firma: M + W - COL_CTL.firma };
  f.titolo(t('buoni.sezione.controlli'));
  f.spazio(14 + RIGA_CTL * 6 + 13);
  f.rect(M, f.y, W, 14, true);
  doc.font('Sans-Bold').fontSize(6.5).fillColor(INK);
  doc.text(t('buoni.controllo.colonna'), M + 3, f.y + 4, { lineBreak: false });
  doc.text(t('buoni.controllo.esito'), xs.esito + 3, f.y + 4, { lineBreak: false });
  doc.text(t('buoni.controllo.data'), xs.data + 3, f.y + 4, { lineBreak: false });
  doc.text(t('buoni.controllo.firma'), xs.firma + 3, f.y + 4, { lineBreak: false });
  f.y += 14;
  let gruppo = 'generale';
  for (const c of CONTROLLI) {
    if (c.gruppo !== gruppo) {
      gruppo = c.gruppo;
      f.rect(M, f.y, W, 13, true);
      doc
        .font('Sans-Bold')
        .fontSize(7)
        .fillColor(INK)
        .text(t('buoni.controllo.gruppoQuadro').toUpperCase(), M + 3, f.y + 3.5, {
          lineBreak: false,
        });
      f.y += 13;
    }
    const v = d.controlli[c.key];
    const h = RIGA_CTL;
    f.rect(M, f.y, nomeW, h);
    f.rect(xs.esito, f.y, COL_CTL.esito, h);
    f.rect(xs.data, f.y, COL_CTL.data, h);
    f.rect(xs.firma, f.y, COL_CTL.firma, h);
    doc
      .font('Sans')
      .fontSize(8)
      .fillColor(INK)
      .text(unaRiga(doc, t(`buoni.controllo.${c.key}`), nomeW - 6), M + 3, f.y + 6, {
        lineBreak: false,
      });
    f.esito(xs.esito + 4, f.y + 7, v.esito);
    const data = giorno(o, v.data);
    if (data)
      doc
        .font('Sans')
        .fontSize(8)
        .text(data, xs.data + 3, f.y + 6, { lineBreak: false });
    f.firma(postoControllo(c.key), xs.firma + 2, f.y + 2, COL_CTL.firma - 4, h - 4);
    f.y += h;
  }
  f.cellaTesto(t('buoni.campo.noteControlli'), d.noteControlli, NOTE_MIN, 6);
}

export function resoconto(f: Foglio, d: BuonoData): void {
  const { o } = f;
  const c = (k: string) => o.t(`buoni.campo.${k}`);
  f.titolo(o.t('buoni.sezione.resoconto'));
  f.spazio(RIGA + NOTE_MIN);
  f.cella(M, 170, RIGA, c('inizioLavori'), giorno(o, d.inizioLavori));
  f.cella(M + 170, 101, RIGA, c('ora'), d.inizioOra);
  f.cella(M + 271, 170, RIGA, c('fineLavori'), giorno(o, d.fineLavori));
  f.cella(M + 441, W - 441, RIGA, c('ora'), d.fineOra);
  f.y += RIGA;
  f.cellaTesto(c('sospensioni'), d.sospensioni, NOTE_MIN, 6);
}

export function firmeFinali(f: Foglio, d: BuonoData): void {
  const { doc, o } = f;
  const { t } = o;
  const h = RIGA_FIRME;
  f.titolo(t('buoni.sezione.firme'));
  f.spazio(h * 2);
  const casella = (x: number, w: number, label: string) => {
    f.rect(x, f.y, w, h);
    doc.font('Sans').fontSize(6.5).fillColor(MUTED);
    doc.text(unaRiga(doc, label, w - 6), x + 3, f.y + 2, { lineBreak: false });
  };
  casella(M, W / 2, t('buoni.finale.custode'));
  f.firma(postoFinale('custode'), M + 4, f.y + 11, W / 2 - 8, h - 14);
  casella(M + W / 2, W / 2, t('buoni.campo.tecnici'));
  if (d.tecnici)
    doc
      .font('Sans')
      .fontSize(9)
      .fillColor(INK)
      .text(inRighe(doc, d.tecnici, W / 2 - 8, 3), M + W / 2 + 4, f.y + 14, { width: W / 2 - 8 });
  f.y += h;
  const terzo = W / 3;
  (['capoTecnico', 'geometra', 'capoOfficina'] as const).forEach((k, i) => {
    casella(M + terzo * i, terzo, t(`buoni.finale.${k}`));
    f.firma(postoFinale(k), M + terzo * i + 4, f.y + 11, terzo - 8, h - 14);
  });
  f.y += h;
}

export function chiusura(f: Foglio): void {
  const { doc, o } = f;
  if (o.azienda.buonoClausola) {
    doc.font('Sans').fontSize(6.5);
    const testo = inRighe(doc, o.azienda.buonoClausola, W, 12);
    const h = doc.heightOfString(testo, { width: W }) + 6;
    f.spazio(h);
    doc.fillColor(INK).text(testo, M, f.y + 4, { width: W });
    f.y += h;
  }
}
