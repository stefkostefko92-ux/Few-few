import 'server-only';
// What the modules' PDFs share (modulo-pdf.ts — the flat sheets, pdf-form.ts — the forms): opening the official module
// with our font and the place of the text. The font is DejaVu Sans (accents, Cyrillic) — never pdf-lib's built-in
// Helvetica. Ported 1:1 from rilievi (src/ordini/pdf-testo.ts, commit 988f3cf37); only the Producer says «LiftPilot
// Rilievi».
import { readFileSync } from 'node:fs';
import fontkit from '@pdf-lib/fontkit';
import { degrees, PDFDocument, type PDFFont } from 'pdf-lib';
import type { Modulo } from '@/lib/rilievi/ordini/moduli';
import { moduloPdf } from './moduli-pdf';
import { pdfFontPaths } from './pdf';

const MIN_SIZE = 5;

/**
 * The thickness of the mark in a box (the cross and the circle of the flat sheets, the form's tick) — solid on paper too:
 * the owner asked for clearer ticks (21 October 2026; until then 1.1 pt).
 */
export const SEGNO = 1.7;

/**
 * The blank official module (checked by SHA-256) with DejaVu Sans embedded. A scanned sheet upside down (`ruota`, 2SG)
 * comes out upright: a new page of the same size and the sheet on it, turned by 180° — the coordinates in the map are
 * the upright sheet's.
 */
export async function apriModulo(modulo: Modulo, fontDir: string): Promise<{ doc: PDFDocument; font: PDFFont }> {
  const doc = modulo.ruota === 180 ? await raddrizza(moduloPdf(modulo)) : await PDFDocument.load(moduloPdf(modulo));
  doc.registerFontkit(fontkit);
  const font = await doc.embedFont(readFileSync(pdfFontPaths(fontDir).regular), { subset: true });
  doc.setProducer('LiftPilot Rilievi — Carbon Stealth VCC');
  return { doc, font };
}

async function raddrizza(bytes: Uint8Array): Promise<PDFDocument> {
  const doc = await PDFDocument.create();
  const [scan] = await doc.embedPdf(bytes, [0]);
  if (!scan) throw new Error('the module has no page');
  doc.addPage([scan.width, scan.height]).drawPage(scan, { x: scan.width, y: scan.height, rotate: degrees(180) });
  return doc;
}

/** One line: never wrapped — it shrinks down to 5 pt, then it is cut with an ellipsis. */
export function fitLine(font: PDFFont, text: string, width: number, size: number): { text: string; size: number } {
  const wide = font.widthOfTextAtSize(text, size);
  if (wide <= width) return { text, size };
  const smaller = Math.max(MIN_SIZE, Math.floor(((size * width) / wide) * 10) / 10);
  if (font.widthOfTextAtSize(text, smaller) <= width) return { text, size: smaller };
  let cut = text;
  while (cut.length > 1 && font.widthOfTextAtSize(`${cut}…`, smaller) > width) cut = cut.slice(0, -1);
  return { text: `${cut}…`, size: smaller };
}

/** The lines of a paragraph within the width (by words; a long word is cut by characters). */
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

/** The largest type (up to `max`) at which the paragraph fits in so many lines; otherwise 5 pt and whatever fits. */
export function fitRighe(font: PDFFont, text: string, width: number, righe: number, max: number): { lines: string[]; size: number } {
  for (let size = max; size >= MIN_SIZE; size -= 0.5) {
    const lines = wrap(font, text, width, size);
    if (lines.length <= righe) return { lines, size };
  }
  return { lines: wrap(font, text, width, MIN_SIZE).slice(0, righe), size: MIN_SIZE };
}

/** The largest type (up to `max`) at which the paragraph fits the box; otherwise 5 pt and whatever fits. */
export function fitBlock(font: PDFFont, text: string, width: number, height: number, max: number): { lines: string[]; size: number } {
  for (let size = max; size >= MIN_SIZE; size -= 0.5) {
    const lines = wrap(font, text, width, size);
    if (lines.length * size * 1.18 <= height) return { lines, size };
  }
  const lines = wrap(font, text, width, MIN_SIZE);
  return { lines: lines.slice(0, Math.max(1, Math.floor(height / (MIN_SIZE * 1.18)))), size: MIN_SIZE };
}
