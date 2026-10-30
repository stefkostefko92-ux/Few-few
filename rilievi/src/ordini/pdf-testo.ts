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
  let cut = text;
  while (cut.length > 1 && font.widthOfTextAtSize(`${cut}…`, smaller) > width)
    cut = cut.slice(0, -1);
  return { text: `${cut}…`, size: smaller };
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
      while (font.widthOfTextAtSize(line, size) > width && line.length > 1) {
        let cut = line.length - 1;
        while (cut > 1 && font.widthOfTextAtSize(line.slice(0, cut), size) > width) cut -= 1;
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

/** Най-едрият шрифт (до `max`), при който абзацът влиза в кутията; иначе 5 pt и каквото влезе. */
export function fitBlock(
  font: PDFFont,
  text: string,
  width: number,
  height: number,
  max: number,
): { lines: string[]; size: number } {
  for (let size = max; size >= MIN_SIZE; size -= 0.5) {
    const lines = wrap(font, text, width, size);
    if (lines.length * size * 1.18 <= height) return { lines, size };
  }
  const lines = wrap(font, text, width, MIN_SIZE);
  return {
    lines: lines.slice(0, Math.max(1, Math.floor(height / (MIN_SIZE * 1.18)))),
    size: MIN_SIZE,
  };
}
