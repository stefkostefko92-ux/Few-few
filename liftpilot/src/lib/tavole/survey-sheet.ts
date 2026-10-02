// Sheet 1 of a machine replacement's drawing set, laid out on the A4 sheet: on the left the installation and the
// intervention, the existing machine beside the new one, the machine room and the drops as surveyed, the analysis of
// the load on the support; on the right the notes for the client, the checks and the electrical supply; under both the
// loads on the slab (P1–P4, P9) and the title block. The rows of the left column grow to fill it. Every value arrives
// written (survey-data.ts); this module only lays them out.
import { FRAME, fitted, paragraph, table, wrap, type Cell, type Shape } from '@/drawing';
import { titleBlock, type Row } from './datasheet';
import type { SurveySheet } from './survey-data';

const L = (a: readonly [number, number], b: readonly [number, number], w = 0.25): Shape => ({ t: 'line', a, b, s: { ink: 'ink', w } });
const box = (x0: number, y0: number, x1: number, y1: number, w = 0.3): Shape => ({ t: 'path', pts: [[x0, y0], [x1, y0], [x1, y1], [x0, y1]], closed: true, s: { ink: 'ink', w } });
const rows3 = (rows: readonly Row[]): Cell[][] => rows.map(([l, u, v]) => [{ text: l }, { text: u, align: 'c' }, { text: v }]);

/** The title block's top over the frame's foot, and the loads' band over it [mm]. */
const TITLE_H = 48, GRID_H = 9.8;

export function surveySheetShapes(d: SurveySheet): Shape[] {
  const out: Shape[] = [], xL = FRAME.x0, xM = 98, xR = FRAME.x1, yTop = FRAME.y1;
  const yb = FRAME.y0 + TITLE_H, yd = yb + 1.6 + GRID_H, yCols = yd + 1.6;
  // left column: three tables of label, unit and value, one of the machines side by side; the rows as tall as fill it
  const heads = 4, gaps = 3 * 1.6, rows = d.base.length + d.machines.length + 1 + d.room.length + d.loads.length;
  const rowH = Math.max(3.35, Math.min(4.6, (yTop - yCols - gaps - heads * 4.2) / rows)), size = Math.min(2.3, rowH * 0.6);
  const head = (text: string): Cell[] => [{ text, size: 3 }];
  const w3 = [51, 12, xM - xL - 63], half = (xM - xL - 52) / 2;
  let t = table(xL, yTop, w3, rowH, [head("CARATTERISTICHE DELL'IMPIANTO"), ...rows3(d.base)], size);
  out.push(...t.shapes);
  t = table(xL, t.bottom - 1.6, [40, 12, half, half], rowH, [head('ARGANO ESISTENTE E NUOVO'),
    [{ text: '' }, { text: '' }, { text: 'ESISTENTE', align: 'c', bold: true }, { text: 'NUOVO', align: 'c', bold: true }],
    ...d.machines.map(([l, u, o, n]): Cell[] => [{ text: l }, { text: u, align: 'c' }, { text: o }, { text: n }])], size);
  out.push(...t.shapes);
  t = table(xL, t.bottom - 1.6, w3, rowH, [head('LOCALE MACCHINA, CALATE E BASAMENTO'), ...rows3(d.room)], size);
  out.push(...t.shapes);
  t = table(xL, t.bottom - 1.6, [56, 24, xM - xL - 80], rowH, [head('ANALISI DEI CARICHI SUL BASAMENTO'),
    ...d.loads.map(([l, v, u]): Cell[] => [{ text: l }, { text: v }, { text: u, align: 'c' }])], size);
  out.push(...t.shapes);

  // right column: the electrical supply at the foot, the notes from the top, the checks between them
  out.push(L([xM, yCols], [xM, yTop], 0.3), L([xR, yCols], [xR, yTop], 0.3), L([xM, yCols], [xR, yCols], 0.3));
  const e = table(xM, yCols + (d.electric.length + 1) * 3.3, [56, xR - xM - 70, 14], 3.3,
    [[{ text: 'CARATTERISTICHE ELETTRICHE', size: 2.6 }], ...d.electric.map(([l, u, v]): Cell[] => [{ text: l }, { text: v }, { text: u, align: 'c' }])], 2.05);
  out.push(...e.shapes);
  const yFoot = yCols + (d.electric.length + 1) * 3.3 + 1.6, noteW = xR - xM - 2.4, LEAD = 1.2, n = d.checks.length;
  const checksH = n ? (n + 2) * 3.1 + 1.6 : 0;
  const height = (s: number): number => 5.2 + d.notes.reduce((h, x) => h + 4.2 + s * (1.3 + (wrap(x.text, noteW, { size: s, cond: true }).length - 1) * LEAD) + 0.8, 0);
  let ns = 2.3;
  while (ns > 1.4 && height(ns) > yTop - yFoot - 1 - checksH) ns -= 0.05;
  let y = yTop;
  out.push(fitted([(xM + xR) / 2, y - 3.9], 'NOTE PER IL CLIENTE', 3, xR - xM - 4, { align: 'c' }));
  y -= 5.2;
  for (const x of d.notes) {
    out.push(L([xM, y], [xR, y], 0.3), fitted([(xM + xR) / 2, y - 2.7], x.title, 2.2, xR - xM - 30, { align: 'c' }), box(xR - 13, y - 3.6, xR, y, 0.2), fitted([xR - 6.5, y - 2.7], x.tag, 1.6, 12, { align: 'c' }));
    const p = paragraph(xM + 1.2, y - 4.2, noteW, x.text, ns, LEAD);
    out.push(...p.shapes);
    y = p.bottom - 0.8;
  }
  if (n) {
    const rh = Math.min(3.3, (y - 1.6 - yFoot) / (n + 2)), cs = Math.min(1.95, rh * 0.62), w = xR - xM;
    const t2 = table(xM, y - 1.6, [w - 57, 18, 18, 21], rh, [
      [{ text: 'VERIFICHE DEL LOCALE, DEL BASAMENTO E DELLE CALATE (TRA PARENTESI I PUNTI DELLA UNI EN 81-20:2020)', size: Math.min(2.4, rh * 0.72) }],
      [{ text: 'VERIFICA', size: cs }, { text: 'VALORE', align: 'r', size: cs }, { text: 'LIMITE', align: 'r', size: cs }, { text: 'ESITO', align: 'c', size: cs }],
      ...d.checks.map(([l, v, lim, o]): Cell[] => [{ text: l, size: cs }, { text: v, size: cs }, { text: lim, size: cs }, { text: o, align: 'c', size: cs, bold: o !== 'OK' && o !== 'ESISTENTE' }]),
    ], cs);
    out.push(...t2.shapes);
  }

  // the loads on the slab, not acting together
  const cw = (xR - xL) / d.P.length;
  out.push(box(xL, yb + 1.6, xR, yd, 0.3), fitted([(xL + xR) / 2, yd - 3.4], 'DISTRIBUZIONE DEI CARICHI SUL SOLAIO daN (N.B. CARICHI NON CONTEMPORANEI)', 2.6, xR - xL - 4, { align: 'c' }));
  out.push(L([xL, yd - 4.6], [xR, yd - 4.6], 0.2));
  d.P.forEach(([name, v], i) => {
    const x0 = xL + i * cw;
    if (i) out.push(L([x0, yd - 4.6], [x0, yb + 1.6], 0.2));
    out.push(fitted([x0 + 1.2, yb + 3], name, 1.9, cw - 16), fitted([x0 + cw - 1.2, yb + 3], v, 2.6, 14, { align: 'r' }));
  });
  out.push(...titleBlock(d, yb));
  return out.filter((s) => s.t !== 'text' || s.text !== '');
}
