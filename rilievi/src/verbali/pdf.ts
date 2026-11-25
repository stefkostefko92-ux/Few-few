import PDFDocument from 'pdfkit';
import type { ViewHelpers } from '../http/view.js';
import type { Translator } from '../i18n.js';
import { firmaSalvata, FIRMA_H, FIRMA_W, pathFirma, type Firma } from '../interventi/firma.js';
import { inRighe, INK, MUTED, unaRiga } from '../interventi/pdf-parti.js';
import { improntaLeggibile } from '../interventi/sigillo.js';
import {
  altezzaRiga,
  cornice,
  FONDO,
  FONDO_CORNICE,
  fontsVerbale,
  intestazione,
  intestazioneSezione,
  M,
  PAGE,
  PAD,
  riga,
  siNo,
  W,
} from './pdf-parti.js';
import type { VerbaleFull } from './service.js';
import { SEZIONI_VERBALE, valoriVerbale } from './voci.js';
import { OPZIONI_PDFA } from '../legale/pdfa.js';

/**
 * PDF-ът на „Verbale di chiusura cantiere“ — „uguale identico“ на хартиения лист на собственика (5 ноември
 * 2026): две страници A4 в рамка, на всяка логото на фирмата горе в средата. Първата: заглавието,
 * „Indirizzo“ / „N° buono“, „Locale macchina“ и „Vano corsa“. Втората: „Cabina“, „Finiture“, „Verbale
 * positivo SI NO“, подписите над черта (вляво техникът изпълнител, вдясно супервайзърът), „Data:“ долу
 * вляво и „COPIA AZIENDA“ / „COPIA INSTALLATORE“ долу в средата. Дълъг текст прелива на следваща страница
 * („segue“); подписите не се делят. Под рамката, дребно — кога е потвърден и отпечатъкът на подписаното
 * (листът на хартия ги няма; печатът е на портала). Шрифтът — serif като на листа.
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

/** От кой раздел започва втората страница — като на листа. */
const SECONDA_PAGINA = 'cabina';
/** Колко място искат „Verbale positivo“, подписите, датата и копието. */
const CHIUSURA_H = 300;
const FIRMA_BOX = { width: 180, height: 60 };

function nuovoDoc(options: VerbalePdfOptions, azienda: string): PDFKit.PDFDocument {
  const fonts = fontsVerbale(options.fontDir);
  const doc = new PDFDocument({
    // Потвърденият документ е за архива: PDF/A-2b (legale/pdfa.ts).
    ...OPZIONI_PDFA,
    size: 'A4',
    // Без автоматични страници: всичко се реди на ръка; долното поле е за реда под рамката.
    margins: { top: M, left: M, right: M, bottom: 4 },
    info: {
      Title: `${options.t('verbali.titolo')} — ${options.t(`verbali.copia.${options.copia}`)}`,
      Author: azienda,
      Creator: 'Rilievi Impianti — Carbon Stealth VCC',
    },
  });
  doc.registerFont('Serif', fonts.regular);
  doc.registerFont('Serif-Bold', fonts.bold);
  // Без шрифт по подразбиране (PDF/A): вграденият — преди всеки текст.
  doc.font('Serif');
  return doc;
}

/** Подписът над чертата, името под нея. */
function firmaSuRiga(
  doc: PDFKit.PDFDocument,
  label: string,
  nome: string | null,
  firma: Firma | null,
  x: number,
  y: number,
): number {
  doc
    .font('Serif')
    .fontSize(10.5)
    .fillColor(INK)
    .text(label, x, y, { width: FIRMA_BOX.width, align: 'center', lineBreak: false });
  const top = y + 16;
  if (firma) {
    const scale = Math.min(FIRMA_BOX.width / FIRMA_W, FIRMA_BOX.height / FIRMA_H);
    doc
      .save()
      .translate(x + (FIRMA_BOX.width - FIRMA_W * scale) / 2, top)
      .scale(scale)
      .path(pathFirma(firma))
      .lineWidth(4)
      .lineCap('round')
      .lineJoin('round')
      .strokeColor(INK)
      .stroke()
      .restore();
  }
  const linea = top + FIRMA_BOX.height + 4;
  doc
    .save()
    .lineWidth(0.7)
    .strokeColor(INK)
    .moveTo(x, linea)
    .lineTo(x + FIRMA_BOX.width, linea)
    .stroke()
    .restore();
  if (nome) {
    doc.font('Serif').fontSize(8.5).fillColor(INK);
    doc.text(unaRiga(doc, nome, FIRMA_BOX.width), x, linea + 3, {
      width: FIRMA_BOX.width,
      align: 'center',
      lineBreak: false,
    });
  }
  return linea + 14;
}

function disegna(doc: PDFKit.PDFDocument, row: VerbaleFull, options: VerbalePdfOptions): void {
  const { t, fmt } = options;
  // Всяка страница: рамката и логото горе.
  const pagina = (nuova: boolean): number => {
    if (nuova) doc.addPage();
    cornice(doc);
    return intestazione(doc, options.logo, row.azienda.name) + 18;
  };
  let y = pagina(false);

  doc
    .font('Serif-Bold')
    .fontSize(14)
    .fillColor(INK)
    .text(t('verbali.titolo'), M, y, { width: W, align: 'center', lineBreak: false });
  y += 30;

  // „Indirizzo“ — ред през цялата ширина; под него адресът вляво и „N° buono“ вдясно.
  const meta = W / 2;
  const testa = 15;
  const corpo = 32;
  doc.lineWidth(0.7).strokeColor(INK);
  doc.rect(M, y, W, testa + corpo).stroke();
  doc
    .moveTo(M, y + testa)
    .lineTo(M + W, y + testa)
    .stroke();
  doc
    .moveTo(M + meta, y + testa)
    .lineTo(M + meta, y + testa + corpo)
    .stroke();
  doc
    .font('Serif')
    .fontSize(10)
    .fillColor(INK)
    .text(t('verbali.campo.indirizzo'), M + PAD, y + 2.5, { lineBreak: false });
  doc.text(t('verbali.campo.buono'), M + meta + PAD, y + testa + 2.5, { lineBreak: false });
  doc.font('Serif-Bold').fontSize(10);
  doc.text(inRighe(doc, row.indirizzo ?? '', meta - PAD * 2, 2), M + PAD, y + testa + 4, {
    width: meta - PAD * 2,
  });
  doc.text(unaRiga(doc, row.buono ?? '', meta - PAD * 2), M + meta + PAD, y + testa + 16, {
    lineBreak: false,
  });
  y += testa + corpo + 22;

  const voci = valoriVerbale(row.voci);
  for (const sezione of SEZIONI_VERBALE) {
    const titolo = t(`verbali.sezione.${sezione.key}`);
    const prima = altezzaRiga(doc, t, sezione.voci[0]!, voci[sezione.voci[0]!.key]?.t ?? '');
    // „Cabina“ започва втората страница (като на листа); заглавие не остава само в края на страницата.
    if (sezione.key === SECONDA_PAGINA || y + 17 + prima > FONDO) y = pagina(true);
    y = intestazioneSezione(doc, titolo, y);
    for (const voce of sezione.voci) {
      const h = altezzaRiga(doc, t, voce, voci[voce.key]?.t ?? '');
      if (y + h > FONDO) {
        y = pagina(true);
        y = intestazioneSezione(doc, `${titolo} (${t('verbali.segue')})`, y);
      }
      riga(doc, t, voce, voci, y, h);
      y += h;
    }
    y += 26;
  }

  // „Verbale positivo SI NO“, подписите, датата и копието — заедно, на една страница.
  if (y + CHIUSURA_H > FONDO) y = pagina(true);
  y += 12;
  doc.font('Serif-Bold').fontSize(12).fillColor(INK);
  const positivo = t('verbali.positivo');
  const larghezza = doc.widthOfString(positivo) + 40 + 2 * 62;
  const x0 = M + (W - larghezza) / 2;
  doc.text(positivo, x0, y, { lineBreak: false });
  siNo(
    doc,
    { si: t('verbali.carta.siPositivo'), no: t('verbali.carta.noPositivo') },
    x0 + doc.widthOfString(positivo) + 40,
    y,
    row.positivo === null ? null : row.positivo ? 'si' : 'no',
    62,
    12,
    'Serif-Bold',
  );
  y += 40;
  const firme = [
    [t('verbali.firma.tecnico'), row.firmaTecnicoNome, firmaSalvata(row.firmaTecnico)],
    [t('verbali.firma.supervisore'), row.firmaSupervisoreNome, firmaSalvata(row.firmaSupervisore)],
  ] as const;
  firme.forEach(([label, nome, firma], i) => {
    firmaSuRiga(doc, label, nome, firma, i === 0 ? M + 6 : M + W - FIRMA_BOX.width - 6, y);
  });

  // „Data:“ долу вляво и копието долу в средата — като на листа.
  doc
    .font('Serif')
    .fontSize(10.5)
    .fillColor(INK)
    .text(`${t('verbali.campo.data')}: ${fmt.day(row.data)}`, M + 6, FONDO - 62, {
      lineBreak: false,
    });
  doc
    .font('Serif-Bold')
    .fontSize(11)
    .text(t(`verbali.copia.${options.copia}`), M, FONDO - 24, {
      width: W,
      align: 'center',
      lineBreak: false,
    });

  // Под рамката: кога е потвърден и отпечатъкът — по тях се сверява подписаното.
  if (row.confermatoAt) {
    const sotto = [
      t('verbali.confermato', {
        at: fmt.dateTime(row.confermatoAt),
        name: row.confermatoBy?.name ?? '—',
      }),
      row.impronta ? t('verbali.sigillo.pdf', { impronta: improntaLeggibile(row.impronta) }) : '',
    ]
      .filter(Boolean)
      .join(' · ');
    doc.font('Serif').fontSize(5.5).fillColor(MUTED);
    doc.text(inRighe(doc, sotto, PAGE.width - 56, 2), 28, FONDO_CORNICE + 4, {
      width: PAGE.width - 56,
      align: 'center',
    });
  }
}

export function renderVerbalePdf(row: VerbaleFull, options: VerbalePdfOptions): Promise<Buffer> {
  const doc = nuovoDoc(options, row.azienda.name);
  disegna(doc, row, options);
  const chunks: Buffer[] = [];
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });
  doc.end();
  return done;
}
