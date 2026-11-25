import { readFileSync } from 'node:fs';
import fontkit from '@pdf-lib/fontkit';
import { PDFDocument, type PDFFont } from 'pdf-lib';
import { pdfFontPaths } from '../schede/pdf.js';
import { moduloPdf, type Modulo } from './moduli.js';

/**
 * Общото на PDF-ите на модулите (pdf.ts — плоските листове, pdf-form.ts — формулярите):
 * отварянето на официалния модул с нашия шрифт и мястото на текста. Шрифтът е DejaVu Sans (кирилица,
 * ударения) — никога вграденият Helvetica на pdf-lib.
 */

const MIN_SIZE = 5;

/**
 * Дебелината на знака в кутийка (кръстчето и кръгчето на плоските листове, отметката на формуляра) —
 * плътен и на хартия: собственикът поиска по-ясни отметки (21 октомври 2026; дотогава 1,1 pt).
 */
export const SEGNO = 1.7;

/** Официалният празен модул (проверен по SHA-256) с вграден DejaVu Sans. */
export async function apriModulo(
  modulo: Modulo,
  fontDir: string,
): Promise<{ doc: PDFDocument; font: PDFFont }> {
  const doc = await PDFDocument.load(moduloPdf(modulo));
  doc.registerFontkit(fontkit);
  const font = await doc.embedFont(readFileSync(pdfFontPaths(fontDir).regular), { subset: true });
  doc.setProducer('Rilievi Impianti — Carbon Stealth VCC');
  return { doc, font };
}

const larghezze = new WeakMap<PDFFont, Map<string, number>>();

/** Ширината на един знак при 1 pt — помнена: мери се веднъж за шрифта. */
function larghezzaSegno(font: PDFFont, segno: string): number {
  let known = larghezze.get(font);
  if (!known) larghezze.set(font, (known = new Map()));
  let w = known.get(segno);
  if (w === undefined) known.set(segno, (w = font.widthOfTextAtSize(segno, 1)));
  return w;
}

/**
 * Горна граница колко знака от началото могат да влязат: сборът на ширините им един по един стига
 * двойната ширина (лигатурите стесняват думата, но не наполовина). Мерене на целия низ оформя всеки
 * знак (fontkit) — така се мерят само низове от около два реда, не 600 знака на всяка стъпка.
 */
function tettoSegni(font: PDFFont, text: string, size: number, width: number): number {
  let sum = 0;
  for (let i = 0; i < text.length; i += 1) {
    sum += larghezzaSegno(font, text[i]!) * size;
    if (sum > width * 2) return i;
  }
  return text.length;
}

/**
 * Колко знака от началото на `text` (поне 1, най-много `max`), заедно с `dopo`, влизат в ширината —
 * двоично търсене. PDF-ът се рисува в единствената нишка на портала, а `widthOfTextAtSize` оформя целия
 * низ при всяко мерене: дума от 600 знака, рязана знак по знак, държеше портала ~20 s (одит, 4 ноември
 * 2026). Ширината на началото расте със знаците, затова мястото е същото като при рязането знак по знак.
 */
function segniCheEntrano(
  font: PDFFont,
  text: string,
  max: number,
  size: number,
  width: number,
  dopo = '',
): number {
  let low = 1;
  let high = Math.max(1, Math.min(max, tettoSegni(font, text, size, width)));
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if (font.widthOfTextAtSize(`${text.slice(0, mid)}${dopo}`, size) <= width) low = mid;
    else high = mid - 1;
  }
  return low;
}

/** Един ред: никога не се пренася — смалява се до 5 pt, после се реже с многоточие. */
export function fitLine(
  font: PDFFont,
  text: string,
  width: number,
  size: number,
): { text: string; size: number } {
  const wide = font.widthOfTextAtSize(text, size);
  if (wide <= width) return { text, size };
  const smaller = Math.max(MIN_SIZE, Math.floor(((size * width) / wide) * 10) / 10);
  if (font.widthOfTextAtSize(text, smaller) <= width) return { text, size: smaller };
  const cut = segniCheEntrano(font, text, text.length - 1, smaller, width, '…');
  return { text: `${text.slice(0, cut)}…`, size: smaller };
}

/** Низът влиза ли в ширината — дългият се познава без мерене (горната граница е под дължината му). */
function entra(font: PDFFont, text: string, size: number, width: number): boolean {
  return (
    tettoSegni(font, text, size, width) >= text.length &&
    font.widthOfTextAtSize(text, size) <= width
  );
}

/** Редовете на абзац в ширината (по думи; дълга дума се реже по знаци). */
export function wrap(font: PDFFont, text: string, width: number, size: number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split('\n')) {
    let line = '';
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const next = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(next, size) <= width) {
        line = next;
        continue;
      }
      if (line) lines.push(line);
      line = word;
      while (line.length > 1 && !entra(font, line, size, width)) {
        const cut = segniCheEntrano(font, line, line.length - 1, size, width);
        lines.push(line.slice(0, cut));
        line = line.slice(cut);
      }
    }
    lines.push(line);
  }
  return lines;
}

/** Най-едрият шрифт (до `max`), при който абзацът влиза в толкова реда; иначе 5 pt и каквото влезе. */
export function fitRighe(
  font: PDFFont,
  text: string,
  width: number,
  righe: number,
  max: number,
): { lines: string[]; size: number } {
  for (let size = max; size >= MIN_SIZE; size -= 0.5) {
    const lines = wrap(font, text, width, size);
    if (lines.length <= righe) return { lines, size };
  }
  return { lines: wrap(font, text, width, MIN_SIZE).slice(0, righe), size: MIN_SIZE };
}

/** Височината на `righe` реда при стъпка 1,18 от размера — така ги рисуваме сами на плоските листове. */
const altoRighe = (righe: number, size: number): number => righe * size * 1.18;

/**
 * Най-едрият шрифт (до `max`), при който абзацът влиза в кутията; иначе 5 pt и каквото влезе — тогава
 * последният ред свършва с „…“, за да се вижда, че има още. `alto` е височината на толкова реда при този
 * размер: друг я подава, когато редовете не ги реди нашият код (полето на формуляр — pdf-form-testo.ts).
 */
export function fitBlock(
  font: PDFFont,
  text: string,
  width: number,
  height: number,
  max: number,
  alto: (righe: number, size: number) => number = altoRighe,
): { lines: string[]; size: number } {
  for (let size = max; size >= MIN_SIZE; size -= 0.5) {
    const lines = wrap(font, text, width, size);
    if (alto(lines.length, size) <= height) return { lines, size };
  }
  const lines = wrap(font, text, width, MIN_SIZE);
  let righe = lines.length;
  while (righe > 1 && alto(righe, MIN_SIZE) > height) righe -= 1;
  if (righe === lines.length) return { lines, size: MIN_SIZE };
  const ultima = lines[righe - 1]!;
  const intera = font.widthOfTextAtSize(`${ultima}…`, MIN_SIZE) <= width;
  const cut = intera
    ? ultima.length
    : segniCheEntrano(font, ultima, ultima.length - 1, MIN_SIZE, width, '…');
  return { lines: [...lines.slice(0, righe - 1), `${ultima.slice(0, cut)}…`], size: MIN_SIZE };
}
