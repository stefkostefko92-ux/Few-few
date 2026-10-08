// The section «Elaborati grafici» of the relazione di calcolo (Italian): the drawing sets issued on this calculation,
// each with its number, its latest revision, its sheets and the start of its fingerprint, so that the relazione and the
// sheets point to each other. Pure.
import type { ReportBlock } from './model';

/** A drawing set issued on the calculation: its number, revision (0: the first issue), sheets, day and SHA-256. */
export interface IssuedSet {
  number: string;
  revision: number;
  pages: number;
  createdAt: Date;
  sha256: string;
}

export function elaboratiBlocks(sets: readonly IssuedSet[], when: (d: Date) => string): ReportBlock[] {
  // the latest revision of each number
  const last = [...sets.reduce((m, s) => (m.get(s.number)?.revision ?? -1) >= s.revision ? m : m.set(s.number, s), new Map<string, IssuedSet>()).values()];
  if (!last.length) {
    return [{ t: 'p', text: 'Nessuna serie di tavole è ancora emessa su questo calcolo: le tavole emesse dopo questa relazione la richiamano con il numero '
      + 'del calcolo, e la relazione va riemessa con il loro numero.' }];
  }
  return [{ t: 'grid', head: ['Tavole', 'Revisione', 'Fogli', 'Emesse il', 'Impronta SHA-256'], widths: [0.18, 0.12, 0.1, 0.3, 0.3], align: ['l', 'l', 'r', 'l', 'l'],
    rows: last.map((s) => [`DIS. N° ${s.number}`, s.revision ? `R${s.revision}` : 'prima emissione', String(s.pages), when(s.createdAt), `${s.sha256.slice(0, 16)}…`]) }];
}
