// «Porta nel calcolo» (round 45): what a drawing gives back to its «Calcolo argano». The drawing completes the
// calculation's geometry — the travel from its floors, the rope beyond the travel, the diverting pulley's distance and
// height, the head pulleys' height of a machine below — each where its switch takes the drawing's value; the
// calculator opened with ?dal=progetto takes exactly those, marked «dal progetto» with the value they replace. Never
// the extra bends (the drawing counts the head pulleys of a machine below again: never copied), never the machine,
// the rated load, the speed or the car's mass (the calculation's own). Nothing is saved until the calculation is.
// And the largest car the drawn shaft takes, for the panel that compares the two. Pure.
import type { FormValues } from '@/calc/types';
import { layout, type ShaftInputs } from '@/shaft';
import type { AutoFlags } from './derive-types';

export type PortaKey = 'H' | 'L0' | 'dx' | 'h' | 'Hv';

/** The calculation's values a drawing gives (in the form's order): the travel always; the rope beyond it with its
 *  switch on; on a diverting pulley its distance with the switch on, its height with the switch on or set on the plan
 *  (`planH`); a machine below's head pulleys' height with its switch on. */
export function chiaviDelDisegno(layoutOf: unknown, auto: Pick<AutoFlags, 'L0' | 'dx' | 'Hv'>, planH = false): PortaKey[] {
  const defl = layoutOf === 'topDefl';
  return [
    'H', ...(auto.L0 ? (['L0'] as const) : []), ...(defl && auto.dx ? (['dx'] as const) : []), ...(defl && (auto.dx || planH) ? (['h'] as const) : []),
    ...(layoutOf === 'bottom' && auto.Hv ? (['Hv'] as const) : []),
  ];
}

/** The calculation's values with the drawing's, the marks of the values brought (as the form holds them) and the value
 *  each replaced where it held another. */
export interface Portato {
  values: FormValues;
  valori: Record<string, string>;
  prima: Record<string, string>;
}

const scritto = (x: FormValues[string] | undefined): string => (x === undefined || x === null ? '' : String(x).trim());
const numero = (s: string): number => Number(s.replace(',', '.'));
/** The same value however written ('18', '18.0', 18). */
const uguali = (a: string, b: string): boolean => a === b || (a !== '' && b !== '' && Number.isFinite(numero(a)) && numero(a) === numero(b));

/** The values `V` of a calculation with the drawing's derived values `drawn` for `keys` (chiaviDelDisegno); a key the
 *  drawing has no number for stays as it was. */
export function portaNelCalcolo(V: FormValues, drawn: FormValues, keys: readonly PortaKey[]): Portato {
  const values: Record<string, FormValues[string]> = { ...V }, valori: Record<string, string> = {}, prima: Record<string, string> = {};
  for (const k of keys) {
    const d = drawn[k], s = scritto(d);
    if (s === '' || !Number.isFinite(numero(s))) continue;
    const before = scritto(V[k]);
    values[k] = typeof d === 'number' ? d : s;
    valori[k] = s;
    if (before !== '' && !uguali(before, s)) prima[k] = before;
  }
  return { values, valori, prima };
}

/** The rated load of the largest car the drawn shaft takes [kg] (the car's size left to the software, whatever load
 *  the calculation has), for the panel that compares the drawing with its calculation. */
export function cabinaMassima(shaft: ShaftInputs): number {
  const plan = { ...(shaft.plan ?? {}) };
  delete plan.A;
  delete plan.B;
  return layout({ ...shaft, Q: null, plan }).Q;
}
