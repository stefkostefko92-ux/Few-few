// The checks of the design on their own sheet at the end of the set (round 36: with the shaft's, the machine room's, the
// rails' and the rig's checks — some fifty — the table no longer fits sheet 1 legibly): every check with its value, its
// limit and its outcome, the clause of UNI EN 81-20:2020 in its label, the outcomes that do not pass in bold. Its rows as
// tall as the drawing area allows, never taller than ROW_MAX nor lettered under TEXT_MIN — a text that would shrink under
// it wraps at the row's size instead, its row as much taller (round 37); in two columns when one would go under ROW_MIN.
// Paper millimetres. Pure.
import { rowExtra, table, type Box, type Cell, type Shape } from '@/drawing';
import type { DataSheet } from './datasheet';

/** The rows' height: at most, at least in one column [mm]. */
const ROW_MAX = 5, ROW_MIN = 3.4;
/** The lettering of a table of checks never smaller [mm] (sheet 1 of a replacement's set too: survey-sheet.ts). */
export const TEXT_MIN = 2;

/** The sheet's title and subtitle (sheet.ts sheetTitle). */
export const CHECKS_TITLE = 'VERIFICHE DEL PROGETTO';
export const CHECKS_SUBTITLE = 'TRA PARENTESI I PUNTI DELLA UNI EN 81-20:2020 — ESITI CON I DATI DI QUESTO FASCICOLO';

/** The lettering of rows `rowH` high. */
const sizeOf = (rowH: number): number => Math.max(TEXT_MIN, Math.min(2.6, rowH * 0.6));

/** The rows of a column of the table at the lettering size `cs`: the heading, then a check a row. */
const rowsOf = (part: DataSheet['checks'], cs: number): Cell[][] => [
  [{ text: 'VERIFICA', size: cs, bold: true }, { text: 'VALORE', align: 'r', size: cs, bold: true }, { text: 'LIMITE', align: 'r', size: cs, bold: true }, { text: 'ESITO', align: 'c', size: cs, bold: true }],
  ...part.map(([l, v, lim, o]): Cell[] => [{ text: l, size: cs }, { text: v, size: cs }, { text: lim, size: cs }, { text: o, align: 'c', size: cs, bold: o !== 'OK' && o !== 'ESISTENTE' }]),
];

/** The table of `checks` in `area`. */
export function checksSheet(checks: DataSheet['checks'], area: Box): Shape[] {
  const n = checks.length, h = area.y1 - area.y0 - 2, gap = 4;
  const layout = (cols: number) => {
    const per = Math.ceil(n / cols), w = (area.x1 - area.x0 - (cols - 1) * gap) / cols, side = cols === 1 ? [26, 26, 24] : [18, 18, 18];
    // the label as wide as the column leaves after the value, the limit and the outcome
    const widths = [w - side[0] - side[1] - side[2], ...side], parts = Array.from({ length: cols }, (_, c) => checks.slice(c * per, (c + 1) * per));
    // the lines a wrapped text adds, in the taller column; the rows shrink to keep the table in the area (a smaller
    // lettering never wraps into more lines: what wraps is what does not fit at TEXT_MIN)
    const extra = (cs: number): number => Math.max(0, ...parts.map((p) => rowsOf(p, cs).reduce((t, r) => t + rowExtra(r, widths, cs, TEXT_MIN), 0)));
    const first = Math.min(ROW_MAX, h / (per + 1)), cs = Math.min(sizeOf(first), sizeOf(Math.min(ROW_MAX, (h - extra(sizeOf(first))) / (per + 1))));
    return { w, widths, parts, cs, rowH: Math.min(ROW_MAX, (h - extra(cs)) / (per + 1)) };
  };
  const one = layout(1), L = one.rowH >= ROW_MIN || n < 2 ? one : layout(2), out: Shape[] = [];
  L.parts.forEach((part, c) => {
    if (part.length) out.push(...table(area.x0 + c * (L.w + gap), area.y1 - 1, L.widths, L.rowH, rowsOf(part, L.cs), L.cs, TEXT_MIN).shapes);
  });
  return out;
}
