// The section «Elaborati grafici» of the relazione di calcolo (Italian): the drawing sets issued on this calculation,
// each with its number, its latest revision, its sheets and the start of its fingerprint, so that the relazione and the
// sheets point to each other. The relazione tecnica of a replacement lists its attachments by the same rule: the
// revision in force of each number, in the order of the year and the number (round 37). Pure.
import type { ReportBlock } from './model';

/** A drawing set issued on the calculation: its number, revision (0: the first issue), sheets, day and SHA-256. */
export interface IssuedSet {
  number: string;
  revision: number;
  pages: number;
  createdAt: Date;
  sha256: string;
}

/** The latest revision of each number, in the order the numbers first come (the queries give them by year, number and
 *  revision): a superseded revision is not an attachment. */
export const latestRevisions = <T extends { number: string; revision: number }>(sets: readonly T[]): T[] =>
  [...sets.reduce((m, s) => ((m.get(s.number)?.revision ?? -1) >= s.revision ? m : m.set(s.number, s)), new Map<string, T>()).values()];

/** A revision as the relazioni write it: the first issue, else R1, R2… */
export const revisionText = (revision: number): string => (revision ? `R${revision}` : 'prima emissione');

export function elaboratiBlocks(sets: readonly IssuedSet[], when: (d: Date) => string): ReportBlock[] {
  const last = latestRevisions(sets);
  if (!last.length) {
    return [{ t: 'p', text: 'Nessuna serie di tavole è ancora emessa su questo calcolo: le tavole emesse dopo questa relazione la richiamano con il numero '
      + 'del calcolo, e la relazione va riemessa con il loro numero.' }];
  }
  return [{ t: 'grid', head: ['Tavole', 'Revisione', 'Fogli', 'Emesse il', 'Impronta SHA-256'], widths: [0.18, 0.12, 0.1, 0.3, 0.3], align: ['l', 'l', 'r', 'l', 'l'],
    rows: last.map((s) => [`DIS. N° ${s.number}`, revisionText(s.revision), String(s.pages), when(s.createdAt), `${s.sha256.slice(0, 16)}…`]) }];
}
