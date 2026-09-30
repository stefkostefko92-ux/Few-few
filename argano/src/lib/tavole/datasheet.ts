// Sheet 1 of the drawing set: characteristics, specifications of the installation, analysis of the loads, notes for
// the client, legend of the spaces, forces on the rails, electrical supply, distribution of the loads and the title
// block (client, location, author, date, approval, revisions, company logo, plant number, drawing number). Every value
// arrives written; this module only lays them out on the A4 sheet.
import { FRAME, arrowhead, fitted, paragraph, symbol, table, wrap, type Cell, type Shape, type SymbolName } from '@/drawing';

export type Row = readonly [label: string, unit: string, value: string];

export interface DataSheet {
  base: readonly Row[];
  specs: readonly Row[];
  /** label, value, unit */
  loads: readonly (readonly [string, string, string])[];
  notes: readonly { title: string; tag: string; text: string }[];
  legend: readonly { sym: SymbolName; text: string }[];
  forces: { fx: string; fy: string };
  /** checks of the shaft design: label, value, limit, outcome */
  checks: readonly (readonly [string, string, string, string])[];
  electric: readonly Row[];
  /** P1 … P9, written */
  P: readonly string[];
  client: string;
  location: readonly [string, string];
  author: string;
  date: string;
  revisions: readonly { mark: string; text: string; date: string }[];
  number: string;
  pages: number;
  plant: string;
  company: string;
  logo: boolean;
}

const L = (a: readonly [number, number], b: readonly [number, number], w = 0.25): Shape => ({ t: 'line', a, b, s: { ink: 'ink', w } });
const T = (at: readonly [number, number], text: string, size: number, o: Partial<Extract<Shape, { t: 'text' }>> = {}): Shape => ({ t: 'text', at, text, size, cond: true, ...o });
const box = (x0: number, y0: number, x1: number, y1: number, w = 0.3): Shape => ({ t: 'path', pts: [[x0, y0], [x1, y0], [x1, y1], [x0, y1]], closed: true, s: { ink: 'ink', w } });

function rows3(rows: readonly Row[]): Cell[][] {
  return rows.map(([l, u, v]) => [{ text: l }, { text: u, align: 'c' }, { text: v }]);
}

export function dataSheetShapes(d: DataSheet): Shape[] {
  const out: Shape[] = [];
  const xL = FRAME.x0, xM = 98, xR = FRAME.x1, yTop = FRAME.y1;
  // left column: characteristics, specifications, analysis of the loads
  const w3 = [51, 12, xM - xL - 63];
  let t = table(xL, yTop, w3, 3.35, [[{ text: 'CARATTERISTICHE DI BASE', size: 3 }], ...rows3(d.base)], 2.05);
  out.push(...t.shapes);
  t = table(xL, t.bottom - 1.6, w3, 3.35, [[{ text: "SPECIFICHE DELL'IMPIANTO", size: 3 }], ...rows3(d.specs)], 2.05);
  out.push(...t.shapes);
  const loadRows: Cell[][] = d.loads.map(([l, v, u]) => [{ text: l, size: 2.5 }, { text: v, size: 2.5 }, { text: u, align: 'c', size: 2.5 }]);
  t = table(xL, t.bottom - 1.6, [52, 26, xM - xL - 78], 4.15, [[{ text: 'ANALISI DEI CARICHI', size: 3 }], ...loadRows], 2.5);
  out.push(...t.shapes);
  const yLoads = t.bottom;

  // right column, from the foot: the legend of the spaces beside the forces on the rails and the electrical supply,
  // level with the foot of the left column; above them the notes for the client, lettered as large as the room allows
  const split = 146, yBlock = yLoads + 58, NOTE_LEAD = 1.2;
  out.push(L([xM, yLoads], [xM, yTop], 0.3), L([xR, yLoads], [xR, yTop], 0.3), L([xM, yBlock], [xR, yBlock], 0.3), L([split, yLoads], [split, yBlock], 0.25));
  let ly = yBlock - 8;
  for (const g of d.legend) {
    out.push(...symbol(g.sym, [xM + 6, ly], 3.2));
    const p = paragraph(xM + 11, ly + 2.2, split - xM - 13, g.text, 1.9, 1.15);
    out.push(...p.shapes);
    ly = Math.min(ly - 13, p.bottom - 6);
  }
  out.push(fitted([(split + xR) / 2, yBlock - 3.6], 'SPINTE SULLE GUIDE daN', 2.6, xR - split - 4, { align: 'c' }), L([split, yBlock - 5], [xR, yBlock - 5], 0.25));
  // a rail seen from above with the two forces: Fx on the faces of the blade, Fy on its tip
  const rx = split + 12, ry = yBlock - 27;
  out.push({ t: 'path', pts: [[rx - 7, ry - 1], [rx + 7, ry - 1], [rx + 7, ry + 1], [rx + 1, ry + 1], [rx + 1, ry + 12], [rx - 1, ry + 12], [rx - 1, ry + 1], [rx - 7, ry + 1]], closed: true, s: { ink: 'ink', w: 0.3 }, fill: { k: 'solid', ink: 'steel' } });
  out.push(L([rx - 9, ry + 8], [rx - 1.6, ry + 8], 0.25), arrowhead([rx - 1.3, ry + 8], 0, 1.8, 0.5), T([rx - 9, ry + 9.2], 'Fx', 2.2));
  out.push(L([rx, ry + 19.5], [rx, ry + 12.6], 0.25), arrowhead([rx, ry + 12.3], -Math.PI / 2, 1.8, 0.5), T([rx + 1.2, ry + 17], 'Fy', 2.2));
  out.push(T([split + 26, ry + 12], `Fx = ${d.forces.fx}`, 2.8), T([split + 26, ry + 4], `Fy = ${d.forces.fy}`, 2.8));
  const e = table(split, yBlock - 38, [30, xR - split - 42, 12], 3.3, [[{ text: 'CARATTERISTICHE ELETTRICHE', size: 2.4 }], ...d.electric.map(([l, u, v]): Cell[] => [{ text: l }, { text: v }, { text: u, align: 'c' }])], 2.05);
  out.push(...e.shapes);

  // the notes, then the checks of the shaft down to the block; the notes' lettering as large as the room allows
  const noteW = xR - xM - 2.4, head = 5.2, titleH = 4.2, gap = 0.8, rowMin = 2.75, n = d.checks.length;
  const checksH = n ? (n + 2) * rowMin + 1.6 : 0;
  const height = (size: number): number => head + d.notes.reduce((h, x) => h + titleH + size * (1.3 + (wrap(x.text, noteW, { size, cond: true }).length - 1) * NOTE_LEAD) + gap, 0);
  let size = 2.1;
  while (size > 1.4 && height(size) > yTop - yBlock - 1 - checksH) size -= 0.05;
  let y = yTop;
  out.push(fitted([(xM + xR) / 2, y - 3.9], 'NOTE PER IL CLIENTE', 3, xR - xM - 4, { align: 'c' }));
  y -= head;
  for (const x of d.notes) {
    out.push(L([xM, y], [xR, y], 0.3), fitted([(xM + xR) / 2, y - 2.7], x.title, 2.2, xR - xM - 30, { align: 'c' }), box(xR - 13, y - 3.6, xR, y, 0.2), T([xR - 6.5, y - 2.7], x.tag, 1.6, { align: 'c' }));
    const p = paragraph(xM + 1.2, y - titleH, noteW, x.text, size, NOTE_LEAD);
    out.push(...p.shapes);
    y = p.bottom - gap;
  }
  if (n) {
    const rowH = Math.min(3.3, (y - 1.6 - yBlock) / (n + 2)), cs = Math.min(1.95, rowH * 0.62), w = xR - xM;
    const rows: Cell[][] = [
      [{ text: 'VERIFICHE DEL PROGETTO DEL VANO (UNI EN 81-20:2020)', size: Math.min(2.4, rowH * 0.72) }],
      [{ text: 'VERIFICA', size: cs }, { text: 'VALORE', align: 'r', size: cs }, { text: 'LIMITE', align: 'r', size: cs }, { text: 'ESITO', align: 'c', size: cs }],
      ...d.checks.map(([l, v, lim, o]): Cell[] => [{ text: l, size: cs }, { text: v, size: cs }, { text: lim, size: cs }, { text: o, align: 'c', size: cs, bold: o !== 'OK' }]),
    ];
    const t2 = table(xM, y - 1.6, [w - 57, 18, 18, 21], rowH, rows, cs);
    out.push(...t2.shapes);
  }

  // distribution of the loads
  const yd = yLoads - 1.6, gridH = 3 * 5.2 + 4.6, cw = (xR - xL) / 3;
  out.push(box(xL, yd - gridH, xR, yd, 0.3), fitted([(xL + xR) / 2, yd - 3.5], 'DISTRIBUZIONE DEI CARICHI daN (N.B. CARICHI NON CONTEMPORANEI)', 2.8, xR - xL - 4, { align: 'c' }));
  for (let i = 0; i < 9; i++) {
    const col = Math.floor(i / 3), row = i % 3, x0 = xL + col * cw, y0 = yd - 4.6 - row * 5.2;
    out.push(L([x0, y0], [x0 + cw, y0], 0.2), T([x0 + 1.4, y0 - 3.7], `CARICO P${i + 1} =`, 2.6), fitted([x0 + cw - 1.4, y0 - 3.7], d.P[i] ?? '—', 2.6, cw - 22, { align: 'r' }));
    if (col > 0 && row === 0) out.push(L([x0, yd - 4.6], [x0, yd - gridH], 0.2));
  }

  // title block
  const yb = yd - gridH - 1.6, y0 = FRAME.y0, r1 = yb - 9, r2 = r1 - 18, c1 = 150;
  out.push(box(xL, y0, xR, yb, 0.3), L([xL, r1], [xR, r1], 0.3), L([xL, r2], [xR, r2], 0.3), L([c1, r1], [c1, y0], 0.3), L([c1, r1 - 9], [xR, r1 - 9], 0.2));
  out.push(T([xL + 1.6, r1 + 3], 'COMMITTENTE :', 2), fitted([xL + 26, r1 + 2.6], d.client, 5, c1 - xL - 28, { at: [xL + 26, r1 + 2.6] }));
  out.push(L([c1, r1], [c1, yb], 0.3));
  out.push(T([xL + 1.6, r1 - 6], 'UBICAZIONE :', 2), fitted([xL + 26, r1 - 6.4], d.location[0], 4.6, c1 - xL - 28), fitted([xL + 26, r1 - 14.6], d.location[1], 4.6, c1 - xL - 28));
  out.push(T([c1 + 1.6, r1 - 6], 'ELABORATO DA', 2), fitted([xR - 1.6, r1 - 6.3], d.author, 3.6, 20, { align: 'r' }));
  out.push(T([c1 + 1.6, r1 - 15], 'DATA', 2), fitted([xR - 1.6, r1 - 15.3], d.date, 3.6, 28, { align: 'r' }));
  // approval, revisions, logo, plant number, drawing number
  const cA = 58, cB = 118;
  out.push(L([cA, r2], [cA, y0], 0.3), L([cB, r2], [cB, r2 - 13.5], 0.2), L([cB + 16, r2], [cB + 16, r2 - 13.5], 0.2));
  out.push(T([xL + 1.2, r2 - 3], 'FIRMA PER APPROVAZIONE DEL', 1.8), T([xL + 1.2, r2 - 5.4], 'PRESENTE PROGETTO :', 1.8), T([xL + 1.2, y0 + 14.2], 'Data', 1.4));
  out.push(L([xL, y0 + 10.5], [cA, y0 + 10.5], 0.3), L([xL, y0 + 4.2], [cA, y0 + 4.2], 0.2), L([xL + 23, y0], [xL + 23, y0 + 4.2], 0.2));
  out.push(T([xL + 1.2, y0 + 6], 'DIS. N°', 1.8), fitted([xL + 12, y0 + 5.8], d.number, 4.6, cA - xL - 13), T([xL + 1.2, y0 + 1.3], `PAGINA N° 1/${d.pages}`, 1.7), T([xL + 24, y0 + 1.3], 'R_  __/__/__', 1.7));
  out.push(T([(cA + cB) / 2, r2 - 2.8], 'REVISIONE DISEGNO', 1.9, { align: 'c' }), T([cB + 8, r2 - 2.8], 'DATA', 1.9, { align: 'c' }), T([(cB + 16 + c1) / 2, r2 - 2.8], 'FIRMA', 1.9, { align: 'c' }));
  for (let i = 0; i < 3; i++) {
    const yr = r2 - 3.8 - i * 3.25, rev = d.revisions[i];
    out.push(L([cA, yr], [c1, yr], 0.18), T([cA + 1, yr - 2.4], `R${i + 1}`, 1.8));
    if (rev) out.push(fitted([cA + 6, yr - 2.4], rev.text, 1.8, cB - cA - 7), fitted([cB + 8, yr - 2.4], rev.date, 1.8, 15, { align: 'c' }));
  }
  out.push(L([cA + 5, r2 - 3.8], [cA + 5, r2 - 13.5], 0.18), L([cA, r2 - 13.5], [c1, r2 - 13.5], 0.3));
  if (d.logo) out.push({ t: 'image', ref: 'logo', box: { x0: cA + 3, y0: y0 + 2, x1: c1 - 3, y1: r2 - 15.5 } });
  else out.push(fitted([(cA + c1) / 2, (y0 + r2 - 13.5) / 2 - 1.5], d.company, 5, c1 - cA - 6, { align: 'c', bold: true }));
  out.push(T([(c1 + xR) / 2, r1 - 13.2], '', 1), T([(c1 + xR) / 2, r2 - 4.5], 'MATRICOLA N°', 2.6, { align: 'c' }), fitted([(c1 + xR) / 2, y0 + 8], d.plant, 7, xR - c1 - 4, { align: 'c' }));
  return out.filter((s) => s.t !== 'text' || s.text !== '');
}
