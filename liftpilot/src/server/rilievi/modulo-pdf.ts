import 'server-only';
// The PDF of a supplier's module: the official module itself with our values on it — nothing else is touched. The flat
// sheets (Pelazza, the argano data sheet, 2SG, Mastech): crosses in the boxes (or a circle around the floor's number) and
// text on the lines, at the coordinates of the map and on the group's page — here. MoviLift (a form) — pdf-form.ts; what
// they share (the font, the place of the text, turning the upside-down sheet) — pdf-testo.ts. Ported 1:1 from rilievi
// (src/ordini/pdf.ts, commit 988f3cf37).
import { rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import type { Modulo, ModuloOverlay } from '@/lib/rilievi/ordini/moduli';
import type { Valori } from '@/lib/rilievi/ordini/valori';
import { renderAcroform } from './pdf-form';
import { apriModulo, fitBlock, fitLine, fitRighe, SEGNO } from './pdf-testo';

export { fitBlock, fitLine, wrap } from './pdf-testo';

const INK = rgb(0, 0, 0);

function cross(page: PDFPage, box: readonly [number, number, number, number]): void {
  const height = page.getHeight();
  const [x0, top, x1, bottom] = box;
  const inset = 1.6;
  const low = { x: x0 + inset, y: height - bottom + inset };
  const high = { x: x1 - inset, y: height - top - inset };
  page.drawLine({ start: low, end: high, thickness: SEGNO, color: INK });
  page.drawLine({ start: { x: low.x, y: high.y }, end: { x: high.x, y: low.y }, thickness: SEGNO, color: INK });
}

/** A circle around the word in the box — the floor marked by its number (NG120). */
function circle(page: PDFPage, box: readonly [number, number, number, number]): void {
  const [x0, top, x1, bottom] = box;
  page.drawEllipse({
    x: (x0 + x1) / 2,
    y: page.getHeight() - (top + bottom) / 2,
    xScale: (x1 - x0) / 2,
    yScale: (bottom - top) / 2,
    borderWidth: SEGNO,
    borderColor: INK,
  });
}

export async function renderOverlay(modulo: ModuloOverlay, valori: Valori, fontDir: string): Promise<Uint8Array> {
  const { doc, font } = await apriModulo(modulo, fontDir);
  // the size of the writing and how far above the line it stands — by the sheet (the Word one has a large type)
  const size = modulo.dimensione ?? 8;
  const lift = modulo.sopraLinea ?? 1.6;
  for (const gruppo of modulo.gruppi) {
    const page = doc.getPage((gruppo.pagina ?? 1) - 1);
    for (const riga of gruppo.righe) drawCampi(page, riga.campi, valori, font, size, lift);
  }
  return doc.save();
}

function drawCampi(
  page: PDFPage,
  campi: ModuloOverlay['gruppi'][number]['righe'][number]['campi'],
  valori: Valori,
  font: PDFFont,
  size: number,
  lift: number,
): void {
  const height = page.getHeight();
  for (const field of campi) {
    const value = valori[field.key];
    if (field.kind === 'check') {
      if (value === true) (field.segno === 'cerchio' ? circle : cross)(page, field.box);
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
}

export function renderModulo(modulo: Modulo, valori: Valori, fontDir: string): Promise<Uint8Array> {
  return modulo.tipo === 'overlay' ? renderOverlay(modulo, valori, fontDir) : renderAcroform(modulo, valori, fontDir);
}
