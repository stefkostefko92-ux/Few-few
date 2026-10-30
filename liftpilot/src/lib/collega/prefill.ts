// What a linked survey gives the installation's forms (round 44): «Calcolo argano» and the Progetto (round 45: the
// stops, its own; round 57: the shaft's measures of the panel order too) start from the measured values where they have
// the matching input, marked «dal rilievo».
// Only an empty value is filled — in a brand new form also one still at the software's standard (in a draft a value equal
// to the standard may be the user's: it stays) —: a value the user typed is never overwritten;
// a saved record never changes (the forms seed a new record or a draft). In a brand new form nothing is the user's: a
// value the software already holds equal to the measured one (a standard, a default) is the survey's too — what was
// filled lists it, so that it is marked like the others. «Usa il valore del rilievo» (the comparison) puts one value in
// on purpose, over what the form holds, and the form says so before anything is saved. Pure.
import type { FormValues } from '@/calc/types';
import { isStandard } from '@/lib/calc-blank';
import { floorsTo } from '@/lib/lift/blank';
import type { ProgettoDraft } from '@/lib/lift/progetto';
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
    velocita: { v: num(a?.velocita ?? r.quadro?.velocita) },
    corsa: { H: num(a?.corsa ?? r.quadro?.corsa) },
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

/** The shaft's measures the panel order draws (round 57, quadro.ts): field of the Progetto → the survey's value [mm]. */
const MISURE = [['W', 'vanoW'], ['D', 'vanoD'], ['pit', 'fossa'], ['headroom', 'testata']] as const;
type Misura = (typeof MISURE)[number][0];
const misuraDi = (r: RilievoDati, k: Misura): number | null => r.quadro?.[MISURE.find(([f]) => f === k)?.[1] ?? 'vanoW'] ?? null;

/** The Progetto's values the survey gives (the badges compare with them): the stops and, from the panel order, the
 *  shaft's width and depth, the pit and the headroom — the drawing's own (round 45; the load, the speed, the roping, the
 *  machine's place and the existing machine are the «Calcolo argano»'s). */
export function semeLift(r: RilievoDati): Seme {
  const out: Record<string, string> = r.fermate !== null ? { floors: String(r.fermate) } : {};
  for (const [k] of MISURE) { const v = misuraDi(r, k); if (v !== null) out[k] = String(v); }
  return out;
}

const inRange = (x: number | null, lo: number, hi: number): x is number => x !== null && x >= lo && x <= hi;

/** One parameter into the Progetto's draft (`force`: «usa il valore», else only where it is still to enter): the stops,
 *  the only one the drawing takes from the survey. */
function liftParam(d: ProgettoDraft, r: RilievoDati, p: Usa, force: boolean): { draft: ProgettoDraft; set: string[] } {
  const S = d.progetto.shaft, blank = d.blank;
  if (p !== 'fermate' || !(force || blank.includes('floors')) || !inRange(r.fermate, 2, 60)) return { draft: d, set: [] };
  const multi = !blank.includes('entrances') && S.entrances !== 'one', f = floorsTo(S.vertical, blank, r.fermate, multi);
  return { draft: { ...d, progetto: { ...d.progetto, shaft: { ...S, vertical: f.vertical } }, blank: f.blank }, set: ['floors'] };
}

/** The shaft's measures into the Progetto's draft where they are still to enter (round 57). */
function misureIn(d: ProgettoDraft, r: RilievoDati): { draft: ProgettoDraft; set: string[] } {
  let S = d.progetto.shaft, blank = d.blank;
  const set: string[] = [];
  for (const [k] of MISURE) {
    const v = misuraDi(r, k);
    if (v === null || !blank.includes(k)) continue;
    S = k === 'W' || k === 'D' ? { ...S, [k]: v } : { ...S, vertical: { ...S.vertical, [k]: v } };
    blank = blank.filter((b) => b !== k);
    set.push(k);
  }
  return { draft: set.length ? { ...d, progetto: { ...d.progetto, shaft: S }, blank } : d, set };
}

/** The Progetto's start (new, carried over from the installation's records, its draft) with the survey's stops and
 *  shaft measures where they are still to enter; what was filled. */
export function seminaLift(d: ProgettoDraft, r: RilievoDati): { draft: ProgettoDraft; seeded: string[] } {
  const step = liftParam(d, r, 'fermate', false), misure = misureIn(step.draft, r);
  return { draft: misure.draft, seeded: [...step.set, ...misure.set] };
}

/** «Usa il valore del rilievo» in the Progetto: the stops set over what it holds (any other parameter is the «Calcolo
 *  argano»'s: nothing set). */
export const usaLift = (d: ProgettoDraft, r: RilievoDati, p: Usa): { draft: ProgettoDraft; set: string[] } => liftParam(d, r, p, true);

/** The survey's value of a calculator's field: the ropes kept in place, and the machine kept («Argano: No», round 46:
 *  the existing one, src/lib/calc-resta.ts), go in the new machine's fields too. */
export const valoreCalc = (seme: Seme, id: string): string | undefined => seme[id] ?? (id.startsWith('n_') ? seme[`o_${id.slice(2)}`] : undefined);

/** A field of the Progetto as its mark reads it (field ids of semeLift): what is still to enter is empty — its
 *  placeholder is not a value. */
export function valoreLift(d: ProgettoDraft, id: string): unknown {
  if (d.blank.some((b) => b === id)) return '';
  const S = d.progetto.shaft;
  return id === 'floors' ? S.vertical.floors.length : id === 'W' || id === 'D' ? S[id] : id === 'pit' || id === 'headroom' ? S.vertical[id] : '';
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
