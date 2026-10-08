// Model entities: geometry in millimetres of the object (y up) with annotations that keep their size on paper
// (lettering, symbols, dimension chains). A view turns them into paper primitives at a scale.
import type { FillName, StyleName } from './style';
import type { Align, Box, Ink, Pt } from './types';

export type Side = 'top' | 'bottom' | 'left' | 'right';

export type SymbolName = 'dot' | 'tri' | 'square' | 'overUp' | 'overDown' | 'plumb' | 'box' | 'light'
  | 'socket' | 'switch' | 'vent' | 'duct' | 'hook' | 'area';

/** What changing a dimension does on the screens: the input `key` becomes base + k · (the new length) [mm]; the
 *  inputs in `also` take the values given, so that what the dimension starts from stays where it is. `value`: the real
 *  length where the drawing shortens it. `across`: a slanted length whose input moves its end along one axis while the
 *  other axis stays `across` apart, `plus` longer than the dimension (a diverting pulley's dx is the drop less the
 *  sheave's and the pulley's radii) — the input takes base + k · √((length + plus)² − across²). `pick`: a length a catalogue or a table gives (a rail's profile, a refuge
 *  space's type) is changed by choosing another entry: the input `key` takes the `set` of the option chosen. The
 *  sheets ignore it. */
export interface Edit {
  key: string;
  base: number;
  k: number;
  value?: number;
  across?: number;
  plus?: number;
  also?: readonly { key: string; value: number }[];
  pick?: { options: readonly PickOption[]; current: number };
}

/** An entry a dimension can be changed to: its name on the screens and the value its input takes. */
export interface PickOption {
  label: string;
  set: string | number;
}

/** A chain of linear dimensions measured along x or y. */
export interface Chain {
  dir: 'x' | 'y';
  /** coordinates along the measured direction [model mm], in order; two or more */
  pts: readonly number[];
  /** outside the drawing on a side, row 0 nearest to it … */
  side?: Side;
  row?: number;
  /** … or across the drawing, at this model coordinate */
  at?: number;
  /** extension lines start at this model coordinate, the element measured (one for all, or one per point; null = none,
   *  undefined = the default: outside chains from the edge of the drawing) */
  from?: number | readonly (number | null | undefined)[];
  /** points on an axis: their extension lines drawn as axes */
  axis?: readonly boolean[];
  /** text of each segment, '{v}' for the measured value; null or missing = the value */
  text?: readonly (string | null)[];
  /** what editing each segment changes (null: it cannot be changed there) */
  edit?: readonly (Edit | null)[];
  /** a chain along a line across the axes, from `o` in the unit direction `u`: its points are distances along that line,
   *  `at` is where its dimension line stands to the line's left and `from` where the extension lines start, across it
   *  (oblique.ts; `dir` and `side` are not read) */
  on?: { o: Pt; u: Pt };
  /** model boxes its lettering keeps off as off the lettering already on the sheet (what the drawing has there: a
   *  machine beside a chain); none clear, where it would go without them */
  avoid?: readonly Box[];
  /** a chain across the drawing: the model box its lettering past an end keeps inside (a room's inner faces) */
  within?: Box;
}

export type Entity =
  | { e: 'line'; a: Pt; b: Pt; st: StyleName }
  | { e: 'path'; pts: readonly Pt[]; closed: boolean; st?: StyleName; fill?: FillName }
  | { e: 'circle'; c: Pt; r: number; st?: StyleName; fill?: FillName }
  | { e: 'arc'; c: Pt; r: number; a0: number; a1: number; st: StyleName }
  /** lettering at a model point, size on paper [mm] (never under TEXT.min); `fit`: the most model length it may take
   *  (smaller when longer, down to TEXT.min); `out`: where it goes instead when even then it does not fit, on a leader
   *  back to `at` */
  | { e: 'text'; at: Pt; text: string; size?: number; angle?: number; align?: Align; bold?: boolean; ink?: Ink; halo?: boolean; fit?: number; out?: Pt }
  /** a symbol of fixed paper size at a model point */
  | { e: 'mark'; at: Pt; sym: SymbolName; size?: number }
  /** a reference in a small circle (e.g. a load P5), with a leader to the element it names — and one to each of `also`,
   *  the others of a load shared by several (the head pulleys of a machine below) */
  | { e: 'tag'; at: Pt; text: string; to?: Pt; also?: readonly Pt[] }
  | { e: 'chain'; c: Chain };

export const line = (a: Pt, b: Pt, st: StyleName = 'thin'): Entity => ({ e: 'line', a, b, st });
export const path = (pts: readonly Pt[], closed = true, st: StyleName | undefined = 'thin', fill?: FillName): Entity => ({ e: 'path', pts, closed, st, fill });
export const rect = (x0: number, y0: number, x1: number, y1: number, st: StyleName | undefined = 'thin', fill?: FillName): Entity =>
  path([[x0, y0], [x1, y0], [x1, y1], [x0, y1]], true, st, fill);
export const circle = (c: Pt, r: number, st: StyleName | undefined = 'thin', fill?: FillName): Entity => ({ e: 'circle', c, r, st, fill });
export const chain = (c: Chain): Entity => ({ e: 'chain', c });
/** An edit of a dimension: the input `key` becomes base + k · (the new length). */
export const edit = (key: string, base = 0, k = 1, also?: Edit['also']): Edit => (also ? { key, base, k, also } : { key, base, k });
/** An edit by choice: the input `key` takes the `set` of the option chosen; `current` is the one drawn (-1: none). */
export const pickEdit = (key: string, options: readonly PickOption[], current: number): Edit => ({ key, base: 0, k: 1, pick: { options, current } });
