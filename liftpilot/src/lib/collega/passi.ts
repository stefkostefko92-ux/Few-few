// The way of an installation from its survey to its documents (round 44): 1 Rilievo → 2 Calcolo argano → 3 Progetto →
// 4 Documenti e ordini, each with its state from the records — «fatto», «da fare», «da aggiornare» (the record is older
// than the survey it should read — the reference survey written or changed after it —, or the running engines no longer
// reproduce it) or «differenze» (the record says otherwise than the survey about what exists on site, confronto.ts).
// «Documenti e ordini» are the documents of the saved records — the relazione and the order draft of the calculation (a
// replacement) or of the design (a whole project), the drawing set when issued —: done when they can be downloaded, to
// update when a record they come from is no longer reproduced or the set issued is older than the latest record. For a
// role that does not see the surveys nothing is judged against the survey: only whether one is linked. Pure.

export type StatoPasso = 'fatto' | 'daFare' | 'daAggiornare' | 'differenze';

export interface Record {
  createdAt: Date;
  /** the running engines no longer reproduce it (src/server/records.ts outdated) */
  old: boolean;
}

export interface PassiInput {
  /** the reference survey: when it was last written (null: none, or not read — a role that does not see the surveys) */
  rilievo: { updatedAt: Date } | null;
  /** a survey is linked, for a role that does not see the surveys (default: whether `rilievo` is there) */
  collegato?: boolean;
  /** the latest calculation and the latest design (a whole project's lift design, a replacement's machine room) */
  calcolo: Record | null;
  progetto: Record | null;
  /** the latest drawing set issued */
  tavole: { createdAt: Date } | null;
  /** the record says otherwise than the survey on site (confronto.ts erroriDi) */
  erroriCalcolo: number;
  erroriProgetto: number;
}

export interface Passi {
  rilievo: StatoPasso;
  calcolo: StatoPasso;
  progetto: StatoPasso;
  documenti: StatoPasso;
}

/** Older than the survey it should read: the survey was written or changed after the record. */
export const piuVecchio = (rec: { createdAt: Date }, rilievo: { updatedAt: Date } | null): boolean => !!rilievo && rilievo.updatedAt.getTime() > rec.createdAt.getTime();

function statoDi(rec: Record | null, rilievo: PassiInput['rilievo'], errori: number): StatoPasso {
  if (!rec) return 'daFare';
  if (errori > 0) return 'differenze';
  return rec.old || piuVecchio(rec, rilievo) ? 'daAggiornare' : 'fatto';
}

/** The documents' state: none without a saved record; to update when a record they come from is no longer reproduced
 *  (its documents are not served, src/server/records.ts) or the set issued is older than the latest record. */
function documentiDi(x: PassiInput): StatoPasso {
  const records = [x.calcolo, x.progetto].filter((r): r is Record => r !== null);
  if (records.length === 0) return 'daFare';
  const latest = Math.max(...records.map((r) => r.createdAt.getTime()));
  return records.some((r) => r.old) || (x.tavole && x.tavole.createdAt.getTime() < latest) ? 'daAggiornare' : 'fatto';
}

export function passi(x: PassiInput): Passi {
  return {
    rilievo: (x.collegato ?? !!x.rilievo) ? 'fatto' : 'daFare',
    calcolo: statoDi(x.calcolo, x.rilievo, x.erroriCalcolo),
    progetto: statoDi(x.progetto, x.rilievo, x.erroriProgetto),
    documenti: documentiDi(x),
  };
}

/** Why a calculation is «da aggiornare» on the home page: the engines changed, the survey is newer — or both. */
export function calcoloDaAggiornare(calc: Record | null, rilievo: PassiInput['rilievo']): { old: boolean; rilievo: boolean } | null {
  if (!calc) return null;
  const r = piuVecchio(calc, rilievo);
  return calc.old || r ? { old: calc.old, rilievo: r } : null;
}
