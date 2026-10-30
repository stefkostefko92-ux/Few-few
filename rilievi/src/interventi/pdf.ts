import PDFDocument from 'pdfkit';
import type { ViewHelpers } from '../http/view.js';
import type { Translator } from '../i18n.js';
import { pdfFontPaths } from '../schede/pdf.js';
import { firmaSalvata } from './firma.js';
import {
  dotted,
  drawColonna,
  drawFirma,
  FS,
  INK,
  inRighe,
  MUTED,
  tickAt,
  unaRiga,
} from './pdf-parti.js';
import { numeroModulo, type InterventoFull } from './service.js';
import { GRUPPI_VOCI, valoriVoci } from './voci.js';

/**
 * PDF-ът на листа за интервенция — една страница A4 като хартиения блок (собственикът, 30 октомври
 * 2026): горе логото на фирмата и номерът, главата в рамка, двете колони с точките и кръстчетата,
 * „Altro“, пробите и часовете, долу подписите на техника (вляво) и на клиента (вдясно). DejaVu Sans,
 * вграден — като PDF-а на картата.
 */
const PAGE = { width: 595.28, height: 841.89 };
const M = 26;
const W = PAGE.width - M * 2;
const LOGO = { width: 170, height: 40 };

export interface InterventoPdfOptions {
  t: Translator;
  fmt: ViewHelpers;
  fontDir: string;
  logo: Buffer | null;
}

/**
 * Размерът на точките, с който листът се побира на страницата: обичайният, а при много попълнени редове
 * — по-малък на стъпки (листът е винаги една страница, като хартиения).
 */
const SIZES = [FS, 6.6, 6.2, 5.8, 5.4];

function sizeFor(row: InterventoFull, options: InterventoPdfOptions): number {
  return SIZES.find((fs) => fineFoglio(row, options, fs) <= FONDO_PAGINA) ?? SIZES.at(-1)!;
}

export function renderInterventoPdf(
  row: InterventoFull,
  options: InterventoPdfOptions,
): Promise<Buffer> {
  const fs = sizeFor(row, options);
  const doc = nuovoDoc(row, options);
  const chunks: Buffer[] = [];
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });
  disegnaFoglio(doc, row, options, fs);
  doc.end();
  return done;
}

/** Докъде стига листът по вертикала (за теста: и най-пълният лист е на една страница). */
export function fineFoglio(
  row: InterventoFull,
  options: InterventoPdfOptions,
  fs: number = sizeFor(row, options),
): number {
  const doc = nuovoDoc(row, options);
  const end = disegnaFoglio(doc, row, options, fs);
  doc.end();
  return end;
}

/** Долната граница на съдържанието на страницата. */
export const FONDO_PAGINA = PAGE.height - M;

function nuovoDoc(row: InterventoFull, options: InterventoPdfOptions): PDFKit.PDFDocument {
  const fonts = pdfFontPaths(options.fontDir);
  const doc = new PDFDocument({
    size: 'A4',
    margin: M,
    info: {
      Title: `${options.t('interventi.titolo')} n. ${numeroModulo(row.numero)}`,
      Author: row.azienda.name,
      Creator: 'Rilievi Impianti — Carbon Stealth VCC',
    },
  });
  doc.registerFont('Sans', fonts.regular);
  doc.registerFont('Sans-Bold', fonts.bold);
  return doc;
}

/** Целият лист; връща долния край на нарисуваното. */
function disegnaFoglio(
  doc: PDFKit.PDFDocument,
  row: InterventoFull,
  options: InterventoPdfOptions,
  fs: number,
): number {
  const { t, fmt } = options;
  // Логото (без лого — името на фирмата) и вдясно заглавието с номера.
  if (options.logo) {
    doc.image(options.logo, M, M, { fit: [LOGO.width, LOGO.height] });
  } else {
    doc
      .font('Sans-Bold')
      .fontSize(13)
      .fillColor(INK)
      .text(row.azienda.name, M, M, {
        width: LOGO.width + 60,
        height: LOGO.height,
        ellipsis: true,
      });
  }
  const right = { width: 300, align: 'right' } as const;
  doc
    .font('Sans-Bold')
    .fontSize(12)
    .fillColor(INK)
    .text(t('interventi.servizio'), M + W - 300, M, right);
  doc
    .font('Sans')
    .fontSize(9)
    .text(t('interventi.titolo'), M + W - 300, doc.y, right);
  doc
    .font('Sans-Bold')
    .fontSize(14)
    .text(`n. ${numeroModulo(row.numero)}`, M + W - 300, doc.y, right);

  // Главата: датата и частта от деня, адресът и градът вляво; техниците вдясно.
  let y = Math.max(M + LOGO.height, doc.y) + 8;
  const leftW = W * 0.6;
  const head = 46;
  doc.lineWidth(0.8).strokeColor(INK).rect(M, y, W, head).stroke();
  doc
    .moveTo(M + leftW, y)
    .lineTo(M + leftW, y + head)
    .stroke();
  // Един ред за всяко поле: по-дългото се съкращава с „…“, не стъпва върху следващото.
  const line = (label: string, value: string, top: number, width: number) => {
    doc.font('Sans').fontSize(8).fillColor(MUTED);
    const prefix = `${label} `;
    const prefixW = doc.widthOfString(prefix);
    doc.text(prefix, M + 6, top, { lineBreak: false });
    doc.font('Sans-Bold').fillColor(INK);
    doc.text(unaRiga(doc, value || '—', width - prefixW), M + 6 + prefixW, top, {
      lineBreak: false,
    });
  };
  line(t('interventi.campo.data'), fmt.day(row.data), y + 5, 150);
  tickAt(doc, M + 160, y + 5.5, row.turno === 'MATTINA', t('interventi.turno.MATTINA'));
  tickAt(doc, M + 220, y + 5.5, row.turno === 'POMERIGGIO', t('interventi.turno.POMERIGGIO'));
  line(t('interventi.campo.indirizzo'), row.indirizzo ?? '', y + 18, leftW - 12);
  line(t('interventi.campo.citta'), row.citta ?? '', y + 31, leftW - 12);
  doc
    .font('Sans')
    .fontSize(8)
    .fillColor(MUTED)
    .text(t('interventi.campo.tecnici'), M + leftW + 6, y + 5);
  doc.font('Sans-Bold').fillColor(INK);
  doc.text(inRighe(doc, row.tecnici ?? '—', W - leftW - 12, 2), M + leftW + 6, y + 15, {
    width: W - leftW - 12,
  });
  y += head + 5;

  // „Dopo la verifica … matricola n. X“ вляво, „Sono state eseguite …“ вдясно — всяко на един ред.
  doc.font('Sans').fontSize(8).fillColor(INK);
  const eseguite = t('interventi.eseguite');
  const eseguiteW = doc.widthOfString(eseguite);
  const prima = `${t('interventi.campo.matricolaPdf')} `;
  const primaW = doc.widthOfString(prima);
  doc.text(prima, M, y, { lineBreak: false });
  doc.font('Sans-Bold');
  doc.text(unaRiga(doc, row.matricola ?? '—', W - eseguiteW - primaW - 12), M + primaW, y, {
    lineBreak: false,
  });
  doc.font('Sans').text(eseguite, M + W - eseguiteW, y, { lineBreak: false });
  y += 13;

  // Двете колони като на блока: табло, кабина, врати вляво; шахта, машинно отделение вдясно.
  const voci = valoriVoci(row.voci);
  const colW = W / 2;
  const leftEnd = drawColonna(doc, GRUPPI_VOCI.slice(0, 3), voci, M, y, colW, fs);
  const rightEnd = drawColonna(doc, GRUPPI_VOCI.slice(3), voci, M + colW, y, colW, fs);
  y = Math.max(leftEnd, rightEnd) + 6;

  // „Altro“ — кутийката и текстът върху два пунктирни реда.
  tickAt(doc, M, y + 0.5, Boolean(row.altro), t('interventi.campo.altro'));
  doc
    .font('Sans')
    .fontSize(8)
    .fillColor(INK)
    .text(row.altro ?? '', M + 50, y, { width: W - 50, height: 20, ellipsis: true });
  for (let i = 1; i <= 2; i += 1) dotted(doc, M + 50, M + W, y + i * 10.5);
  y += 27;

  tickAt(doc, M, y + 0.5, row.prove, t('interventi.campo.prove'));
  const ore = (value: { toString(): string } | null) => fmt.num(value) || '—';
  doc
    .font('Sans')
    .fontSize(8)
    .fillColor(INK)
    .text(
      t('interventi.oreRiga', { tecnico: ore(row.oreTecnico), totale: ore(row.oreTotali) }),
      M + 210,
      y,
      { lineBreak: false },
    );
  y += 15;

  // Подписите: техникът вляво, клиентът вдясно; под тях — кога е потвърден листът.
  const firmaW = (W - 24) / 2;
  const firme = [
    [t('interventi.firma.tecnico'), row.firmaTecnicoNome, firmaSalvata(row.firmaTecnico)],
    [t('interventi.firma.cliente'), row.firmaClienteNome, firmaSalvata(row.firmaCliente)],
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
        t('interventi.confermato', {
          at: fmt.dateTime(row.confermatoAt),
          name: row.confermatoBy?.name ?? '—',
        }),
        M,
        y + 5,
        { width: W, align: 'center', lineBreak: false },
      );
    y += 14;
  }
  return y;
}
