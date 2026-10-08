// The checks of the design on their own sheet at the end of the set (round 36: with the shaft's, the machine room's, the
// rails' and the rig's checks — some fifty — the table no longer fits sheet 1 legibly): every check with its value, its
// limit and its outcome, the clause of UNI EN 81-20:2020 in its label, the outcomes that do not pass in bold. Its rows as
// tall as the drawing area allows, never taller than ROW_MAX nor lettered under TEXT_MIN; in two columns when one would
// go under ROW_MIN. Paper millimetres. Pure.
import { table, type Box, type Cell, type Shape } from '@/drawing';
import type { DataSheet } from './datasheet';

/** The rows' height: at most, at least in one column [mm]; the lettering at least [mm]. */
const ROW_MAX = 5, ROW_MIN = 3.4, TEXT_MIN = 2;

/** The sheet's title and subtitle (sheet.ts sheetTitle). */
export const CHECKS_TITLE = 'VERIFICHE DEL PROGETTO';
export const CHECKS_SUBTITLE = 'TRA PARENTESI I PUNTI DELLA UNI EN 81-20:2020 — ESITI CON I DATI DI QUESTO FASCICOLO';

/** The table of `checks` in `area`. */
export function checksSheet(checks: DataSheet['checks'], area: Box): Shape[] {
  const n = checks.length, h = area.y1 - area.y0 - 2, one = h / (n + 1);
  const cols = one >= ROW_MIN || n < 2 ? 1 : 2, per = Math.ceil(n / cols), gap = 4;
  const rowH = Math.min(ROW_MAX, h / (per + 1)), cs = Math.max(TEXT_MIN, Math.min(2.6, rowH * 0.6));
  const w = (area.x1 - area.x0 - (cols - 1) * gap) / cols, out: Shape[] = [];
  for (let c = 0; c < cols; c++) {
    const part = checks.slice(c * per, (c + 1) * per);
    if (!part.length) continue;
    const rows: Cell[][] = [
      [{ text: 'VERIFICA', size: cs, bold: true }, { text: 'VALORE', align: 'r', size: cs, bold: true }, { text: 'LIMITE', align: 'r', size: cs, bold: true }, { text: 'ESITO', align: 'c', size: cs, bold: true }],
      ...part.map(([l, v, lim, o]): Cell[] => [{ text: l, size: cs }, { text: v, size: cs }, { text: lim, size: cs }, { text: o, align: 'c', size: cs, bold: o !== 'OK' && o !== 'ESISTENTE' }]),
    ];
    // the label as wide as the column leaves after the value, the limit and the outcome
    const x0 = area.x0 + c * (w + gap), side = cols === 1 ? [26, 26, 24] : [18, 18, 18];
    out.push(...table(x0, area.y1 - 1, [w - side[0] - side[1] - side[2], ...side], rowH, rows, cs).shapes);
  }
  return out;
}
