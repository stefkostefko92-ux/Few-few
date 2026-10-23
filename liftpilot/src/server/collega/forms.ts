import 'server-only';
// Where the installation's forms start from its reference survey (round 44): «Calcolo argano» and the Progetto
// (/progetto, round 45: only the stops — the rest is the calculation's) take the measured values where they are still empty — a new form or its draft,
// never a saved record opened again —, and «usa il valore del rilievo» (?usa=<parametro>, from the comparison) puts one
// value in on purpose. A brand new form also takes them over the software's standard values; a draft or what was
// carried over from saved records is the user's: only its empty fields. Only for whoever sees the surveys (the right
// 'rilievi:view'): another role's form starts as it would without a survey — nothing seeded, marked or named. Nothing
// is saved here: the form shows what came from the survey and the user saves it or not. Marked «dal rilievo» are only
// the fields whose value came from the survey — filled now, put in by «usa», or kept marked by the form's draft while
// still the survey's —, never a value of a saved calculation that happens to equal it; the notice «parte dal rilievo»
// only when the form starts from the survey (src/components/collega/RilievoAvviso.tsx): filled now, or kept marked by a
// draft that itself started from it — a value put in by «usa» on a saved calculation continued stays marked in its
// draft, but never makes the form one that starts from the survey.
import type { FormValues } from '@/calc/types';
import type { SessionUser } from '@/lib/auth';
import { can } from '@/lib/rbac';
import type { ProgettoDraft } from '@/lib/lift/progetto';
import { fmt } from '@/lib/rilievi/fmt';
import { stessoValore } from '@/lib/collega/formato';
import { dividiIndirizzo } from '@/lib/collega/testo';
import { isUsa, segnati, seminaCalc, seminaLift, semeCalc, semeLift, usaCalc, usaLift, valoreCalc, valoreLift, type Usa } from '@/lib/collega/prefill';
import type { RilievoDati } from '@/lib/collega/rilievo';
import type { OrigineRilievo } from '@/components/collega/origine';
import { rilievoDiRiferimento } from './queries';

/** «Usa il valore del rilievo» as the form's notice says it: the parameter, the fields it set, what the main one held
 *  when it was something else (null: empty, or already the survey's value) and what it holds now (null: nothing set) —
 *  the machine's place as the form has it (with or without the diverting pulley), not the survey's «in alto». */
export interface UsaFatto {
  param: Usa;
  set: string[];
  prima: string | null;
  messo: string | null;
}

export interface Avvio<T> {
  start: T;
  rilievo: RilievoDati | null;
  /** the marks «dal rilievo»: only the fields whose value came from the survey (`parte`: the form starts from it) */
  origine: OrigineRilievo | null;
  /** the fields the form starts from the survey with (filled now, or kept marked by a draft that started from it): none
   *  — the form does not start from the survey (a saved calculation continued, «usa» on it, its draft), and its notice
   *  does not say it does */
  seeded: string[];
  usa: UsaFatto | null;
}

/** How a form starts: `new` — nothing of the user's yet (the survey's values also over the software's standards);
 *  `draft` — a draft or values carried over from saved records (only the empty fields); null — a saved record opened again. */
export type Partenza = 'new' | 'draft' | null;

const none = <T>(start: T): Avvio<T> => ({ start, rilievo: null, origine: null, seeded: [], usa: null });

/** What the form's draft kept of the survey (src/lib/draft-input.ts): the fields still marked «dal rilievo», and whether
 *  the form started from it (only then do they say it again). Read only for a draft (mode 'draft'). */
export interface Kept {
  rilievo?: readonly string[];
  parte?: boolean;
}

/** The marks of a form's start and the fields it starts from the survey with: filled now (`filled`), or kept by a draft
 *  (`kept`) — marked again while still the survey's; a start from the survey only when that draft started from it. */
function avvioSegni(filled: readonly string[], kept: Kept, valore: (id: string) => string | undefined, attuale: (id: string) => unknown) {
  const ids = kept.rilievo ?? [];
  return { dal: Object.keys(segnati([...filled, ...ids], valore, attuale)), parte: Object.keys(segnati([...filled, ...(kept.parte ? ids : [])], valore, attuale)) };
}

/** What the main field held before «usa»: nothing when it was empty or already the value put in. */
const prima = (before: unknown, after: unknown): string | null => {
  const b = String(before ?? '').trim();
  return b === '' || stessoValore(b, after) ? null : b;
};

/** «Usa il valore del rilievo» on the installation's data (?usa=indirizzo|matricola, from the comparison): the field of
 *  the edit form it goes in, the reference survey's value and day — only for whoever sees the surveys (as the forms
 *  above: another role's edit form is the installation's own data, nothing named from a survey). */
export interface UsaDati {
  field: 'address' | 'plantNumber';
  value: string;
  date: string;
  /** the municipality and province the survey writes last in its address, to their own fields (round 46) */
  extra: { city?: string; province?: string };
}

export async function usaDatiImpianto(user: SessionUser, projectId: string, usa: unknown): Promise<UsaDati | null> {
  if ((usa !== 'indirizzo' && usa !== 'matricola') || !can(user, 'rilievi:view')) return null;
  const r = await rilievoDiRiferimento(user, projectId);
  const parti = dividiIndirizzo(r?.indirizzo), value = r ? (usa === 'indirizzo' ? parti.via || null : r.matricola) : null;
  const extra = usa === 'indirizzo' ? { ...(parti.citta ? { city: parti.citta } : {}), ...(parti.provincia ? { province: parti.provincia } : {}) } : {};
  return r && value ? { field: usa === 'indirizzo' ? 'address' : 'plantNumber', value, date: fmt.day(r.data), extra } : null;
}

/** The calculator's start (`kept`: what its draft kept of the survey). A transformation (a new lift, round 45) has no
 *  existing machine: the survey's machine and ropes («o_…») are not seeded there. */
export async function avvioCalc(user: SessionUser, projectId: string, start: FormValues, mode: Partenza, usa: unknown,
  kept: Kept = {}): Promise<Avvio<FormValues>> {
  const r = can(user, 'rilievi:view') ? await rilievoDiRiferimento(user, projectId) : null;
  if (!r) return none(start);
  const tutto = semeCalc(r), nuovo = start.context === 'new';
  const seme = nuovo ? Object.fromEntries(Object.entries(tutto).filter(([id]) => !id.startsWith('o_'))) : tutto;
  const valore = (id: string): string | undefined => valoreCalc(seme, id);
  const seeded = mode ? seminaCalc(start, seme, mode === 'new') : { values: start, seeded: [] };
  let values = seeded.values, done: UsaFatto | null = null;
  const { dal, parte } = avvioSegni(seeded.seeded, mode === 'draft' ? kept : {}, valore, (id) => values[id]);
  if (isUsa(usa)) {
    const u = usaCalc(values, r, usa), main = u.set[0];
    done = { param: usa, set: u.set, prima: main ? prima(values[main], u.values[main]) : null, messo: main ? String(u.values[main] ?? '') : null };
    values = u.values;
  }
  const valori = segnati([...dal, ...(done?.set ?? [])], valore, (id) => values[id]);
  return { start: values, rilievo: r, origine: { date: fmt.day(r.data), valori, parte: parte.length > 0 }, seeded: parte, usa: done };
}

/** The Progetto's start (`kept`: what its draft kept of the survey): the survey's stops. */
export async function avvioProgetto(user: SessionUser, projectId: string, start: ProgettoDraft, mode: Partenza, usa: unknown,
  kept: Kept = {}): Promise<Avvio<ProgettoDraft>> {
  const r = can(user, 'rilievi:view') ? await rilievoDiRiferimento(user, projectId) : null;
  if (!r) return none(start);
  const seme = semeLift(r), valore = (id: string): string | undefined => seme[id];
  const seeded = mode ? seminaLift(start, r) : { draft: start, seeded: [] };
  let draft = seeded.draft, done: UsaFatto | null = null;
  const { dal, parte } = avvioSegni(seeded.seeded, mode === 'draft' ? kept : {}, valore, (id) => valoreLift(draft, id));
  if (isUsa(usa)) {
    const u = usaLift(draft, r, usa), main = u.set[0];
    done = { param: usa, set: u.set, prima: main ? prima(valoreLift(draft, main), valoreLift(u.draft, main)) : null,
      messo: main ? String(valoreLift(u.draft, main) ?? '') : null };
    draft = u.draft;
  }
  const valori = segnati([...dal, ...(done?.set ?? [])], valore, (id) => valoreLift(draft, id));
  return { start: draft, rilievo: r, origine: { date: fmt.day(r.data), valori, parte: parte.length > 0 }, seeded: parte, usa: done };
}
