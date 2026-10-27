// The relazione tecnica di modifica as the owner's model lays it out (round 52): a cover, then pages headed «Matricola
// n° … Commessa n° …», each component on pages of its own, a label column on the left and the lines of the component on
// the right — a text, or a value with its symbol and unit (and, our addition, the check's outcome). Layout-free blocks,
// written and formatted in TypeScript, drawn by report/fascicolo.py. Types only.
import type { ImageRef } from '@/drawing';
import type { FirmeBlock } from '../model';

export type EsitoRiga = 'ok' | 'fail' | 'warn' | 'info';

/** A line of a section's right column: a text, or a value «Etichetta  sym:  valore  unità» with its check's outcome. */
export type FRiga =
  | { t: 'testo'; s: string; b?: boolean }
  | { t: 'val'; l: string; sym?: string; v: string; u?: string; esito?: EsitoRiga };

export type FBlock =
  /** a new page (every component starts on one; a component of several pages breaks where the model does) */
  | { t: 'pagina' }
  /** the bold title under the page's header */
  | { t: 'titolo'; s: string }
  /** a section: its label on the left (bold), its lines on the right */
  | { t: 'sez'; l: string; righe: FRiga[] }
  /** a text over the whole width: bold, centred, or a note */
  | { t: 'testo'; s: string; b?: boolean; c?: boolean; nota?: boolean }
  /** a table over the whole width (head row shaded); `w` the columns' shares of the width */
  | { t: 'tab'; head: string[]; rows: string[][]; w?: number[] }
  /** vertical room [mm] */
  | { t: 'spazio'; mm: number }
  /** the cover (unnumbered): the company's logo and name, the lines «Matricola», «Proprietario», «Indirizzo
   *  installazione», the free text of the cover, «Commessa» */
  | { t: 'copertina'; logo: ImageRef | null; azienda: string; titolo: string; righe: [string, string][]; testo: string; commessa: string }
  | FirmeBlock;

export interface FascicoloDoc {
  meta: {
    title: string; subject: string; author: string;
    /** «Matricola n° …» and «Commessa n° …» on every page but the cover */
    matricola: string; commessa: string;
    /** the footer's left line (the standard of reference) and the record's code line */
    norma: string; code: string;
    /** the third footer line: valid only with the signatures */
    notice: string;
    /** the pages appended after the body (the files of the fascicolo) */
    extraPages?: number;
    /** the record's date (ISO 8601): the PDF is dated with it (report/stamp.py) */
    created?: string;
  };
  blocks: FBlock[];
  drawing?: { images?: Record<string, { mime: string; data: string }> };
}
