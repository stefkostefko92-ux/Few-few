// The report as layout-free blocks: written and formatted in TypeScript, drawn by report/relazione.py.
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
  | { t: 'sign'; labels: string[] };

export interface ReportDoc {
  meta: { title: string; subject: string; author: string; header: string; footer: string; code: string };
  blocks: ReportBlock[];
}
