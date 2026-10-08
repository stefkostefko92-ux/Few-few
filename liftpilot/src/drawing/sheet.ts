// The A4 sheet of the drawing set: frame with corner marks, the strip at the foot of every drawing sheet (drawing
// number, page, revision, location, plant number), the underlined title of the sheet, and helpers for the ruled tables
// and paragraphs of the data sheet. Paper millimetres, y up.
import { fitSize, textWidth, wrap } from './metrics';
import { STYLES } from './style';
import type { Align, Box, Pt, Shape, TextShape } from './types';

export const A4 = { w: 210, h: 297 } as const;
export const FRAME: Box = { x0: 8, y0: 7, x1: 202, y1: 290 };
export const STRIP_H = 10.5;

export interface SheetMeta {
  /** drawing number, e.g. 26-019 */
  number: string;
  page: number;
  pages: number;
  /** revision mark of the strip, e.g. "R1 12/07/2026" ("R0 …" on a first issue), or blank (a draft) */
  revision: string;
  location: string;
  /** plant number (matricola) */
  plant: string;
}

const T = (at: Pt, text: string, size: number, o: Partial<TextShape> = {}): TextShape => ({ t: 'text', at, text, size, cond: true, ...o });
const L = (a: Pt, b: Pt, w = 0.25): Shape => ({ t: 'line', a, b, s: { ink: 'ink', w } });

/** Text fitted to a width: the size shrinks when the text is too wide. */
export function fitted(at: Pt, text: string, size: number, width: number, o: Partial<TextShape> = {}): TextShape {
  return T(at, text, fitSize(text, width, { size, bold: o.bold, cond: o.cond ?? true }), o);
}

/** Frame and corner marks. */
export function frame(): Shape[] {
  const { x0, y0, x1, y1 } = FRAME, m = 4;
  return [
    { t: 'path', pts: [[x0, y0], [x1, y0], [x1, y1], [x0, y1]], closed: true, s: STYLES.frame },
    { t: 'path', pts: [[x1 + 1.5, y1 + 1.5 + m], [x1 + 1.5 + m, y1 + 1.5 + m], [x1 + 1.5 + m, y1 + 1.5]], closed: false, s: { ink: 'jamb', w: 0.3 } },
    { t: 'path', pts: [[x0 - 1.5 - m, y0 - 1.5], [x0 - 1.5 - m, y0 - 1.5 - m], [x0 - 1.5, y0 - 1.5 - m]], closed: false, s: { ink: 'jamb', w: 0.3 } },
  ];
}

/** The general note of the dimensions, on the strip of every drawing sheet and over sheet 1's title block. */
export const DIMENSIONS_NOTE = 'QUOTE IN mm, DA VERIFICARE IN CANTIERE';

/** The strip at the foot of the drawing sheets: the drawing number, the page and the revision; the location with the
 *  note of the dimensions; the designer's signature; the plant number. */
export function strip(m: SheetMeta): Shape[] {
  const { x0, y0, x1 } = FRAME, y1 = y0 + STRIP_H, c1 = x0 + 40, c3 = x1 - 36, c2 = c3 - 40, mid = y0 + 4.2, rcol = x0 + 21;
  return [
    L([x0, y1], [x1, y1], 0.35), L([c1, y0], [c1, y1], 0.35), L([c2, y0], [c2, y1], 0.35), L([c3, y0], [c3, y1], 0.35), L([x0, mid], [c1, mid]), L([rcol, y0], [rcol, mid]),
    T([x0 + 1.4, mid + 1.6], 'DIS. N°', 2),
    fitted([x0 + 10.4, mid + 1.4], m.number, 4.6, c1 - x0 - 11.6),
    fitted([x0 + 1.4, y0 + 1.2], `PAGINA N° ${m.page}/${m.pages}`, 2, rcol - x0 - 2),
    fitted([rcol + 1, y0 + 1.2], m.revision || 'R_  __/__/__', 2, c1 - rcol - 1.6),
    T([c1 + 2, y0 + 6.6], 'UBICAZIONE :', 2),
    fitted([c1 + 20, y0 + 6.3], m.location, 3.6, c2 - c1 - 22),
    fitted([c1 + 2, y0 + 1.5], DIMENSIONS_NOTE, 2, c2 - c1 - 4, { bold: true }),
    T([c2 + 1.4, y0 + 7.6], 'FIRMA DEL PROGETTISTA', 2),
    T([c3 + 2, y0 + 3.4], 'MATRICOLA :', 2),
    fitted([c3 + 16, y0 + 3.2], m.plant, 4.6, x1 - c3 - 17.5),
  ];
}

/** Underlined title of the sheet, centred above the strip, with an optional subtitle under the rule. */
export function sheetTitle(title: string, subtitle?: string): Shape[] {
  const cx = (FRAME.x0 + FRAME.x1) / 2, y = FRAME.y0 + STRIP_H + (subtitle ? 11 : 8);
  const size = fitSize(title, 170, { size: 3.6, cond: true }), w = textWidth(title, { size, cond: true });
  const out: Shape[] = [T([cx, y], title, size, { align: 'c' }), L([cx - w / 2 - 1, y - 1.2], [cx + w / 2 + 1, y - 1.2], 0.25)];
  if (subtitle) out.push(T([cx, y - 5], subtitle, 2.2, { align: 'c' }));
  return out;
}

/** The area left for the drawings on a sheet with a title. */
export const drawingArea = (subtitle = false): Box => ({ x0: FRAME.x0 + 4, y0: FRAME.y0 + STRIP_H + (subtitle ? 17 : 14), x1: FRAME.x1 - 4, y1: FRAME.y1 - 5 });

export interface Cell {
  text: string;
  align?: Align;
  bold?: boolean;
  size?: number;
}

/**
 * A ruled table: `widths` of the columns, a row height, rows of cells (a row with one cell spans the table and is a
 * heading). Texts shrink to fit their cell. Returns the shapes and the y of the bottom edge.
 */
export function table(x: number, yTop: number, widths: readonly number[], rowH: number, rows: readonly (readonly Cell[])[], size = 2.2): { shapes: Shape[]; bottom: number } {
  const out: Shape[] = [], W = widths.reduce((a, b) => a + b, 0);
  let y = yTop;
  out.push(L([x, y], [x + W, y], 0.3));
  for (const row of rows) {
    const yb = y - rowH, base = yb + rowH / 2 - (row[0]?.size ?? size) * 0.36;
    if (row.length === 1) {
      const c = row[0], s = c.size ?? size + 0.6;
      out.push(fitted([x + W / 2, base], c.text, s, W - 2, { align: 'c', bold: c.bold }));
    } else {
      let cx = x;
      row.forEach((c, j) => {
        const w = widths[j] ?? 0, s = c.size ?? size, a = c.align ?? (j === 0 ? 'l' : 'r');
        const at: Pt = [a === 'l' ? cx + 1 : a === 'c' ? cx + w / 2 : cx + w - 1, base];
        if (c.text) out.push(fitted(at, c.text, s, w - 2, { align: a, bold: c.bold }));
        if (j > 0) out.push(L([cx, y], [cx, yb], 0.18));
        cx += w;
      });
    }
    out.push(L([x, yb], [x + W, yb], row.length === 1 ? 0.3 : 0.18));
    y = yb;
  }
  out.push(L([x, yTop], [x, y], 0.3), L([x + W, yTop], [x + W, y], 0.3));
  return { shapes: out, bottom: y };
}

/** Wrapped paragraph from `yTop` down; returns the shapes and the y under the last line. */
export function paragraph(x: number, yTop: number, width: number, text: string, size: number, lead = 1.22): { shapes: Shape[]; bottom: number } {
  const lines = wrap(text, width, { size, cond: true });
  const shapes = lines.map((l, i): Shape => T([x, yTop - size * (0.85 + i * lead)], l, size));
  return { shapes, bottom: yTop - size * (0.85 + (lines.length - 1) * lead) - size * 0.45 };
}
