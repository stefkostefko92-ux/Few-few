// The report as layout-free blocks: written and formatted in TypeScript, drawn by report/relazione.py.
import type { Fill, PlanLayer, Pt } from '@/shaft';

export type BlockStatus = 'ok' | 'warn' | 'fail' | 'info' | '';

/** A drawing element in plan millimetres, y up; texts sit on their baseline, turned by `angle` radians. */
export type PlanItem =
  | { k: 'poly'; layer: PlanLayer; pts: readonly Pt[]; closed: boolean; fill?: Fill }
  | { k: 'line'; layer: PlanLayer; a: Pt; b: Pt }
  | { k: 'text'; layer: PlanLayer; at: Pt; h: number; text: string; align: 'l' | 'c' | 'r'; angle: number };

export type ReportBlock =
  | { t: 'h1'; text: string }
  | { t: 'sub'; text: string }
  | { t: 'h2'; text: string }
  | { t: 'h3'; text: string }
  | { t: 'p'; text: string; style?: 'note' }
  | { t: 'box'; text: string }
  | { t: 'kv'; rows: [string, string][] }
  | { t: 'grid'; head: string[]; rows: string[][]; status?: BlockStatus[]; statusCol?: number; widths?: number[]; align?: ('l' | 'r')[] }
  | { t: 'list'; items: string[] }
  | { t: 'verdict'; text: string; status: BlockStatus }
  | { t: 'sign'; labels: string[] }
  /** a plan to a standard scale that fits the page width and `maxHeight` [mm]; `scale` has {n} for the scale number */
  | { t: 'plan'; items: PlanItem[]; bounds: { minX: number; minY: number; maxX: number; maxY: number }; maxHeight: number; scale: string };

export interface ReportDoc {
  meta: { title: string; subject: string; author: string; header: string; footer: string; code: string };
  blocks: ReportBlock[];
}
