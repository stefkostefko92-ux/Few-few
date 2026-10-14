// The intervention declared in «Calcolo argano» (round 45): «Solo argano» — the machine replaced (and, when needed, its
// ropes) on an existing lift; «Ammodernamento» — more parts replaced or changed, each answered yes or no, the existing
// sling kept or not; «Trasformazione completa» — the whole lift designed and tested as new. The first two are
// modifications of the existing lift (DPR 162/1999, art. 2 c.1 lett. cc)), tested to UNI 10411-1 or -11 (a check applies
// when the intervention touches what it checks); the third is tested to UNI EN 81-20/50, every check applies. Keeping
// the existing sling is the site practice that keeps a renovation a modification (registry impianto.rifacimento;
// research, chapter 16 §3.2 and §5.3). The type is a fact of the calculation record (Calculation.intervento, outside its
// hash, like the test); the calculation's context and the acceptance test it stores follow it. Records saved before the
// type existed are read by their shape (interventoDi). The one form's three choices of round 27 keep their names with
// «Legacy» until /progetto stops choosing the intervention. Pure.
import type { FormValues } from '@/calc/types';
import { NORME_AGGIUNTIVE, PARTI, ammessa, collaudoOf, esistenteOf, type Collaudo, type NormaAggiuntiva, type NormaCollaudo, type Parte } from './collaudo';
import { SOSTANZIALE } from './norme-collaudo';

/** The three types, as the database's enum names them (TipoIntervento, migration 21): no mapping between the two. */
export const TIPI_INTERVENTO = ['SOLO_ARGANO', 'AMMODERNAMENTO', 'TRASFORMAZIONE_COMPLETA'] as const;
export type TipoIntervento = (typeof TIPI_INTERVENTO)[number];
export const isTipoIntervento = (x: unknown): x is TipoIntervento => TIPI_INTERVENTO.some((t) => t === x);

/** What a «Solo argano» can replace: the machine, and the ropes when they go with it. */
export const PARTI_SOLO: readonly Parte[] = ['machine', 'ropes'];

/** What a renovation replaces: every part but the sling, which stays as it is (a change of speed, rated load or travel
 *  is answered when there is one). */
export const PARTI_RIFACIMENTO: readonly Parte[] = ['machine', 'ropes', 'car', 'cw', 'rails', 'landingDoors', 'carDoors', 'buffers', 'governor', 'controller'];

/** What the survey of the machine room verifies: the machine, its ropes and the control panel in the room. */
export const PARTI_LOCALE: readonly Parte[] = ['machine', 'ropes', 'controller'];

/** The parts that change a lift without being replaced: speed, rated load, travel. */
export const VARIAZIONI: readonly Parte[] = ['speed', 'load', 'travel'];

/** What the Progetto of a step draws: the survey of the existing machine room, or the whole shaft. */
export type Disegno = 'locale' | 'vano';

/** The calculation's context of a type: a new lift for the transformation, a replacement otherwise. */
export const contestoDi = (t: TipoIntervento): 'new' | 'repl' => (t === 'TRASFORMAZIONE_COMPLETA' ? 'new' : 'repl');

const subset = (a: readonly Parte[], of: readonly Parte[]): boolean => a.every((p) => of.includes(p));
const isUni = (n: NormaCollaudo | undefined): n is '10411-1' | '10411-11' => n === '10411-1' || n === '10411-11';

/** The type of a record saved before it was declared, read by its shape: the calculation's context and its test as
 *  stored (collaudoReadSchema-parsed or normalised; null: none chosen). A new lift or a test to EN 81-20/50 is a
 *  transformation (a replacement tested as new is one); the renovation keeping the sling a modernisation; the machine
 *  with its ropes (and a load the documented loads changed) a «Solo argano», as is a replacement with nothing chosen;
 *  anything else a modernisation. */
export function interventoDi(context: unknown, C: Collaudo | null | undefined): TipoIntervento {
  if (context === 'new' || C?.norma === 'en81') return 'TRASFORMAZIONE_COMPLETA';
  if (C?.rifacimento) return 'AMMODERNAMENTO';
  if (!C || (C.parti.includes('machine') && subset(C.parti, ['machine', 'ropes', 'load']))) return 'SOLO_ARGANO';
  return 'AMMODERNAMENTO';
}

const aggiunteFor = (prev: Collaudo | undefined, base: NormaCollaudo): { aggiuntive?: readonly NormaAggiuntiva[] } => {
  const a = NORME_AGGIUNTIVE.filter((n) => prev?.aggiuntive?.includes(n) && ammessa(n, base));
  return a.length ? { aggiuntive: a } : {};
};

/** The parts a modification chose before: none when the previous test was one as new (its parts are every part by the
 *  rule, not answers). */
const scelte = (prev: Collaudo | undefined): readonly Parte[] => (prev && prev.norma !== 'en81' ? prev.parti : []);

/** What choosing a type sets: the calculation's context and the test. The transformation is tested to EN 81-20/50 with
 *  every part; a «Solo argano» replaces the machine (and its ropes when they were among the parts), under the part of
 *  UNI 10411 chosen before (-1 otherwise), never as a renovation; a modernisation starts from the parts chosen before
 *  with the machine (which can then be answered «No»), a renovation staying one. Switching never loses the answer
 *  about the CE marking, the service day or the documented loads; the standards added stay where they fit the base. */
export function interventoTo(t: TipoIntervento, prev?: Collaudo): { values: FormValues; collaudo: Collaudo } {
  const known = esistenteOf(prev);
  if (t === 'TRASFORMAZIONE_COMPLETA') return { values: { context: 'new' }, collaudo: { norma: 'en81', parti: PARTI, ...known, ...aggiunteFor(prev, 'en81') } };
  const norma: NormaCollaudo = isUni(prev?.norma) ? prev.norma : '10411-1', was = scelte(prev);
  if (t === 'SOLO_ARGANO') {
    const parti = PARTI.filter((p) => p === 'machine' || (p === 'ropes' && was.includes('ropes')));
    return { values: { context: 'repl' }, collaudo: { norma, parti, ...known, ...aggiunteFor(prev, norma) } };
  }
  const rif = prev?.rifacimento && prev.norma !== 'en81' ? { rifacimento: true as const } : {};
  return { values: { context: 'repl' }, collaudo: { norma, parti: PARTI.filter((p) => p === 'machine' || was.includes(p)), ...rif, ...known, ...aggiunteFor(prev, norma) } };
}

/** The renovation that keeps the existing sling turned on or off in a modernisation. On: every part but the sling,
 *  the changes of speed, load and travel as answered, new ropes free of those in place. Off: the machine alone, the
 *  ropes' number and diameter in place. The part of UNI 10411, the standards added and what is known of the lift stay. */
export function rifacimentoTo(on: boolean, C: Collaudo): { values: FormValues; collaudo: Collaudo } {
  const norma: NormaCollaudo = isUni(C.norma) ? C.norma : '10411-1', rest = { ...esistenteOf(C), ...aggiunteFor(C, norma) };
  if (!on) return { values: { keepRopes: true }, collaudo: { norma, parti: ['machine'], ...rest } };
  const parti = PARTI.filter((p) => PARTI_RIFACIMENTO.includes(p) || (VARIAZIONI.includes(p) && C.parti.includes(p)));
  return { values: { keepRopes: false }, collaudo: { norma, parti, rifacimento: true, ...rest } };
}

/** What the type, the calculation's values and the test chosen disagree on (the keys of the save's error; none: they
 *  agree). The base EN 81-20/50 is the transformation's (it can be added to a modification as a standard); speed and
 *  travel make a modernisation of what would be a «Solo argano»; the load is never chosen there (the documented loads
 *  may bring it: a warning, not a refusal). */
export function interventoValido(t: TipoIntervento | null | undefined, V: FormValues, chosen: Collaudo | null | undefined): string[] {
  if (!t) return ['intervento'];
  const out = new Set<string>();
  if ((t === 'TRASFORMAZIONE_COMPLETA') !== (V.context === 'new')) out.add('context');
  if (t === 'TRASFORMAZIONE_COMPLETA') {
    if (chosen && chosen.norma !== 'en81') out.add('norma');
    if (chosen?.rifacimento) out.add('rifacimento');
    return [...out];
  }
  if (!chosen || !isUni(chosen.norma)) return [...out, 'norma'];
  const P = chosen.parti, has = (p: Parte): boolean => P.includes(p);
  if (t === 'SOLO_ARGANO') {
    if (!has('machine') || !subset(P, PARTI_SOLO)) out.add('parti');
    if (chosen.rifacimento) out.add('rifacimento');
  } else if (!P.length || (!chosen.rifacimento && has('machine') && subset(P, PARTI_SOLO))) out.add('parti');
  if (chosen.rifacimento) {
    if (!subset(PARTI_RIFACIMENTO, P)) out.add('rifacimento');
    if (has('sling')) out.add('sling');
  }
  if (!has('machine') && V.compare) out.add('compare');
  if (!V.keepRopes && !has('ropes')) out.add('ropes');
  return [...out];
}

/** What the Progetto of a step-2 calculation draws: the survey of the machine room for a «Solo argano» and for a
 *  modernisation of the machine room's parts only (C: the test as the documents read it, collaudoOf), the whole shaft
 *  otherwise; a machine below has no machine room over the shaft. */
export const disegnoDi = (t: TipoIntervento, C: Pick<Collaudo, 'parti'>, V: FormValues): Disegno =>
  (V.layout !== 'bottom' && (t === 'SOLO_ARGANO' || (t === 'AMMODERNAMENTO' && subset(C.parti, PARTI_LOCALE))) ? 'locale' : 'vano');

/** Controller, machine, landing doors, car and sling replaced together: a substantial modification, UNI 10411-1/-11
 *  point 21.1 (the form warns and offers the transformation; the documents print the point, norme-collaudo.ts). */
export const sostanziale = (C: Pick<Collaudo, 'parti'>): boolean => SOSTANZIALE.every((p) => C.parti.includes(p));

/** A modernisation that keeps the existing machine: the calculation verifies it with the modified lift's data — no
 *  proposal, advice or order. */
export const macchinaResta = (t: TipoIntervento | null | undefined, C: Pick<Collaudo, 'parti'>): boolean => t === 'AMMODERNAMENTO' && !C.parti.includes('machine');

// ---- the one form's choices of round 27, until /progetto stops choosing the intervention (phase 3, step 6) ----

export const INTERVENTI_LEGACY = ['repl', 'rifacimento', 'new'] as const;
export type InterventoLegacy = (typeof INTERVENTI_LEGACY)[number];

/** The intervention of the one form: the calculation's context and, for a modification, the renovation chosen. */
export const interventoLegacyOf = (calc: FormValues, chosen?: Collaudo): InterventoLegacy =>
  (calc.context === 'new' ? 'new' : collaudoOf(calc, chosen).rifacimento ? 'rifacimento' : 'repl');

/** What choosing an intervention of the one form sets (round 27): the calculation's context and, when it changes, the
 *  test. The renovation ticks every part but the sling, new ropes; back to the machine's replacement, the machine alone
 *  with the ropes' number and diameter in place; a new lift keeps what was chosen, so going there and back loses
 *  nothing. */
export function interventoLegacyTo(k: InterventoLegacy, chosen?: Collaudo): { calc: FormValues; collaudo?: Collaudo } {
  if (k === 'new') return { calc: { context: 'new' } };
  const norma: NormaCollaudo = chosen && chosen.norma !== 'en81' ? chosen.norma : '10411-1';
  const added = chosen?.aggiuntive?.length ? { aggiuntive: chosen.aggiuntive } : {}, mod = esistenteOf(chosen);
  if (k === 'rifacimento') {
    return chosen?.rifacimento && chosen.norma !== 'en81' ? { calc: { context: 'repl' }, collaudo: chosen }
      : { calc: { context: 'repl', keepRopes: false }, collaudo: { norma, parti: PARTI_RIFACIMENTO, rifacimento: true, ...mod, ...added } };
  }
  return chosen?.rifacimento ? { calc: { context: 'repl', keepRopes: true }, collaudo: { norma, parti: ['machine'], ...mod, ...added } } : { calc: { context: 'repl' } };
}
