// The Progetto draws (round 45): what the browser sends for a drawing is the geometry only — the shaft, its floors and
// rooms, the scheme of a machine below, the switches of the drawn values and the diverting pulley's height on the plan
// (ProgettoInputs). The rated load, the speed, the machine, the ropes, the roping, the machine's place and the test come
// from the step-2 calculation it is drawn on («Calcolo argano»): the server composes the one form's inputs from the two
// (liftInputsOf) and saves them through the unchanged derivation (src/lib/lift/derive.ts). A lift design of any time is
// read back as a drawing (progettoOf); what the drawing completes of the calculation is listed (differenzeCalcolo).
// Pure.
import type { FormValues } from '@/calc/types';
import type { ShaftInputs } from '@/shaft';
import type { BottomScheme } from './bottom';
import { blankLift, type BlankKey, type LiftDraft } from './blank';
import type { Collaudo } from './collaudo';
import type { AutoFlags, LiftInputs } from './derive-types';
import { sceltaSalvata } from './risposte';
import { macchinaEsistente } from './kept';

/** The switches of the values the drawing gives (true) or the calculation keeps (false); the panel's place as before. */
export type ProgettoAuto = Pick<AutoFlags, 'L0' | 'dx' | 'Hv' | 'panel'>;

/** A drawing: the geometry of the one form, nothing of the calculation. */
export interface ProgettoInputs {
  shaft: ShaftInputs;
  auto: ProgettoAuto;
  /** the rope scheme of a machine below (bottom.ts); used when the base's machine is below */
  bottom?: BottomScheme;
  /** the diverting pulley's height under the sheave set on the plan [m] (effective with auto.dx off) */
  h?: number;
}

/** The step-2 calculation a drawing is made on: its values as stored and its test (normalised; absent: none). */
export interface BaseCalcolo {
  values: FormValues;
  collaudo?: Collaudo | null;
}

const numOf = (x: FormValues[string] | undefined): number | null => {
  const n = typeof x === 'number' ? x : typeof x === 'string' && x.trim() !== '' ? Number(x.replace(',', '.')) : NaN;
  return Number.isFinite(n) ? n : null;
};

/**
 * The one form's inputs of a drawing on its base: the shaft's rated load and speed are the calculation's (whatever the
 * browser sent), the calculation's values as stored with the plan's h on a diverting pulley (kept as stored when it
 * reads the same number), the machine and the car's mass as entered there (never proposed or estimated again), the
 * scheme of a machine below, the base's test as chosen — the changes the rule brought on the base's values left out
 * (risposte.ts sceltaSalvata, round 46): the derivation brings them again on the drawing's, its travel the drawn one;
 * no catalog.
 */
export function liftInputsOf(p: ProgettoInputs, base: BaseCalcolo): LiftInputs {
  const V = base.values, layout = V.layout, collaudo = base.collaudo ? sceltaSalvata(V, base.collaudo) : null;
  // a machine the intervention keeps (round 46, B8): L0, dx and h are the calculation's, never the drawing's (kept.ts)
  const kept = macchinaEsistente({ calc: V, collaudo });
  const h = !kept && p.h !== undefined && layout === 'topDefl' && numOf(V.h) !== p.h ? { h: p.h } : {};
  return {
    shaft: { ...p.shaft, Q: Math.round(Number(V.Q)), vertical: { ...p.shaft.vertical, v: Number(V.v) } },
    calc: { ...V, ...h },
    auto: { P: false, machine: false, L0: kept ? false : p.auto.L0, dx: kept ? false : p.auto.dx, Hv: p.auto.Hv, ...(p.auto.panel !== undefined ? { panel: p.auto.panel } : {}) },
    ...(layout === 'bottom' && p.bottom ? { bottom: p.bottom } : {}),
    ...(collaudo ? { collaudo } : {}),
  };
}

/** A lift design's inputs (of any time) as a drawing: its geometry, switches, scheme and the plan's h. */
export function progettoOf(L: LiftInputs): ProgettoInputs {
  const h = L.calc.layout === 'topDefl' ? numOf(L.calc.h) : null;
  return {
    shaft: L.shaft,
    auto: { L0: L.auto.L0, dx: L.auto.dx, Hv: L.auto.Hv, ...(L.auto.panel !== undefined ? { panel: L.auto.panel } : {}) },
    ...(L.bottom ? { bottom: L.bottom } : {}),
    ...(h !== null ? { h } : {}),
  };
}

/** A lift design's own calculation and test as a base (tests: the round trip of a design). */
export const baseOf = (L: LiftInputs): BaseCalcolo => ({ values: L.calc, ...(L.collaudo ? { collaudo: L.collaudo } : {}) });

/** The keys the calculation holds, never to enter in the drawing. */
const DAL_CALCOLO: readonly BlankKey[] = ['Q', 'Qkg', 'v', 'r', 'layout'];

/** The drawing as it is being filled in: its geometry and the values still to enter (none of the calculation's). */
export interface ProgettoDraft {
  progetto: ProgettoInputs;
  blank: readonly BlankKey[];
}

/** The values still to enter without the calculation's (the base holds them). */
export const soloDisegno = (blank: readonly BlankKey[]): BlankKey[] => blank.filter((k) => !DAL_CALCOLO.includes(k));

/** The drawing as the one form's draft on its base: what the shared helpers of the form (blank.ts, panel-form.ts) and the
 *  derivation read. */
export const composto = (d: ProgettoDraft, base: BaseCalcolo): LiftDraft => ({ inputs: liftInputsOf(d.progetto, base), blank: d.blank });

/** A one form's draft changed by those helpers, as a drawing again: its geometry, switches and scheme, the plan's h of
 *  the drawing kept as it was (the base's own is not the drawing's). */
export function dalComposto(L: LiftDraft, h: number | undefined): ProgettoDraft {
  const { h: _h, ...rest } = progettoOf(L.inputs);
  void _h;
  return { progetto: { ...rest, ...(h !== undefined ? { h } : {}) }, blank: soloDisegno(L.blank) };
}

/** The switches of a drawing started anew on its base: the rope beyond the travel and a machine below's pulleys from the
 *  drawing, the diverting pulley's distance from the plan only for a transformation (an existing lift keeps the one its
 *  calculation measured), the panel placed by the software. */
export const autoNuovo = (base: BaseCalcolo): ProgettoAuto => ({ L0: true, dx: base.values.context === 'new', Hv: true, panel: true });

/** A brand new drawing: every value of the geometry still to enter (blankLift without the calculation's keys), the
 *  drawn values on. */
export function blankProgetto(): { progetto: ProgettoInputs; blank: BlankKey[] } {
  const d = blankLift(), a = d.inputs.auto;
  return {
    progetto: { shaft: d.inputs.shaft, auto: { L0: a.L0, dx: a.dx, Hv: a.Hv, ...(a.panel !== undefined ? { panel: a.panel } : {}) } },
    blank: d.blank.filter((k) => !DAL_CALCOLO.includes(k)),
  };
}

export type DifferenzaKey = 'H' | 'L0' | 'dx' | 'h' | 'Hv' | 'nps';
export interface Differenza {
  key: DifferenzaKey;
  /** the base calculation's value (nps: with the drawing's extra head pulleys) */
  base: number | null;
  /** the drawing's */
  drawn: number | null;
  differs: boolean;
}

/** How far apart two values read the same on the screen [m]: the travel to the centimetre, the rope beyond the travel
 *  and the pulleys' height of a machine below to 5 cm, the diverting pulley's distance and height to 5 mm (display
 *  tolerances, not values of a standard). */
export const TOLLERANZE: Readonly<Record<Exclude<DifferenzaKey, 'nps'>, number>> = { H: 0.01, L0: 0.05, dx: 0.005, h: 0.005, Hv: 0.05 };

/**
 * What the drawing completes of the base calculation: the travel and the rope beyond it, the diverting pulley's
 * distance and height (topDefl), the head pulleys' height of a machine below (bottom), each with the base's value, the
 * drawing's and whether they differ beyond the screen's tolerance; and the extra bends — the base's with the head pulleys
 * of the drawn scheme (`headPulleys`: 2 + extra bends, 0 without a machine below) against the drawing's, never a
 * difference by itself (the scheme adds them).
 */
export function differenzeCalcolo(base: FormValues, drawn: FormValues, headPulleys: number): Differenza[] {
  const layout = base.layout;
  const keys: Exclude<DifferenzaKey, 'nps'>[] = ['H', 'L0', ...(layout === 'topDefl' ? (['dx', 'h'] as const) : []), ...(layout === 'bottom' ? (['Hv'] as const) : [])];
  const rows: Differenza[] = keys.map((key) => {
    const a = numOf(base[key]), b = numOf(drawn[key]);
    return { key, base: a, drawn: b, differs: a === null || b === null ? a !== b : Math.abs(a - b) > TOLLERANZE[key] + 1e-9 };
  });
  const extra = headPulleys > 0 ? headPulleys - 2 : 0, nps = numOf(base.nps);
  rows.push({ key: 'nps', base: nps === null ? null : nps + extra, drawn: numOf(drawn.nps), differs: false });
  return rows;
}
