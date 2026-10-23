import 'server-only';
// The sheet's choices in the PDF — as in the print (rilievi-print.css): a box, a solid tick in the chosen one and the label
// next to it, the chosen one bold. Drawn with lines: the tick of the font's ☑ is small and thin (the owner, 21 October
// 2026: «le spunte un po' più marcate»). Each choice is whole — the line wraps between choices; a label longer than the
// line stands alone on it and wraps there. Ported 1:1 from rilievi (src/schede/pdf-spunte.ts, commit 988f3cf37).
import type { OptionView } from '@/lib/rilievi/format';

type Spunta = Pick<OptionView, 'label' | 'checked'>;

interface Posto {
  spunta: Spunta;
  x: number;
  y: number;
  /** The width of a label that does not fit on one line. */
  wrap?: number;
}

export interface Spunte {
  posti: Posto[];
  height: number;
}

const INK = '#000000';
// relative to the font size: the box, the space to the label and between the choices (as much as the four spaces before)
const BOX = 0.8;
const SPACE = 0.35;
const GAP = 1.27;
// DejaVu Sans: the baseline and the capitals' height — the box stands in their middle
const ASCENT = 0.928;
const CAP = 0.729;

const fontOf = (spunta: Spunta): string => (spunta.checked ? 'Sans-Bold' : 'Sans');

/** The place of each choice from the top left corner and the height of them all — to measure and to draw. */
export function layoutSpunte(doc: PDFKit.PDFDocument, spunte: readonly Spunta[], width: number, size: number): Spunte {
  doc.font('Sans').fontSize(size);
  const line = doc.currentLineHeight(true);
  const lead = size * (BOX + SPACE);
  const posti: Posto[] = [];
  let [x, y, height] = [0, 0, 0];
  for (const spunta of spunte) {
    doc.font(fontOf(spunta)).fontSize(size);
    const unit = lead + doc.widthOfString(spunta.label);
    if (x > 0 && x + unit > width) {
      x = 0;
      y += line;
    }
    if (unit > width) {
      const wrap = width - lead;
      posti.push({ spunta, x: 0, y, wrap });
      y += doc.heightOfString(spunta.label, { width: wrap });
      height = y;
      x = 0;
      continue;
    }
    posti.push({ spunta, x, y });
    height = y + line;
    x += unit + size * GAP;
  }
  return { posti, height };
}

export function drawSpunte(doc: PDFKit.PDFDocument, spunte: Spunte, left: number, top: number, size: number): void {
  const side = size * BOX;
  for (const { spunta, x, y, wrap } of spunte.posti) {
    const boxX = left + x;
    const middle = top + y + size * (ASCENT - CAP / 2);
    doc
      .save()
      .strokeColor(INK)
      .lineWidth(size * 0.105);
    doc.roundedRect(boxX, middle - side / 2, side, side, side * 0.14).stroke();
    if (spunta.checked) {
      const cx = boxX + side / 2;
      doc
        .lineWidth(size * 0.16)
        .lineCap('round')
        .lineJoin('round')
        .moveTo(cx - side * 0.3, middle + side * 0.01)
        .lineTo(cx - side * 0.07, middle + side * 0.24)
        .lineTo(cx + side * 0.31, middle - side * 0.25)
        .stroke();
    }
    doc.restore();
    doc
      .font(fontOf(spunta))
      .fontSize(size)
      .fillColor(INK)
      .text(spunta.label, boxX + size * (BOX + SPACE), top + y, wrap ? { width: wrap } : { lineBreak: false });
  }
}
