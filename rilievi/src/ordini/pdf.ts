import { rgb, type PDFPage } from 'pdf-lib';
import { fieldsOf, type Modulo, type ModuloOverlay } from './moduli.js';
import { renderAcroform } from './pdf-form.js';
import { apriModulo, fitBlock, fitLine, fitRighe } from './pdf-testo.js';
import type { Valori } from './valori.js';

/**
 * PDF-ът на модул: самият официален модул с нашите стойности — нищо друго не се пипа. Плоските листове
 * (Pelazza, листът с данни за аргано, 2SG): кръстчета в кутийките и текст върху редовете, по
 * координатите от картата — тук. MoviLift (формуляр) — pdf-form.ts; общото (шрифтът, мястото на
 * текста, изправянето на обърнатия лист) — pdf-testo.ts.
 */

const INK = rgb(0, 0, 0);

function cross(page: PDFPage, box: readonly [number, number, number, number]): void {
  const height = page.getHeight();
  const [x0, top, x1, bottom] = box;
  const inset = 1.3;
  const low = { x: x0 + inset, y: height - bottom + inset };
  const high = { x: x1 - inset, y: height - top - inset };
  page.drawLine({ start: low, end: high, thickness: 1.1, color: INK });
  page.drawLine({
    start: { x: low.x, y: high.y },
    end: { x: high.x, y: low.y },
    thickness: 1.1,
    color: INK,
  });
}

export async function renderOverlay(
  modulo: ModuloOverlay,
  valori: Valori,
  fontDir: string,
): Promise<Uint8Array> {
  const { doc, font } = await apriModulo(modulo, fontDir);
  const page = doc.getPage(0);
  const height = page.getHeight();
  // Размерът на написаното и колко над линията стои — по листа (Word-ът е с едри букви).
  const size = modulo.dimensione ?? 8;
  const lift = modulo.sopraLinea ?? 1.6;
  for (const field of fieldsOf(modulo)) {
    const value = valori[field.key];
    if (field.kind === 'check') {
      if (value === true && 'box' in field) cross(page, field.box);
      continue;
    }
    if (typeof value !== 'string' || !value) continue;
    if ('line' in field) {
      const [x0, x1, y] = field.line;
      const fit = fitLine(font, value, x1 - x0, size);
      page.drawText(fit.text, { x: x0, y: height - y + lift, size: fit.size, font, color: INK });
    } else if ('area' in field && field.righe) {
      // Кутия с редове на листа (NOTE на 2SG): по ред на линия, не по-едро от другия текст.
      const [x0, , x1] = field.area;
      const { righe } = field;
      const block = fitRighe(font, value, x1 - x0, righe.length, size);
      righe.forEach((y, i) => {
        const line = block.lines[i];
        if (line)
          page.drawText(line, { x: x0, y: height - y + lift, size: block.size, font, color: INK });
      });
    } else if ('area' in field) {
      const [x0, top, x1, bottom] = field.area;
      const block = fitBlock(font, value, x1 - x0 - 4, bottom - top - 4, 9);
      block.lines.forEach((line, i) => {
        const y = height - top - 2 - block.size * (i + 1) * 1.18 + block.size * 0.22;
        page.drawText(line, { x: x0 + 2, y, size: block.size, font, color: INK });
      });
    }
  }
  return doc.save();
}

export function renderModulo(modulo: Modulo, valori: Valori, fontDir: string): Promise<Uint8Array> {
  return modulo.tipo === 'overlay'
    ? renderOverlay(modulo, valori, fontDir)
    : renderAcroform(modulo, valori, fontDir);
}
