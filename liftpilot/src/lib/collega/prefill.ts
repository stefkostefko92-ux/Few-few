// What a linked survey gives the installation's forms (round 44): the replacement's calculator and the one form of a
// whole project (/progetto) start from the measured values where they have the matching input, marked «dal rilievo».
// Only an empty value is filled — in a brand new form also one still at the software's standard (in a draft a value equal
// to the standard may be the user's: it stays) —: a value the user typed is never overwritten;
// a saved record never changes (the forms seed a new record or a draft). In a brand new form nothing is the user's: a
// value the software already holds equal to the measured one (a standard, a default) is the survey's too — what was
// filled lists it, so that it is marked like the others. «Usa il valore del rilievo» (the comparison) puts one value in
// on purpose, over what the form holds, and the form says so before anything is saved. Pure.
import type { FormValues } from '@/calc/types';
import { isStandard } from '@/lib/calc-blank';
import { filled, floorsTo, layoutTo, type LiftDraft } from '@/lib/lift/blank';
import { isLiftStandard } from '@/lib/lift/defaults';
import { stessoValore } from './formato';
import type { RilievoDati } from './rilievo';

/** A value the survey gives a field of a form, as the form holds it: field id → value. */
export type Seme = Readonly<Record<string, string>>;

/** The parameters «usa il valore del rilievo» may put into a form (the comparison's rows with an input). */
export const USA = ['Q', 'fermate', 'posizione', 'taglia', 'velocita', 'corsa', 'pesoCabina', 'funiNumero', 'funiDiametro', 'puleggia', 'rapporto', 'potenza',
  'giri', 'poli'] as const;
export type Usa = (typeof USA)[number];
export const isUsa = (x: unknown): x is Usa => typeof x === 'string' && (USA as readonly string[]).includes(x);

/** The machine's place as the calculator's layout: below; above with or without a diverting pulley when the argano sheet
 *  says which («Puleggia di rinvio»: a diameter or «sì» — with; «no» — without); otherwise not known (null). */
export function layoutDi(r: RilievoDati): 'top' | 'topDefl' | 'bottom' | null {
  if (r.posizione === 'BASSO') return 'bottom';
  if (r.posizione !== 'ALTO') return null;
  const rinvio = r.argano?.rinvio?.toLowerCase() ?? '';
  // «sì» as the sheets write it: a word boundary after «ì» is not one for \b (a non-ASCII letter)
  if (r.argano?.rinvioD || /^s[iì](?![\p{L}\p{N}])|^presente/u.test(rinvio)) return 'topDefl';
  if (/^no\b|^assente|^senza/.test(rinvio)) return 'top';
  return null;
}

const num = (n: number | null | undefined): string | null => (n === null || n === undefined || !Number.isFinite(n) ? null : String(n));

/** Each parameter and the calculator's fields it fills (a replacement: the existing machine is «o_»). */
function campiCalc(r: RilievoDati): Partial<Record<Usa, Record<string, string | null>>> {
  const a = r.argano, layout = layoutDi(r);
  return {
    Q: { Q: num(r.portataKg) },
    posizione: { layout },
    taglia: { r: a?.taglia ? String(a.taglia) : null },
    velocita: { v: num(a?.velocita) },
    corsa: { H: num(a?.corsa) },
    pesoCabina: { P: num(a?.pesoCabina) },
    funiNumero: { o_n: num(r.funiNumero) },
    funiDiametro: { o_d: num(r.funiDiametroMm) },
    puleggia: { o_D: num(a?.puleggia), Dp: num(a?.rinvioD), o_gamma: num(a?.cuneo) },
    rapporto: { o_i: num(a?.rapporto) },
    potenza: { o_Pn: num(a?.potenzaKw) },
    giri: { o_nm: num(a?.giri) },
    poli: { o_poles: a?.poli ? String(a.poli) : null },
  };
}

/** Every value the survey gives the calculator (field → value). */
export function semeCalc(r: RilievoDati): Seme {
  const out: Record<string, string> = {};
  for (const fields of Object.values(campiCalc(r))) for (const [id, v] of Object.entries(fields)) if (v !== null) out[id] = v;
  return out;
}

const blankOr = (V: FormValues, id: string, std: (V: FormValues, id: string) => boolean): boolean => String(V[id] ?? '').trim() === '' || std(V, id);
const never = (): boolean => false;

/** The ropes in place a replacement keeps, entered in the new machine's fields when the old machine is not compared. */
const ropesInPlace = (V: FormValues): boolean => V.context === 'repl' && !!V.keepRopes && !V.compare;

/** The calculator over its start: the survey's values where the field is empty — or, `overStandard` (a brand new
 *  calculation, nothing of the user's), still at the software's standard or already equal to the survey's; what was
 *  filled, by field. */
export function seminaCalc(V: FormValues, seme: Seme, overStandard = true): { values: FormValues; seeded: string[] } {
  const out: Record<string, FormValues[string]> = { ...V }, seeded: string[] = [];
  const put = (id: string, v: string | undefined): void => {
    if (v === undefined || seeded.includes(id)) return;
    if (String(out[id] ?? '') === v) { if (overStandard) seeded.push(id); return; }
    if (!blankOr(out, id, overStandard ? isStandard : never)) return;
    out[id] = v;
    seeded.push(id);
  };
  for (const [id, v] of Object.entries(seme)) put(id, v);
  if (ropesInPlace(out)) { put('n_n', seme.o_n); put('n_d', seme.o_d); }
  return { values: out, seeded };
}

/** «Usa il valore del rilievo» in the calculator: the parameter's fields set to the survey's values, whatever they held. */
export function usaCalc(V: FormValues, r: RilievoDati, p: Usa): { values: FormValues; set: string[] } {
  const fields = campiCalc(r)[p] ?? {}, out: Record<string, FormValues[string]> = { ...V }, set: string[] = [];
  for (const [id, v] of Object.entries(fields)) if (v !== null) { out[id] = v; set.push(id); }
  // the machine above with no word on its diverting pulley: above, without one until the designer says otherwise
  if (p === 'posizione' && r.posizione === 'ALTO' && fields.layout === null && V.layout === 'bottom') { out.layout = 'top'; set.push('layout'); }
  if (ropesInPlace(out)) for (const [o, n] of [['o_n', 'n_n'], ['o_d', 'n_d']] as const) if (set.includes(o)) { out[n] = out[o]; set.push(n); }
  return { values: out, set };
}

/** The one form's values the survey gives (the badges compare with them): the load, the stops, the place of the machine,
 *  the roping, the speed, the existing machine and its ropes. */
export function semeLift(r: RilievoDati): Seme {
  const calc = semeCalc(r), out: Record<string, string> = {};
  for (const id of ['layout', 'r', 'o_n', 'o_d', 'o_D', 'o_gamma', 'o_i', 'o_Pn', 'o_nm', 'o_poles']) if (calc[id] !== undefined) out[id] = calc[id];
  if (calc.Q !== undefined) out.Qkg = calc.Q;
  if (calc.v !== undefined) out.v = calc.v;
  if (r.fermate !== null) out.floors = String(r.fermate);
  return out;
}

const inRange = (x: number | null, lo: number, hi: number): x is number => x !== null && x >= lo && x <= hi;

/** One parameter into the one form's draft (`force`: «usa il valore», else only where it is still to enter — the existing
 *  machine's fields also at the software's standard when `overStandard`). */
function liftParam(d: LiftDraft, r: RilievoDati, p: Usa, force: boolean, overStandard = true): { draft: LiftDraft; set: string[] } {
  const S = d.inputs.shaft, C = d.inputs.calc, blank = d.blank, open = (k: 'Q' | 'floors' | 'layout' | 'r' | 'v'): boolean => force || blank.includes(k);
  const withCalc = (patch: FormValues, keys: readonly ('layout' | 'r')[] = []) => ({ ...d, inputs: { ...d.inputs, calc: { ...C, ...patch } }, blank: filled(blank, keys) });
  const a = r.argano;
  switch (p) {
    case 'Q':
      if (!open('Q') || !inRange(r.portataKg, 100, 10000)) break;
      return { draft: { ...d, inputs: { ...d.inputs, shaft: { ...S, Q: Math.round(r.portataKg) } }, blank: filled(blank, ['Q', 'Qkg']) }, set: ['Qkg'] };
    case 'fermate': {
      if (!open('floors') || !inRange(r.fermate, 2, 60)) break;
      const multi = !blank.includes('entrances') && S.entrances !== 'one', f = floorsTo(S.vertical, blank, r.fermate, multi);
      return { draft: { ...d, inputs: { ...d.inputs, shaft: { ...S, vertical: f.vertical } }, blank: f.blank }, set: ['floors'] };
    }
    case 'posizione': {
      const known = layoutDi(r), next = known ?? (force && r.posizione === 'ALTO' && C.layout === 'bottom' ? 'top' : null);
      if (!open('layout') || !next) break;
      return { draft: { ...d, inputs: { ...d.inputs, calc: { ...C, layout: next } }, blank: layoutTo(String(C.layout ?? ''), blank, next) }, set: ['layout'] };
    }
    case 'taglia':
      if (!open('r') || !a?.taglia) break;
      return { draft: withCalc({ r: String(a.taglia) }, ['r']), set: ['r'] };
    case 'velocita':
      if (!open('v') || !inRange(a?.velocita ?? null, 0.1, 10)) break;
      return { draft: { ...d, inputs: { ...d.inputs, shaft: { ...S, vertical: { ...S.vertical, v: a?.velocita ?? S.vertical.v } } }, blank: filled(blank, ['v']) }, set: ['v'] };
    default: {
      // the existing machine and its ropes: the calculation's fields of the one form (a value already equal: the
      // survey's in a brand new form, and «usa» says it is in) — only when its intervention replaces the machine of the
      // existing lift (context 'repl'); a new lift has no existing machine: nothing goes into its hidden fields
      if (C.context !== 'repl') break;
      const take = (id: string, v: string): boolean => (String(C[id] ?? '') === v ? force || overStandard : force || blankOr(C, id, overStandard ? isLiftStandard : never));
      const fields = Object.entries(campiCalc(r)[p] ?? {}).flatMap(([id, v]): [string, string][] => (v !== null && id.startsWith('o_') && take(id, v) ? [[id, v]] : []));
      if (fields.length === 0) break;
      return { draft: withCalc(Object.fromEntries(fields)), set: fields.map(([id]) => id) };
    }
  }
  return { draft: d, set: [] };
}

/** The one form's start (new — `overStandard` —, carried over from the replacement, its draft) with the survey's values
 *  where they are still to enter; what was filled. */
export function seminaLift(d: LiftDraft, r: RilievoDati, overStandard = true): { draft: LiftDraft; seeded: string[] } {
  let draft = d;
  const seeded: string[] = [];
  for (const p of ['Q', 'fermate', 'posizione', 'taglia', 'velocita', 'funiNumero', 'funiDiametro', 'puleggia', 'rapporto', 'potenza', 'giri', 'poli'] as const) {
    const step = liftParam(draft, r, p, false, overStandard);
    draft = step.draft;
    seeded.push(...step.set);
  }
  return { draft, seeded };
}

/** «Usa il valore del rilievo» in the one form: the parameter set over what it holds. */
export const usaLift = (d: LiftDraft, r: RilievoDati, p: Usa): { draft: LiftDraft; set: string[] } => liftParam(d, r, p, true);

/** The survey's value of a calculator's field: the ropes kept in place go in the new machine's fields too. */
export const valoreCalc = (seme: Seme, id: string): string | undefined => seme[id] ?? (id === 'n_n' ? seme.o_n : id === 'n_d' ? seme.o_d : undefined);

/** A field of the one form as its mark reads it (field ids of semeLift): what is still to enter is empty — its
 *  placeholder is not a value. */
export function valoreLift(d: LiftDraft, id: string): unknown {
  const S = d.inputs.shaft, open = (k: string): boolean => (d.blank as readonly string[]).includes(k);
  switch (id) {
    case 'Qkg': return open('Q') || open('Qkg') || S.Q === null ? '' : S.Q;
    case 'floors': return open('floors') ? '' : S.vertical.floors.length;
    case 'v': return open('v') ? '' : S.vertical.v;
    case 'layout': case 'r': return open(id) ? '' : d.inputs.calc[id];
    default: return d.inputs.calc[id];
  }
}

/** The marks «dal rilievo» of a form: of the fields given (filled at the start, put in by «usa», kept marked by its
 *  draft), those whose value is the survey's — field → the survey's value. */
export function segnati(ids: Iterable<string>, valore: (id: string) => string | undefined, attuale: (id: string) => unknown): Seme {
  const out: Record<string, string> = {};
  for (const id of ids) {
    const v = valore(id);
    if (v !== undefined && stessoValore(attuale(id), v)) out[id] = v;
  }
  return out;
}
