// The way of an installation from its survey to its documents (round 44): 1 Rilievo → 2 Calcolo argano → 3 Progetto →
// 4 Documenti e ordini, each with its state from the records — «fatto», «da fare», «da aggiornare» (the record is older
// than the survey it should read — the reference survey written or changed after it —, or the running engines no longer
// reproduce it, or the documents are older than the record they come from) or «differenze» (the record says otherwise
// than the survey about what exists on site, confronto.ts). Pure.

export type StatoPasso = 'fatto' | 'daFare' | 'daAggiornare' | 'differenze';

export interface Record {
  createdAt: Date;
  /** the running engines no longer reproduce it (src/server/records.ts outdated) */
  old: boolean;
}

export interface PassiInput {
  /** the reference survey: when it was last written */
  rilievo: { updatedAt: Date } | null;
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

export function passi(x: PassiInput): Passi {
  const latest = Math.max(x.calcolo?.createdAt.getTime() ?? 0, x.progetto?.createdAt.getTime() ?? 0);
  return {
    rilievo: x.rilievo ? 'fatto' : 'daFare',
    calcolo: statoDi(x.calcolo, x.rilievo, x.erroriCalcolo),
    progetto: statoDi(x.progetto, x.rilievo, x.erroriProgetto),
    documenti: !x.tavole ? 'daFare' : x.tavole.createdAt.getTime() < latest ? 'daAggiornare' : 'fatto',
  };
}

/** Why a calculation is «da aggiornare» on the home page: the engines changed, the survey is newer — or both. */
export function calcoloDaAggiornare(calc: Record | null, rilievo: PassiInput['rilievo']): { old: boolean; rilievo: boolean } | null {
  if (!calc) return null;
  const r = piuVecchio(calc, rilievo);
  return calc.old || r ? { old: calc.old, rilievo: r } : null;
}
