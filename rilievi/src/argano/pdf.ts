import { readFileSync } from 'node:fs';
import PDFDocument from 'pdfkit';
import type { AziendaCartello } from '../cartelli/pdf.js';
import { pdfFontPaths } from '../schede/pdf.js';
import type { DatiArgano } from './dati.js';
import { numero } from './formato.js';
import type { SezioneRisultati } from './righe.js';
import { nomeFune } from './righe.js';

/**
 * PDF-ът на изчислението за аргано (A4, отделен от картата — собственикът, 31 октомври 2026): горе логото
 * и данните на фирмата, заглавието и уредбата, после входните данни и раздели с резултатите (стойност,
 * мярка, ОК/НЕ) и заключение на всеки, долу кога и от кого е записано. DejaVu Sans, вграден.
 */
const M = 40;
const PAGE = { width: 595.28, height: 841.89 };
const W = PAGE.width - M * 2;
const INK = '#000000';
const MUTED = '#555555';
const LOGO = { width: 170, height: 44 };

type Translate = (key: string, params?: Record<string, string | number>) => string;

export interface CalcoloPdfOptions {
  dati: DatiArgano;
  sezioni: SezioneRisultati[];
  t: Translate;
  impianto: { indirizzo: string; matricola: string; numeroImpianto: string };
  salvato: { quando: string; autore: string };
  testata: AziendaCartello;
  fontDir: string;
}

const fontCache = new Map<string, { regular: Buffer; bold: Buffer }>();

function fontsOf(dir: string): { regular: Buffer; bold: Buffer } {
  let fonts = fontCache.get(dir);
  if (!fonts) {
    const paths = pdfFontPaths(dir);
    fonts = { regular: readFileSync(paths.regular), bold: readFileSync(paths.bold) };
    fontCache.set(dir, fonts);
  }
  return fonts;
}

/** Входните данни като двойки „надпис — стойност“ (мерките са в надписа). */
function datiInRighe(d: DatiArgano, t: Translate): Array<[string, string]> {
  const n = (v: number) => numero(v, v % 1 ? 2 : 0);
  const righe: Array<[string, string]> = [
    [t('argano.campo.portata'), `${n(d.portata)} kg`],
    [t('argano.campo.massaCabina'), `${n(d.massaCabina)} kg`],
    [t('argano.campo.massaContrappeso'), `${n(d.massaContrappeso)} kg`],
    [t('argano.campo.velocita'), `${n(d.velocita)} m/s`],
    [t('argano.campo.corsa'), `${n(d.corsa)} m`],
    [t('argano.campo.sospensione'), t(`argano.opzione.sospensione.${d.sospensione}`)],
    [t('argano.campo.macchina'), t(`argano.opzione.macchina.${d.macchina}`)],
    [t('argano.campo.azionamento'), t(`argano.opzione.azionamento.${d.azionamento}`)],
    d.azionamento === 'VVVF'
      ? [
          t('argano.campo.velocitaVvvf'),
          `${n(d.velocitaVvvf!)} m/s · ${t(`argano.opzione.motoreVvvf.${d.motoreVvvf}`)}`,
        ]
      : [t('argano.campo.giriMotore'), `${n(d.giriMotore!)} rpm`],
    [t('argano.campo.rapporto'), `${d.rapportoA} : ${n(d.rapportoB)}`],
    [t('argano.campo.diametroPuleggia'), `${n(d.diametroPuleggia)} mm`],
    [t('argano.campo.gola'), `${t(`argano.opzione.gola.${d.gola}`)}, ${n(d.angoloGola)}°`],
    [t('argano.campo.angoloAvvolgimento'), `${n(d.angoloAvvolgimento)}°`],
    [
      t('argano.campo.fune'),
      `${d.funiNumero} × ${d.fune === 'altro' ? `${n(d.funeAltro!.d)} mm (${t('argano.opzione.fune.altro')})` : nomeFune(d.fune)}`,
    ],
    [
      t('argano.campo.funiSostituzione'),
      t(d.funiSostituzione ? 'argano.funiNuove' : 'argano.funiVerifica'),
    ],
  ];
  if (d.decelerazioneRidotta) righe.push([t('argano.campo.decelerazioneRidotta'), t('argano.si')]);
  return righe;
}

export function renderCalcoloArgano(o: CalcoloPdfOptions): Promise<Buffer> {
  const fonts = fontsOf(o.fontDir);
  const doc = new PDFDocument({
    size: 'A4',
    margin: M,
    bufferPages: true,
    info: {
      Title: o.t('argano.titolo'),
      Author: o.testata.intestazione.nome,
      Creator: 'Rilievi Impianti — Carbon Stealth VCC',
    },
  });
  doc.registerFont('Sans', fonts.regular);
  doc.registerFont('Sans-Bold', fonts.bold);
  const { t } = o;

  // Логото вляво (без лого — името), данните на фирмата вдясно.
  if (o.testata.logo) doc.image(o.testata.logo, M, M, { fit: [LOGO.width, LOGO.height] });
  else
    doc
      .font('Sans-Bold')
      .fontSize(13)
      .fillColor(INK)
      .text(o.testata.intestazione.nome, M, M, { width: LOGO.width + 40 });
  const destra = { width: W - LOGO.width - 20, align: 'right' } as const;
  doc
    .font('Sans-Bold')
    .fontSize(9)
    .fillColor(INK)
    .text(o.testata.intestazione.nome, M + LOGO.width + 20, M, destra);
  doc.font('Sans').fontSize(7.5).fillColor(MUTED);
  for (const riga of o.testata.intestazione.righe)
    doc.text(riga, M + LOGO.width + 20, doc.y, destra);

  let y = Math.max(M + LOGO.height, doc.y) + 14;
  doc.font('Sans-Bold').fontSize(16).fillColor(INK).text(t('argano.titolo'), M, y, { width: W });
  doc
    .font('Sans')
    .fontSize(8.5)
    .fillColor(MUTED)
    .text(t('argano.normativa'), M, doc.y + 2, { width: W });
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

  const titolo = (testo: string) => {
    if (y > PAGE.height - M - 90) {
      doc.addPage();
      y = M;
    }
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
      .text(testo, M, y + 5, { width: W });
    y = doc.y + 4;
  };
  // Височината на реда е по-високото от надписа и стойността (дългата стойност минава на нов ред).
  const riga = (etichetta: string, valore: string, esito?: boolean) => {
    const larghe = { label: W * 0.58, value: W * 0.28 };
    doc.font('Sans').fontSize(8.5);
    const hLabel = doc.heightOfString(etichetta, { width: larghe.label });
    doc.font('Sans-Bold');
    const h = Math.max(hLabel, doc.heightOfString(valore, { width: larghe.value }), 11);
    if (y + h > PAGE.height - M - 14) {
      doc.addPage();
      y = M;
    }
    doc.font('Sans').fillColor(INK).text(etichetta, M, y, { width: larghe.label });
    doc.font('Sans-Bold').text(valore, M + W * 0.6, y, { width: larghe.value, align: 'right' });
    if (esito !== undefined)
      doc.text(esito ? t('argano.r.ok') : t('argano.r.no'), M + W * 0.89, y, {
        width: W * 0.11,
        align: 'right',
      });
    y += h + 2.5;
  };

  titolo(t('argano.dati'));
  for (const [etichetta, valore] of datiInRighe(o.dati, t)) riga(etichetta, valore);
  for (const sezione of o.sezioni) {
    y += 6;
    titolo(sezione.titolo);
    for (const r of sezione.righe)
      riga(r.etichetta, r.unita ? `${r.valore} ${r.unita}` : r.valore, r.ok);
    doc
      .font('Sans-Bold')
      .fontSize(8.5)
      .fillColor(INK)
      .text(sezione.esito.testo, M, y + 2, { width: W });
    y = doc.y + 4;
  }
  y += 8;
  doc.font('Sans').fontSize(7.5).fillColor(MUTED).text(t('argano.nota'), M, y, { width: W });

  // Под последния ред на всяка страница: кога и от кого, и номерът на страницата.
  const pagine = doc.bufferedPageRange();
  for (let i = 0; i < pagine.count; i++) {
    doc.switchToPage(pagine.start + i);
    // Под долното поле: без това pdfkit отваря нова страница за реда.
    doc.page.margins.bottom = 0;
    const piede = [
      t('argano.salvatoIl', { quando: o.salvato.quando, nome: o.salvato.autore || '—' }),
      `${i + 1} / ${pagine.count}`,
    ];
    doc
      .font('Sans')
      .fontSize(7)
      .fillColor(MUTED)
      .text(piede.join('   ·   '), M, PAGE.height - M + 12, {
        width: W,
        align: 'right',
        lineBreak: false,
      });
  }
  const chunks: Buffer[] = [];
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });
  doc.end();
  return done;
}
