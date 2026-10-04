// The report as layout-free blocks: written and formatted in TypeScript, drawn by report/relazione.py.
import type { DrawingDoc, ImageRef, Shape } from '@/drawing';

export type BlockStatus = 'ok' | 'warn' | 'fail' | 'info' | '';

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
  /** a view laid out by the drawing kernel: paper shapes in a box w × h [mm], and its scale in words */
  | { t: 'plan'; shapes: Shape[]; w: number; h: number; scale: string }
  /** the sender's letterhead — its logo (`drawing.images`), its name first — and the recipient's lines on the right */
  | { t: 'letterhead'; logo: ImageRef | null; from: string[]; to: string[] };

export interface ReportDoc {
  /** `notice`: a third footer line on every page (the relazione's: valid only with the technician's signature) */
  meta: { title: string; subject: string; author: string; header: string; footer: string; code: string; notice?: string };
  blocks: ReportBlock[];
  /** colours, patterns and lettering of the views (present when there is one) */
  drawing?: Pick<DrawingDoc, 'palette' | 'patterns' | 'cond' | 'images'>;
}
