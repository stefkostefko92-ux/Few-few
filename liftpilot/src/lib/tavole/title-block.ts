// The title block at the foot of sheet 1 (client and its logo, location, author, date, the client's approval, the
// revisions from R0, the company's logo or name, the plant number, the drawing number, the designer's stamp and
// signature) and the band over it (dimensions in mm to be checked on site, the failed checks, the records the set goes
// with). Its words that change from set to set are fields: the sheet letters them, a CAD file makes them the attributes
// of its title block (cad/set-export.ts). Paper millimetres, y up.
import { DIMENSIONS_NOTE, FRAME, fitted, type Pt, type Shape } from '@/drawing';

export interface TitleData {
  client: string;
  location: readonly [string, string];
  author: string;
  date: string;
  /** R1, R2 … with their note and date (dd/mm/yyyy) */
  revisions: readonly { mark: string; text: string; date: string }[];
  number: string;
  pages: number;
  plant: string;
  company: string;
  logo: boolean;
  /** the client's logo beside its name */
  clientLogo?: boolean;
  /** the date of the first issue (R0); null for a draft, which is not issued */
  first?: string | null;
}

/** A word of the title block that changes from set to set: its tag (the CAD attribute), where and how it is lettered,
 *  the most it may take, its text. */
export interface TitleField {
  tag: string;
  prompt: string;
  at: Pt;
  size: number;
  width: number;
  align: 'l' | 'c' | 'r';
  bold?: boolean;
  text: string;
}

/** The note of the first issue in the revisions' table. */
export const FIRST_ISSUE = 'PRIMA EMISSIONE';
/** The rows of the revisions' table: the last ones, R0 first while it fits. */
const REV_ROWS = 4, REV_H = 2.9, REV_HEAD = 3.8;

const L = (a: Pt, b: Pt, w = 0.25): Shape => ({ t: 'line', a, b, s: { ink: 'ink', w } });
const T = (at: Pt, text: string, size: number, o: Partial<Extract<Shape, { t: 'text' }>> = {}): Shape => ({ t: 'text', at, text, size, cond: true, ...o });
const box = (x0: number, y0: number, x1: number, y1: number, w = 0.3): Shape => ({ t: 'path', pts: [[x0, y0], [x1, y0], [x1, y1], [x0, y1]], closed: true, s: { ink: 'ink', w } });

/** The revisions as the table lists them: R0 (the first issue) and the revisions, the last `REV_ROWS`. */
export function revisionRows(d: Pick<TitleData, 'revisions' | 'first'>): { mark: string; text: string; date: string }[] {
  const all = [...(d.first ? [{ mark: 'R0', text: FIRST_ISSUE, date: d.first }] : []), ...d.revisions];
  return all.slice(-REV_ROWS);
}

/** The revision a set is at, as the drawing number's cell and the strip of every sheet write it: "R2 12/07/2026", "R0
 *  08/10/2026" for a first issue; '' for a draft (the cell keeps its blanks to fill by hand). */
export function currentRevision(d: Pick<TitleData, 'revisions' | 'first'>): string {
  const last = d.revisions.at(-1);
  return last ? `${last.mark} ${last.date}` : d.first ? `R0 ${d.first}` : '';
}

interface Grid {
  xL: number;
  xR: number;
  y0: number;
  yb: number;
  r1: number;
  r2: number;
  c1: number;
  cA: number;
  cB: number;
}

const gridOf = (yb: number): Grid => {
  const r1 = yb - 9;
  return { xL: FRAME.x0, xR: FRAME.x1, y0: FRAME.y0, yb, r1, r2: r1 - 18, c1: 150, cA: 58, cB: 118 };
};

/** The words of the title block that change from set to set, its top at `yb`. */
export function titleFields(d: TitleData, yb: number): TitleField[] {
  const { xL, xR, y0, r1, c1, cA, cB } = gridOf(yb), r2 = r1 - 18, clientW = d.clientLogo ? 40 : 0;
  const f = (tag: string, prompt: string, at: Pt, size: number, width: number, text: string, align: TitleField['align'] = 'l', bold = false): TitleField =>
    ({ tag, prompt, at, size, width, align, text, ...(bold ? { bold } : {}) });
  const out: TitleField[] = [
    f('COMMITTENTE', 'Committente', [xL + 26, r1 + 2.6], 5, c1 - xL - 28 - clientW, d.client),
    f('MATRICOLA', 'Numero di matricola', [(c1 + xR) / 2, r1 + 1.5], 4.6, xR - c1 - 4, d.plant, 'c'),
    f('UBICAZIONE_1', 'Ubicazione (via)', [xL + 26, r1 - 6.4], 4.6, c1 - xL - 28, d.location[0]),
    f('UBICAZIONE_2', 'Ubicazione (comune)', [xL + 26, r1 - 14.6], 4.6, c1 - xL - 28, d.location[1]),
    f('ELABORATO_DA', 'Elaborato da', [xR - 1.6, r1 - 6.3], 3.6, 20, d.author, 'r'),
    f('DATA', 'Data', [xR - 1.6, r1 - 15.3], 3.6, 28, d.date, 'r'),
    f('DIS_N', 'Numero del disegno', [xL + 12, y0 + 5.8], 4.6, cA - xL - 13, d.number),
    f('PAGINA', 'Pagina', [xL + 1.2, y0 + 1.3], 2, 21, `PAGINA N° 1/${d.pages}`),
    f('REVISIONE', 'Revisione', [xL + 24, y0 + 1.3], 2, cA - xL - 25, currentRevision(d) || 'R_  __/__/__'),
  ];
  revisionRows(d).forEach((rev, i) => {
    const y = r2 - REV_HEAD - i * REV_H - 2.15;
    out.push(f(`REV_${i + 1}`, `Revisione ${i + 1}`, [cA + 1, y], 2, 4, rev.mark), f(`REV_${i + 1}_NOTA`, `Revisione ${i + 1}: nota`, [cA + 6, y], 2, cB - cA - 7, rev.text),
      f(`REV_${i + 1}_DATA`, `Revisione ${i + 1}: data`, [cB + 8, y], 2, 15, rev.date, 'c'));
  });
  if (!d.logo) out.push(f('AZIENDA', 'Azienda', [(cA + c1) / 2, (y0 + revBottom(r2)) / 2 - 1.5], 5, c1 - cA - 6, d.company, 'c', true));
  return out.filter((x) => x.text !== '');
}

/** The foot of the revisions' table. */
const revBottom = (r2: number): number => r2 - REV_HEAD - REV_ROWS * REV_H;

/** The title block's lines, labels and logos, its top at `yb` (the fields apart: titleFields). */
export function titleFrame(d: Pick<TitleData, 'logo' | 'clientLogo'>, yb: number): Shape[] {
  const { xL, xR, y0, r1, r2, c1, cA, cB } = gridOf(yb), out: Shape[] = [], tb = revBottom(r2);
  out.push(box(xL, y0, xR, yb, 0.3), L([xL, r1], [xR, r1], 0.3), L([xL, r2], [xR, r2], 0.3), L([c1, yb], [c1, y0], 0.3), L([c1, r1 - 9], [xR, r1 - 9], 0.2));
  // the client and its logo at the end of the row; the plant number beside them
  out.push(T([xL + 1.6, r1 + 3], 'COMMITTENTE :', 2), T([c1 + 1.4, yb - 2.6], 'MATRICOLA N°', 2));
  if (d.clientLogo) out.push({ t: 'image', ref: 'client', box: { x0: c1 - 40, y0: r1 + 1, x1: c1 - 2, y1: yb - 1 } });
  out.push(T([xL + 1.6, r1 - 6], 'UBICAZIONE :', 2), T([c1 + 1.6, r1 - 6], 'ELABORATO DA', 2), T([c1 + 1.6, r1 - 15], 'DATA', 2));
  // the client's approval, the drawing number, the page and the revision
  out.push(L([cA, r2], [cA, y0], 0.3), T([xL + 1.2, r2 - 3], 'FIRMA PER APPROVAZIONE DEL', 2), T([xL + 1.2, r2 - 5.6], 'PRESENTE PROGETTO :', 2));
  out.push(T([xL + 1.2, y0 + 11.3], 'Data', 2), L([xL, y0 + 10.5], [cA, y0 + 10.5], 0.3), L([xL, y0 + 4.2], [cA, y0 + 4.2], 0.2), L([xL + 23, y0], [xL + 23, y0 + 4.2], 0.2));
  out.push(T([xL + 1.2, y0 + 6], 'DIS. N°', 2));
  // the revisions from R0, the last ones
  out.push(T([(cA + cB) / 2, r2 - 2.8], 'REVISIONE DISEGNO', 2, { align: 'c' }), T([cB + 8, r2 - 2.8], 'DATA', 2, { align: 'c' }), T([(cB + 16 + c1) / 2, r2 - 2.8], 'FIRMA', 2, { align: 'c' }));
  for (let i = 0; i <= REV_ROWS; i++) out.push(L([cA, r2 - REV_HEAD - i * REV_H], [c1, r2 - REV_HEAD - i * REV_H], i === REV_ROWS ? 0.3 : 0.18));
  out.push(L([cA + 5, r2 - REV_HEAD], [cA + 5, tb], 0.18), L([cB, r2], [cB, tb], 0.2), L([cB + 16, r2], [cB + 16, tb], 0.2));
  if (d.logo) out.push({ t: 'image', ref: 'logo', box: { x0: cA + 3, y0: y0 + 1.5, x1: c1 - 3, y1: tb - 1.5 } });
  // the designer's stamp and signature: the cell under the date
  out.push(T([(c1 + xR) / 2, r2 - 3.2], 'TIMBRO E FIRMA DEL PROGETTISTA', 2, { align: 'c' }));
  return out;
}

/** The title block at the foot of sheet 1, its top at `yb`: the frame and its fields lettered. */
export function titleBlock(d: TitleData, yb: number): Shape[] {
  return [...titleFrame(d, yb), ...titleFields(d, yb).map((x) => fitted(x.at, x.text, x.size, x.width, { align: x.align, ...(x.bold ? { bold: true } : {}) }))];
}

/** The band over the title block: dimensions in mm to be checked on site, the checks that do not pass (the designer
 *  decides the issue; the table says which), the records the set goes with. Its height: REF_BAND_H. */
export const REF_BAND_H = 7.4;

export function refBand(yTop: number, failed: number, refs: string | null): Shape[] {
  const { xL, xR } = gridOf(0), y1 = yTop - 3, y2 = yTop - 6.2, out: Shape[] = [box(xL, yTop - REF_BAND_H, xR, yTop, 0.3)];
  out.push(fitted([xL + 1.4, y1], DIMENSIONS_NOTE, 2.3, 100, { bold: true }));
  if (failed > 0) out.push(fitted([xR - 1.4, y1], `VERIFICHE NON SUPERATE: ${failed} — VEDI TABELLA`, 2.3, 88, { align: 'r', bold: true }));
  if (refs) out.push(fitted([xL + 1.4, y2], refs, 2, xR - xL - 2.8));
  return out;
}
