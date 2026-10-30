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

/**
 * The signatures of the relazione tecnica di modifica, kept together on one page: columns side by side (who drew it up,
 * who checked it), each a title, its lines and an empty box w × h [mm] for the hand — the signature, the stamp — under
 * its label. Not a ReportBlock: the Word writer of the order and the documents' readers switch over ReportBlock to the
 * last case; a document that carries it is a `ReportDoc<PdfBlock>`, which only the PDF renderer draws.
 */
export interface FirmeBlock {
  t: 'firme';
  cols: { title: string; lines: string[]; box: { label: string; w: number; h: number } }[];
}

/** Every block report/relazione.py draws. */
export type PdfBlock = ReportBlock | FirmeBlock;

export interface ReportDoc<B extends PdfBlock = ReportBlock> {
  /**
   * `notice`: a third footer line on every page (the relazione's: valid only with the technician's signature).
   * `extraPages`: the pages appended after the body (the attachments of a fascicolo, report/pdf-tool.mjs), which
   * «Pagina k di N» counts. `fascicolo`: a line drawn on page 1 under the header, `{B}` the body's pages, `{A}` the
   * appended ones, `{N}` all of them (known only once the body is laid out).
   */
  meta: {
    title: string; subject: string; author: string; header: string; footer: string; code: string; notice?: string;
    extraPages?: number; fascicolo?: string;
  };
  blocks: B[];
  /** colours, patterns and lettering of the views (present when there is one) */
  drawing?: Pick<DrawingDoc, 'palette' | 'patterns' | 'cond' | 'images'>;
}
