// A point the engineer checks on site under a standard, with its clause and value in our words — never the standards'
// text (CEN-CENELEC and UNI copyright; the laws are paraphrased): `confermato` when read on the official text,
// `da_verificare` when it comes from a secondary source or an interpretation. The helpers the registries of the test
// write their points with (norme-collaudo.ts, obblighi.ts). Pure.

export interface PuntoInSito {
  rif: string;
  testo: string;
  stato: 'confermato' | 'da_verificare';
  /** where it was read, for the engineer's checklist (absent: research, chapter 16) */
  fonte?: string;
}

export const ok = (rif: string, testo: string): PuntoInSito => ({ rif, testo, stato: 'confermato' });
/** read on the standard's text (2026-10-06) */
export const LETTO = 'testo della norma, letto il 2026-10-06 (punti e valori con parole nostre)';
export const lt = (rif: string, testo: string, fonte = LETTO): PuntoInSito => ({ rif, testo, stato: 'confermato', fonte });
export const dv = (rif: string, testo: string): PuntoInSito => ({ rif, testo, stato: 'da_verificare' });
