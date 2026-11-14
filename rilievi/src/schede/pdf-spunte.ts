import type { OptionView } from './format.js';

/**
 * Изборите на листа в PDF-а — като в печата (print.css): квадратче, плътна отметка в избраното и
 * надписът до него, избраният — получер. Рисуват се с линии: отметката на знака ☑ на шрифта е дребна и
 * тънка (собственикът, 21 октомври 2026: „le spunte un po' più marcate“). Всеки избор е цял — редът се
 * пренася между изборите; надпис, по-дълъг от реда, е сам на реда и се пренася в него.
 */

type Spunta = Pick<OptionView, 'label' | 'checked'>;

interface Posto {
  spunta: Spunta;
  x: number;
  y: number;
  /** Ширината на надпис, който не се побира на един ред. */
  wrap?: number;
}

export interface Spunte {
  posti: Posto[];
  height: number;
}

const INK = '#000000';
// Спрямо размера на шрифта: квадратчето, разстоянието до надписа и между изборите (колкото четирите
// интервала досега).
const BOX = 0.8;
const SPACE = 0.35;
const GAP = 1.27;
// DejaVu Sans: базовата линия и височината на главните букви — квадратчето стои в средата им.
const ASCENT = 0.928;
const CAP = 0.729;

const fontOf = (spunta: Spunta): string => (spunta.checked ? 'Sans-Bold' : 'Sans');

/** Мястото на всеки избор спрямо горния ляв ъгъл и височината на всички — за мерене и за рисуване. */
export function layoutSpunte(
  doc: PDFKit.PDFDocument,
  spunte: readonly Spunta[],
  width: number,
  size: number,
): Spunte {
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

export function drawSpunte(
  doc: PDFKit.PDFDocument,
  spunte: Spunte,
  left: number,
  top: number,
  size: number,
): void {
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
      .text(
        spunta.label,
        boxX + size * (BOX + SPACE),
        top + y,
        wrap ? { width: wrap } : { lineBreak: false },
      );
  }
}
