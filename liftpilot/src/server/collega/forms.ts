import 'server-only';
// Where the installation's forms start from its reference survey (round 44): the replacement's calculator and the one
// form of a whole project (/progetto) take the measured values where they are still empty — a new form or its draft,
// never a saved record opened again —, and «usa il valore del rilievo» (?usa=<parametro>, from the comparison) puts one
// value in on purpose. Nothing is saved here: the form shows what came from the survey and the user saves it or not.
import type { FormValues } from '@/calc/types';
import type { SessionUser } from '@/lib/auth';
import type { LiftDraft } from '@/lib/lift/blank';
import { fmt } from '@/lib/rilievi/fmt';
import { isUsa, seminaCalc, seminaLift, semeCalc, semeLift, usaCalc, usaLift, type Usa } from '@/lib/collega/prefill';
import type { RilievoDati } from '@/lib/collega/rilievo';
import type { OrigineRilievo } from '@/components/collega/origine';
import { rilievoDiRiferimento } from './queries';

/** «Usa il valore del rilievo» as the form's notice says it: the parameter, the fields it set, what the main one held. */
export interface UsaFatto {
  param: Usa;
  set: string[];
  prima: string | null;
}

export interface Avvio<T> {
  start: T;
  rilievo: RilievoDati | null;
  origine: OrigineRilievo | null;
  /** the fields filled from the survey at the start */
  seeded: string[];
  usa: UsaFatto | null;
}

const prima = (V: FormValues, set: readonly string[]): string | null => {
  const v = set[0] ? V[set[0]] : undefined;
  return v === undefined || String(v).trim() === '' ? null : String(v);
};

/** The calculator's start (`fresh`: a new calculation or its draft — not a saved one opened again). */
export async function avvioCalc(user: SessionUser, projectId: string, start: FormValues, fresh: boolean, usa: unknown): Promise<Avvio<FormValues>> {
  const r = await rilievoDiRiferimento(user, projectId);
  if (!r) return { start, rilievo: null, origine: null, seeded: [], usa: null };
  const seme = semeCalc(r), seeded = fresh ? seminaCalc(start, seme) : { values: start, seeded: [] };
  let values = seeded.values, done: UsaFatto | null = null;
  if (isUsa(usa)) {
    const u = usaCalc(values, r, usa);
    done = { param: usa, set: u.set, prima: prima(values, u.set) };
    values = u.values;
  }
  return { start: values, rilievo: r, origine: { date: fmt.day(r.data), valori: seme }, seeded: seeded.seeded, usa: done };
}

/** The one form's start (`fresh`: new, carried over or its draft — not a saved design opened again). */
export async function avvioLift(user: SessionUser, projectId: string, start: LiftDraft, fresh: boolean, usa: unknown): Promise<Avvio<LiftDraft>> {
  const r = await rilievoDiRiferimento(user, projectId);
  if (!r) return { start, rilievo: null, origine: null, seeded: [], usa: null };
  const seeded = fresh ? seminaLift(start, r) : { draft: start, seeded: [] };
  let draft = seeded.draft, done: UsaFatto | null = null;
  if (isUsa(usa)) {
    const u = usaLift(draft, r, usa);
    const before = u.set[0] === 'Qkg' ? (draft.blank.includes('Qkg') ? null : String(draft.inputs.shaft.Q ?? ''))
      : u.set[0] === 'floors' ? (draft.blank.includes('floors') ? null : String(draft.inputs.shaft.vertical.floors.length))
        : u.set[0] === 'v' ? (draft.blank.includes('v') ? null : String(draft.inputs.shaft.vertical.v))
          : prima(draft.inputs.calc, u.set);
    done = { param: usa, set: u.set, prima: before || null };
    draft = u.draft;
  }
  return { start: draft, rilievo: r, origine: { date: fmt.day(r.data), valori: semeLift(r) }, seeded: seeded.seeded, usa: done };
}
