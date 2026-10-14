import 'server-only';
// The PDF of a supplier's module: the official module itself with our values on it — nothing else is touched. The flat
// sheets (Pelazza, the argano data sheet, 2SG): crosses in the boxes and text on the lines, at the coordinates of the map
// — here. MoviLift (a form) — pdf-form.ts; what they share (the font, the place of the text, turning the upside-down
// sheet) — pdf-testo.ts. Ported 1:1 from rilievi (src/ordini/pdf.ts, commit ae6329cb6).
import { rgb, type PDFPage } from 'pdf-lib';
import { fieldsOf, type Modulo, type ModuloOverlay } from '@/lib/rilievi/ordini/moduli';
import type { Valori } from '@/lib/rilievi/ordini/valori';
import { renderAcroform } from './pdf-form';
import { apriModulo, fitBlock, fitLine, fitRighe } from './pdf-testo';

export { fitBlock, fitLine, wrap } from './pdf-testo';

const INK = rgb(0, 0, 0);

function cross(page: PDFPage, box: readonly [number, number, number, number]): void {
  const height = page.getHeight();
  const [x0, top, x1, bottom] = box;
  const inset = 1.3;
  const low = { x: x0 + inset, y: height - bottom + inset };
  const high = { x: x1 - inset, y: height - top - inset };
  page.drawLine({ start: low, end: high, thickness: 1.1, color: INK });
  page.drawLine({ start: { x: low.x, y: high.y }, end: { x: high.x, y: low.y }, thickness: 1.1, color: INK });
}

export async function renderOverlay(modulo: ModuloOverlay, valori: Valori, fontDir: string): Promise<Uint8Array> {
  const { doc, font } = await apriModulo(modulo, fontDir);
  const page = doc.getPage(0);
  const height = page.getHeight();
  // the size of the writing and how far above the line it stands — by the sheet (the Word one has a large type)
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
      // a box with lines of the sheet (2SG's NOTE): a line per rule, never larger than the other text
      const [x0, , x1] = field.area;
      const { righe } = field;
      const block = fitRighe(font, value, x1 - x0, righe.length, size);
      righe.forEach((y, i) => {
        const line = block.lines[i];
        if (line) page.drawText(line, { x: x0, y: height - y + lift, size: block.size, font, color: INK });
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
  return modulo.tipo === 'overlay' ? renderOverlay(modulo, valori, fontDir) : renderAcroform(modulo, valori, fontDir);
}
