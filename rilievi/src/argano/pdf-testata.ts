import { readFileSync } from 'node:fs';
import type { AziendaCartello } from '../cartelli/pdf.js';
import type { Translator } from '../i18n.js';
import { pdfFontPaths } from '../schede/pdf.js';

/**
 * Общото на PDF-ите на изчисленията (аргано, ограничител и всяко следващо): A4 с поле 40 pt, DejaVu Sans
 * (четен веднъж за процеса), горе логото вляво (без лого — името) и данните на фирмата вдясно; в края —
 * предупреждението и полето за проверка и подпис от правоспособен техник (`disegnaAvvertenza`); долу на
 * ВСЯКА страница — с кой софтуер, от кого и кога е генериран листът, кога и от кого е записано
 * изчислението и номерът на страницата (`disegnaPiede`). Собственикът, 10 ноември 2026 — „Su ogni foglio
 * dobbiamo scrivere che è stato generato dal nostro software … deve essere comunque controllato e firmato
 * da persona istruita e da chi è stato generato“; тестът `calcoli-avvertenza` пази, че всеки PDF с
 * `disegnaTestata` ги има.
 */
export const M = 40;
export const PAGE = { width: 595.28, height: 841.89 };
export const W = PAGE.width - M * 2;
export const INK = '#000000';
export const MUTED = '#555555';
const LOGO = { width: 170, height: 44 };

const fontCache = new Map<string, { regular: Buffer; bold: Buffer }>();

export function fontsOf(dir: string): { regular: Buffer; bold: Buffer } {
  let fonts = fontCache.get(dir);
  if (!fonts) {
    const paths = pdfFontPaths(dir);
    fonts = { regular: readFileSync(paths.regular), bold: readFileSync(paths.bold) };
    fontCache.set(dir, fonts);
  }
  return fonts;
}

/** Логото и данните на фирмата; връща y под тях. */
export function disegnaTestata(doc: PDFKit.PDFDocument, testata: AziendaCartello): number {
  if (testata.logo) doc.image(testata.logo, M, M, { fit: [LOGO.width, LOGO.height] });
  else
    doc
      .font('Sans-Bold')
      .fontSize(13)
      .fillColor(INK)
      .text(testata.intestazione.nome, M, M, { width: LOGO.width + 40 });
  const destra = { width: W - LOGO.width - 20, align: 'right' } as const;
  doc
    .font('Sans-Bold')
    .fontSize(9)
    .fillColor(INK)
    .text(testata.intestazione.nome, M + LOGO.width + 20, M, destra);
  doc.font('Sans').fontSize(7.5).fillColor(MUTED);
  for (const riga of testata.intestazione.righe) doc.text(riga, M + LOGO.width + 20, doc.y, destra);
  return Math.max(M + LOGO.height, doc.y);
}

/**
 * Кой генерира листа и кога (сега — който тегли PDF-а), с кой build и с какъв Rif. (src/build.ts), и кога и
 * от кого е записано изчислението.
 */
export interface Paternita {
  generato: { quando: string; autore: string; build: string; impronta: string };
  salvato: { quando: string; autore: string };
}

/** Долният край на съдържанието: под него са само трите реда на `disegnaPiede`. */
export const FONDO = PAGE.height - M - 6;

/**
 * Един ред, който се събира в `width`: шрифтът пада от 6,8 до 5,6 pt, чак тогава краят става „…“ (двоично —
 * PDF-ът се рисува в единствената нишка на портала).
 */
function rigaPiede(doc: PDFKit.PDFDocument, testo: string, x: number, y: number, width: number) {
  let size = 6.8;
  doc.font('Sans').fontSize(size);
  while (size > 5.6 && doc.widthOfString(testo) > width) doc.fontSize((size -= 0.2));
  let riga = testo;
  if (doc.widthOfString(riga) > width) {
    let [lo, hi] = [0, testo.length];
    while (lo < hi) {
      const mid = Math.ceil((lo + hi) / 2);
      if (doc.widthOfString(`${testo.slice(0, mid)}…`) <= width) lo = mid;
      else hi = mid - 1;
    }
    riga = `${testo.slice(0, lo)}…`;
  }
  doc.text(riga, x, y, { width, lineBreak: false });
}

/**
 * Под долното поле на всяка страница, на три реда: с кой софтуер, от кого и кога е генериран листът; че
 * трябва да се провери и подпише от правоспособен техник; кога и от кого е записано изчислението и
 * номерът на страницата.
 */
export function disegnaPiede(doc: PDFKit.PDFDocument, t: Translator, p: Paternita): void {
  const pagine = doc.bufferedPageRange();
  const generato = t('calcoli.piede.generato', {
    nome: p.generato.autore || '—',
    quando: p.generato.quando,
    build: p.generato.build,
    impronta: p.generato.impronta,
  });
  const salvato = t('calcoli.piede.salvato', {
    nome: p.salvato.autore || '—',
    quando: p.salvato.quando,
  });
  for (let i = 0; i < pagine.count; i++) {
    doc.switchToPage(pagine.start + i);
    // Под долното поле: без това pdfkit отваря нова страница за реда.
    doc.page.margins.bottom = 0;
    const y = PAGE.height - M + 4;
    doc.fillColor(MUTED);
    rigaPiede(doc, generato, M, y, W);
    rigaPiede(doc, t('calcoli.piede.verifica'), M, y + 9, W);
    rigaPiede(doc, salvato, M, y + 18, W * 0.82);
    doc.font('Sans').fontSize(6.8);
    doc.text(`${i + 1} / ${pagine.count}`, M + W * 0.82, y + 18, {
      width: W * 0.18,
      align: 'right',
      lineBreak: false,
    });
  }
}

/**
 * Предупреждението и полето за проверка и подпис от правоспособен техник — в края на изчислението, цели
 * на една страница (иначе — на нова). Връща y под тях.
 */
export function disegnaAvvertenza(doc: PDFKit.PDFDocument, t: Translator, yStart: number): number {
  const pad = 9;
  const larghezza = W - pad * 2;
  const testo = t('calcoli.avvertenza.testo');
  doc.font('Sans').fontSize(7.6);
  const hTesto = doc.heightOfString(testo, { width: larghezza, lineGap: 1 });
  const campi = ['nome', 'qualifica', 'data', 'firma'] as const;
  const hCampo = 38;
  const altezza = pad + 13 + hTesto + 10 + 12 + 16 + hCampo * 2 + pad;
  let y = yStart;
  if (y + altezza > FONDO) {
    doc.addPage();
    y = M;
  }
  doc.lineWidth(0.9).strokeColor(INK).rect(M, y, W, altezza).stroke();
  let yy = y + pad;
  doc
    .font('Sans-Bold')
    .fontSize(9)
    .fillColor(INK)
    .text(t('calcoli.avvertenza.titolo'), M + pad, yy, { width: larghezza });
  yy += 13;
  doc
    .font('Sans')
    .fontSize(7.6)
    .fillColor(INK)
    .text(testo, M + pad, yy, { width: larghezza, lineGap: 1 });
  yy += hTesto + 10;
  doc
    .font('Sans-Bold')
    .fontSize(8)
    .text(t('calcoli.verifica.titolo'), M + pad, yy, { width: larghezza });
  yy += 12;
  // „Dati di ingresso verificati“: квадратче за отметка на ръка, преди полетата.
  doc
    .lineWidth(0.6)
    .strokeColor(INK)
    .rect(M + pad, yy, 8, 8)
    .stroke();
  doc
    .font('Sans')
    .fontSize(7.6)
    .fillColor(INK)
    .text(t('calcoli.verifica.dati'), M + pad + 13, yy, { width: larghezza - 13 });
  yy += 16;
  const colonna = (larghezza - 16) / 2;
  campi.forEach((campo, i) => {
    const x = M + pad + (i % 2) * (colonna + 16);
    const top = yy + Math.floor(i / 2) * hCampo;
    doc
      .font('Sans')
      .fontSize(6.8)
      .fillColor(MUTED)
      .text(t(`calcoli.verifica.${campo}`), x, top, { width: colonna });
    doc
      .lineWidth(0.6)
      .strokeColor(INK)
      .moveTo(x, top + hCampo - 6)
      .lineTo(x + colonna, top + hCampo - 6)
      .stroke();
  });
  return y + altezza;
}

/** Документът като байтове, след `end()`. */
export function inBuffer(doc: PDFKit.PDFDocument): Promise<Buffer> {
  const chunks: Buffer[] = [];
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });
  doc.end();
  return done;
}
