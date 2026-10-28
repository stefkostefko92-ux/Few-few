// The remedies of a check of «Calcolo argano» (round 54): the values of the form a new machine, its ropes and the car
// may take — the car's mass (ballast), the balance, the compensation, the new machine's sheave, groove, ratio, power,
// brake and ropes, the diverting pulley's place — tried on the whole calculation as the form sends it (savedValues,
// readInputs, compute: tens of microseconds, so every lever is tried both ways), with D.1 and D.2 of a changed ratio of
// the loads and the rope sheet's checks (calcExtra). A value the engine flags out of range is no remedy; one that changes
// the loads is said to ask the Progetto's checks again (CAMBIA_CARICHI: they are not this screen's). The rated load,
// the speed, the travel and the existing machine are the installation's, never levers; a machine kept («Argano: No»)
// leaves the car and the counterweight only; a catalogue's machine is not altered here (its own values are the maker's:
// the advice proposes another). Pure.
import { compute } from '@/calc/compute';
import { K } from '@/calc/norme';
import { readInputs } from '@/calc/inputs';
import type { Check, FormValues } from '@/calc/types';
import { savedValues } from '@/lib/calc-saved';
import { collaudoOf, type Collaudo } from '@/lib/lift';
import { calcExtra } from '@/lib/lift/calc-verdict';
import { senzaSostituite } from '@/lib/lift/sostituite';
import { cercaRimedi, type Opzioni } from './cerca';
import { margineCalc, margineVano } from './margine';
import type { Costo, Esito, Leva, Rimedio, Stato, Valuta } from './tipi';

interface Num { key: string; costo: Costo; passo: number; min: number; max: number; dec: number }

/** The car and the counterweight: what any calculation may change. */
const IMPIANTO: readonly Num[] = [
  { key: 'P', costo: 'componente', passo: 10, min: 50, max: 10000, dec: 0 },
  { key: 'k', costo: 'componente', passo: 0.01, min: 0.3, max: 0.7, dec: 2 },
  { key: 'qeq', costo: 'componente', passo: 5, min: 0, max: 2000, dec: 0 },
];
/** The new machine and its ropes. */
const MACCHINA: readonly Num[] = [
  { key: 'n_D', costo: 'componente', passo: 10, min: 100, max: 1200, dec: 0 },
  // the groove's angles within the standard's (UNI EN 81-50:2020, 5.11.2.3.1: β ≤ K.betaMax, γ ≥ K.gammaMinU — a V groove's
  // K.gammaMin is g_geom's, a value under it no remedy)
  { key: 'n_beta', costo: 'componente', passo: 0.5, min: 0, max: K.betaMax, dec: 1 },
  { key: 'n_gamma', costo: 'componente', passo: 0.5, min: K.gammaMinU, max: 120, dec: 1 },
  { key: 'n_i', costo: 'componente', passo: 0.5, min: 1, max: 100, dec: 1 },
  { key: 'n_Pn', costo: 'componente', passo: 0.1, min: 0.5, max: 100, dec: 1 },
  { key: 'n_brakeNm', costo: 'componente', passo: 10, min: 10, max: 20000, dec: 0 },
];
const FUNI: readonly Num[] = [
  { key: 'n_n', costo: 'componente', passo: 1, min: 2, max: 12, dec: 0 },
  { key: 'n_d', costo: 'componente', passo: 0.5, min: K.ropeDiameterMin, max: 20, dec: 1 },
  { key: 'n_Fmin', costo: 'componente', passo: 0.1, min: 10, max: 500, dec: 1 },
];
/** The diverting pulley's place under the sheave (a deflector: the wrap) and a wrap entered by hand. */
const RINVIO: readonly Num[] = [
  { key: 'dx', costo: 'componente', passo: 0.01, min: 0, max: 2, dec: 2 },
  { key: 'h', costo: 'componente', passo: 0.01, min: 0, max: 3, dec: 2 },
];
/** The compensation's tensioning pulley, with ropes (fm_comp: D/d). */
const COMPENSAZIONE: readonly Num[] = [{ key: 'compDt', costo: 'componente', passo: 10, min: 100, max: 2000, dec: 0 }];
const GOLE = ['U', 'UU', 'VH', 'VN'] as const;

const numero = (V: FormValues, id: string): number | null => {
  const x = V[id], n = typeof x === 'number' ? x : typeof x === 'string' && x.trim() !== '' ? Number(x.replace(',', '.')) : NaN;
  return Number.isFinite(n) ? n : null;
};

/** The calculation as the screen holds it: its form values and its test as it will be sent; whether the machine is
 *  kept (only the car and the counterweight then). */
export interface ContestoCalcolo {
  values: FormValues;
  collaudo: Collaudo | null;
  resta: boolean;
}

/** A calculation's result: compute()'s checks (those an extra one stands in for left out) and the extra ones; the values
 *  the engine flags; compute()'s checks (their names). */
export function esitoCalc(V: FormValues, collaudo: Collaudo | null): { esito: Esito; bad: readonly string[]; checks: readonly Check[] } {
  const S = savedValues(V), ctx = readInputs(S), res = compute(ctx.I, ctx.N), extra = calcExtra(collaudoOf(S, collaudo ?? undefined), S);
  const counted = [...senzaSostituite(res.checks, extra), ...extra].filter((c) => c.status === 'fail' || c.status === 'warn');
  return {
    esito: {
      problemi: new Map<string, Stato>(counted.map((c) => [c.id, c.status === 'fail' ? 'fail' : 'warn'])),
      margini: new Map<string, number | null>([...res.checks.map((c) => [c.id, margineCalc(c)] as const), ...extra.map((c) => [c.id, margineVano(c)] as const)]),
    },
    bad: ctx.bad,
    checks: res.checks,
  };
}

/** The calculation worked out again with the values `V`; null where the engine flags a value it did not flag before. */
export function valutaCalcolo(c: ContestoCalcolo): Valuta<FormValues> {
  const before = new Set(esitoCalc(c.values, c.collaudo).bad);
  return (V) => {
    const r = esitoCalc(V, c.collaudo);
    return r.bad.some((b) => !before.has(b)) ? null : r.esito;
  };
}

/** The decimals a lever's value is shown with. */
export const decimaliCalcolo = (key: string): number => [...IMPIANTO, ...MACCHINA, ...FUNI, ...RINVIO, ...COMPENSAZIONE].find((n) => n.key === key)?.dec ?? 0;

/** The levers that change the loads on the installation (the car's mass, the balance, the compensation) or the place
 *  of the diverting pulley: a remedy with one asks the Progetto's checks again (rails, buffers, safety gear, sling). */
export const CAMBIA_CARICHI: ReadonlySet<string> = new Set(['P', 'k', 'qeq', 'dx', 'h']);

/** The levers of the calculation: those of the car always, the new machine's unless kept or of a catalogue, its ropes
 *  unless kept, the diverting pulley's place with a deflector; `label`: a groove's name by its type. */
export function leveCalcolo(c: ContestoCalcolo, label: (id: string) => string): Leva<FormValues>[] {
  const V = c.values, catalogo = typeof V.n_model === 'string' && V.n_model.trim() !== '';
  const nums = [...IMPIANTO, ...(c.resta || catalogo ? [] : MACCHINA), ...(c.resta ? [] : FUNI), ...(!c.resta && V.layout === 'topDefl' ? RINVIO : []),
    ...(V.compTipo === 'funi' ? COMPENSAZIONE : [])];
  const leve: Leva<FormValues>[] = nums.flatMap((n): Leva<FormValues>[] => {
    const da = numero(V, n.key);
    return da === null ? [] : [{ tipo: 'num', key: n.key, costo: n.costo, da, dir: 0, passo: n.passo, min: n.min, max: n.max, set: (W, x) => ({ ...W, [n.key]: Number(x.toFixed(n.dec)) }) }];
  });
  if (!c.resta && !catalogo && typeof V.n_groove === 'string') {
    leve.push({ tipo: 'scelta', key: 'n_groove', costo: 'componente', da: V.n_groove, opzioni: GOLE.map((g) => ({ id: g, label: label(g) })), set: (W, id) => ({ ...W, n_groove: id }) });
  }
  return leve;
}

/** The remedies of check `id` of the calculation. */
export function rimediCalcolo(c: ContestoCalcolo, id: string, label: (id: string) => string, o: Opzioni = {}): Promise<Rimedio<FormValues>[]> {
  return cercaRimedi(c.values, esitoCalc(c.values, c.collaudo).esito, id, leveCalcolo(c, label), valutaCalcolo(c), { budget: 600, ogni: 40, ...o });
}
