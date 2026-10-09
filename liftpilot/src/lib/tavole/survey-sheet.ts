// Sheet 1 of a machine replacement's drawing set, laid out on the A4 sheet: on the left the installation and the
// intervention, the existing machine beside the new one, the machine room and the drops as surveyed, the analysis of
// the load on the support; on the right the notes for the client, the checks and the electrical supply; under both the
// loads on the slab (P1–P4, P9), the band of the dimensions, the failed checks and the records, and the title block.
// The rows of the left column grow to fill it. No table's lettering under TEXT_MIN, as on the design's checks sheet
// (checks-sheet.ts): a text too long for its column wraps at its size, its row as much taller; the notes over the checks
// give up the room their wrapped labels take, down to NOTE_MIN (round 37: the labels shrank to 0,95 mm). Every value
// arrives written (survey-data.ts); this module only lays them out.
import { FRAME, fitted, paragraph, rowExtra, table, textWidth, wrap, type Cell, type Shape } from '@/drawing';
import { FAILED, TITLE_H, titleBlock, type Row } from './datasheet';
import type { SurveySheet } from './survey-data';
import { REF_BAND_H, refBand } from './title-block';

const L = (a: readonly [number, number], b: readonly [number, number], w = 0.25): Shape => ({ t: 'line', a, b, s: { ink: 'ink', w } });
const box = (x0: number, y0: number, x1: number, y1: number, w = 0.3): Shape => ({ t: 'path', pts: [[x0, y0], [x1, y0], [x1, y1], [x0, y1]], closed: true, s: { ink: 'ink', w } });
const rows3 = (rows: readonly Row[]): Cell[][] => rows.map(([l, u, v]) => [{ text: l }, { text: u, align: 'c' }, { text: v }]);

/** The loads' band over the title block and the band of the records [mm]. */
const GRID_H = 9.8;
/** The sheet's lettering never smaller (the checks sheet's TEXT_MIN, round 37); the checks' rows' height; the notes'
 *  lettering at most and at least [mm]. */
const TEXT_MIN = 2, CHECK_ROW = 3.3, NOTE_MAX = 2.3, NOTE_MIN = 1.8;
const CHECKS_HEAD = 'VERIFICHE DEL LOCALE, DEL BASAMENTO E DELLE CALATE (TRA PARENTESI I PUNTI DELLA UNI EN 81-20:2020)';

/** The checks' table rows at the lettering `cs`: the heading of the columns, then a check a row (its outcome in bold
 *  when it does not pass). */
const checkRows = (checks: SurveySheet['checks'], cs: number): Cell[][] => [
  [{ text: 'VERIFICA', size: cs }, { text: 'VALORE', align: 'r', size: cs }, { text: 'LIMITE', align: 'r', size: cs }, { text: 'ESITO', align: 'c', size: cs }],
  ...checks.map(([l, v, lim, o]): Cell[] => [{ text: l, size: cs }, { text: v, size: cs }, { text: lim, size: cs }, { text: o, align: 'c', size: cs, bold: o !== 'OK' && o !== 'ESISTENTE' }]),
];

/** The checks' columns in a table `w` wide: the value's, the limit's and the outcome's as wide as their widest text at
 *  TEXT_MIN (a millimetre either side, as the table letters them), the label's the rest. */
function checkWidths(rows: readonly (readonly Cell[])[], w: number): number[] {
  const col = (j: number): number => Math.max(...rows.map((r) => textWidth(r[j]?.text ?? '', { size: TEXT_MIN, bold: r[j]?.bold, cond: true }))) + 2.4;
  const side = [col(1), col(2), col(3)];
  return [w - side[0] - side[1] - side[2], ...side];
}

export function surveySheetShapes(d: SurveySheet): Shape[] {
  const out: Shape[] = [], xL = FRAME.x0, xM = 98, xR = FRAME.x1, yTop = FRAME.y1;
  const yb = FRAME.y0 + TITLE_H, yBand = yb + 1.6 + REF_BAND_H, yd = yBand + 1.6 + GRID_H, yCols = yd + 1.6;
  // left column: three tables of label, unit and value, one of the machines side by side; the rows as tall as fill it, a
  // text that would shrink under TEXT_MIN wrapped at their lettering, its row as much taller (round 37)
  const head = (text: string): Cell[] => [{ text, size: 3 }];
  const w3 = [51, 12, xM - xL - 63], half = (xM - xL - 52) / 2;
  const left: (readonly [readonly number[], Cell[][]])[] = [
    [w3, [head("CARATTERISTICHE DELL’IMPIANTO"), ...rows3(d.base)]],
    [[40, 12, half, half], [head('ARGANO ESISTENTE E NUOVO'),
      [{ text: '' }, { text: '' }, { text: 'ESISTENTE', align: 'c', bold: true }, { text: 'NUOVO', align: 'c', bold: true }],
      ...d.machines.map(([l, u, o, n]): Cell[] => [{ text: l }, { text: u, align: 'c' }, { text: o }, { text: n }])]],
    [w3, [head('LOCALE MACCHINA, CALATE E BASAMENTO'), ...rows3(d.room)]],
    [[56, 24, xM - xL - 80], [head('ANALISI DEI CARICHI SUL BASAMENTO'), ...d.loads.map(([l, v, u]): Cell[] => [{ text: l }, { text: v }, { text: u, align: 'c' }])]],
  ];
  // (every row, the headings too, as high; the lines the wrapped texts add at the lettering of the rows without them — a
  // smaller lettering never wraps into more —, the tables down to the columns' foot)
  const rows = left.reduce((t, [, r]) => t + r.length, 0), room = yTop - yCols - (left.length - 1) * 1.6;
  const sizeOf = (h: number): number => Math.min(2.3, h * 0.6), rowAt = (ex: number): number => Math.max(3.35, Math.min(4.6, (room - ex) / rows));
  const wrapped = (s: number): number => left.reduce((t, [w, r]) => t + r.reduce((u, c) => u + rowExtra(c, w, s, TEXT_MIN), 0), 0);
  const rowH = rowAt(wrapped(sizeOf(rowAt(0)))), size = sizeOf(rowH);
  let yt = yTop;
  for (const [w, r] of left) {
    const t = table(xL, yt, w, rowH, r, size, TEXT_MIN);
    out.push(...t.shapes);
    yt = t.bottom - 1.6;
  }

  // right column: the electrical supply at the foot, the notes from the top, the checks between them
  out.push(L([xM, yCols], [xM, yTop], 0.3), L([xR, yCols], [xR, yTop], 0.3), L([xM, yCols], [xR, yCols], 0.3));
  const e = table(xM, yCols + (d.electric.length + 1) * 3.3, [56, xR - xM - 70, 14], 3.3,
    [[{ text: 'CARATTERISTICHE ELETTRICHE', size: 2.6 }], ...d.electric.map(([l, u, v]): Cell[] => [{ text: l }, { text: v }, { text: u, align: 'c' }])], 2.05, TEXT_MIN);
  out.push(...e.shapes);
  const yFoot = yCols + (d.electric.length + 1) * 3.3 + 1.6, noteW = xR - xM - 2.4, LEAD = 1.2, n = d.checks.length;
  // the checks' table as tall as its rows with their wrapped labels (the notes take what it leaves)
  const lines = checkRows(d.checks, TEXT_MIN), widths = checkWidths(lines, xR - xM), extra = lines.reduce((t, r) => t + rowExtra(r, widths, TEXT_MIN, TEXT_MIN), 0);
  const checksH = n ? (n + 2) * CHECK_ROW + extra + 1.6 : 0;
  const height = (s: number): number => 5.2 + d.notes.reduce((h, x) => h + 4.2 + s * (1.3 + (wrap(x.text, noteW, { size: s, cond: true }).length - 1) * LEAD) + 0.8, 0);
  let ns = NOTE_MAX;
  while (ns - 0.05 >= NOTE_MIN - 1e-9 && height(ns) > yTop - yFoot - 1 - checksH) ns -= 0.05;
  let y = yTop;
  out.push(fitted([(xM + xR) / 2, y - 3.9], 'NOTE PER IL CLIENTE', 3, xR - xM - 4, { align: 'c' }));
  y -= 5.2;
  for (const x of d.notes) {
    out.push(L([xM, y], [xR, y], 0.3), fitted([(xM + xR) / 2, y - 2.7], x.title, 2.2, xR - xM - 30, { align: 'c' }), box(xR - 13, y - 3.6, xR, y, 0.2), fitted([xR - 6.5, y - 2.7], x.tag, TEXT_MIN, 12, { align: 'c' }));
    const p = paragraph(xM + 1.2, y - 4.2, noteW, x.text, ns, LEAD);
    out.push(...p.shapes);
    y = p.bottom - 0.8;
  }
  if (n) {
    // (the rows as high as the room left allows, never higher than CHECK_ROW: a label wraps, it is never shrunk)
    const rh = Math.min(CHECK_ROW, (y - 1.6 - yFoot - extra) / (n + 2));
    out.push(...table(xM, y - 1.6, widths, rh, [[{ text: CHECKS_HEAD, size: 2.4 }], ...lines], TEXT_MIN, TEXT_MIN).shapes);
  }

  // the loads on the slab, not acting together
  const cw = (xR - xL) / d.P.length;
  out.push(box(xL, yBand + 1.6, xR, yd, 0.3), fitted([(xL + xR) / 2, yd - 3.4], 'DISTRIBUZIONE DEI CARICHI SULLA SOLETTA daN (N.B. CARICHI NON CONTEMPORANEI)', 2.6, xR - xL - 4, { align: 'c' }));
  out.push(L([xL, yd - 4.6], [xR, yd - 4.6], 0.2));
  d.P.forEach(([name, v], i) => {
    const x0 = xL + i * cw;
    if (i) out.push(L([x0, yd - 4.6], [x0, yBand + 1.6], 0.2));
    // the name takes what the value leaves of the cell
    const vw = Math.min(16, textWidth(v, { size: 2.4, cond: true }));
    out.push(fitted([x0 + 1.2, yBand + 3], name, 2.2, cw - vw - 3.6), fitted([x0 + cw - 1.2, yBand + 3], v, 2.4, 16, { align: 'r' }));
  });
  out.push(...refBand(yBand, d.checks.filter((c) => c[3] === FAILED).length, d.refs ?? null), ...titleBlock(d, yb));
  return out.filter((s) => s.t !== 'text' || s.text !== '');
}
