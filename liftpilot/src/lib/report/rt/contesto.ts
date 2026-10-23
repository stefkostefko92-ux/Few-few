// What the document of a relazione tecnica di modifica is built from (RtDocInput: the record as issued — number,
// revisions, the registry, the project, the plant and the company as printed, the inputs, the files in their order —
// with the RT engine's derivation on the reproduced base) and the context every section of the builder reads: the
// derivation, the base, its test, the number formats and texts of the calculator, the section counter. Pure.
import calcIt from '../../../../messages/calc/it.json';
import type { SheetImage } from '@/drawing';
import { NORMA_SIGLA, type Collaudo } from '../../lift/collaudo';
import type { Plant } from '../../plant';
import { textsFor } from '../../present/texts';
import { makePres, type Pres } from '../../present/tr';
import type { Anagrafica } from '../../rt/anagrafica';
import type { RtInputs } from '../../rt/input';
import type { RtAllegato, RtBase, RtDerived, SezioneKey } from '../../rt/types';
import type { ReportBlock } from '../model';

/** A revision of the RT as its record keeps it: R0 (the first issue), R1…, the day (YYYY-MM-DD) and the note. */
export interface RevisioneRt {
  mark: string;
  text: string;
  date: string;
}

export interface RtDocInput {
  /** «26-004» once issued; null: the preview's draft (no number, BOZZA, the files not appended) */
  number: string | null;
  revision: number;
  /** the whole history, R0 first; none: the draft's one row */
  revisions: readonly RevisioneRt[];
  project: { name: string; address: string | null; city: string | null; province: string | null; plantNumber: string | null; client: string | null };
  company: { name: string; city?: string | null; logo?: SheetImage | null };
  anagrafica: Anagrafica;
  plant: Plant;
  inputs: RtInputs;
  /** the files of the RT in their order (position 1..40) */
  allegati: readonly RtAllegato[];
  /** the RT engine's derivation on the base reproduced by the running engines (src/lib/rt/derive.ts) */
  derived: RtDerived;
  /** the drawing sets issued on the base up to the RT's issue (immutable: the same list at every download) — cited,
   *  never appended —, each with the data of the installation it was issued with (named when they differ) */
  sets?: readonly { number: string; revision: number; sha256?: string; plant?: Plant }[];
}

export interface Ctx {
  r: RtDocInput;
  d: RtDerived;
  base: RtBase;
  C: Collaudo;
  /** the edition of the part of UNI 10411 of the modification, as the documents cite it */
  sigla: string;
  P: Pres;
  X: ReturnType<typeof textsFor>;
  fmt: Pres['fmt'];
  /** the sections in the RT */
  sezioni: readonly SezioneKey[];
  /** the next section's heading, numbered */
  h2(title: string): ReportBlock;
  /** the title of a section of the document by its key (for the cross-references) */
  titolo(k: keyof typeof SEZIONI_DOC): string;
}

/** The fixed sections of the document (the component ones have their titles in src/lib/rt/sezioni.ts). */
export const SEZIONI_DOC = {
  impianto: 'impianto', oggetto: 'oggetto', riferimenti: 'riferimenti', primaDopo: 'primaDopo', regole: 'regole', strutture: 'strutture',
  esito: 'esito', adempimenti: 'adempimenti', allegati: 'allegati', firme: 'firme',
} as const;

export function contestoDoc(r: RtDocInput, titoli: Readonly<Record<keyof typeof SEZIONI_DOC, string>>): Ctx {
  const P = makePres(calcIt, 'it-IT'), d = r.derived;
  let n = 0;
  return {
    r, d, base: d.base, C: d.base.collaudo, sigla: NORMA_SIGLA[d.norma], P, X: textsFor(P), fmt: P.fmt, sezioni: d.sezioni.map((s) => s.key),
    h2: (title) => { n += 1; return { t: 'h2', text: `${n}. ${title}` }; },
    titolo: (k) => titoli[k],
  };
}
