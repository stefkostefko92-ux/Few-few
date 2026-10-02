// What the documents say about the values the software filled in from the one form: the car mass estimated from the
// rated load, the rope lengths and distances taken from the shaft design, the machine proposed by the sizing. The
// relazione and sheet 1 of the drawing set mark them, so nobody signs an estimate as a measured value. Pure.
import type { BottomScheme } from './bottom';
import type { Collaudo } from './collaudo';
import type { AutoFlags, LiftDerived } from './derive';
import { KL } from './norme';

export type GeometryKey = 'L0' | 'dx' | 'Hv';

export interface ValueMarks {
  /** P is the estimate KL.carMassRatio · Q (registry impianto.massa.cabina) */
  pEstimate: boolean;
  /** rope lengths and distances taken from the shaft design */
  geometry: readonly GeometryKey[];
  /** the machine is the first option of the sizing */
  machineProposed: boolean;
  /** the rope scheme of a machine below, as entered (bottom.ts) */
  bottom?: BottomScheme | null;
  /** the maker's machine the proposal took (catalog.ts) */
  catalog?: { brand: string; model: string; ratio: string; staticKg: number; src: string } | null;
  /** the acceptance test's standard and the parts the intervention replaces, as the form says (collaudo.ts); null: the
   *  calculation has no lift design (the documents take the intervention's default) */
  collaudo?: Collaudo | null;
}

export const NO_MARKS: ValueMarks = { pEstimate: false, geometry: [], machineProposed: false, bottom: null, catalog: null, collaudo: null };

/**
 * From the switches of the form as saved. The machine counts as proposed only when the derivation that made the
 * calculation is known (it reproduces the stored values) and found a machine; otherwise nothing is claimed about it.
 */
export function valueMarks(auto: AutoFlags, derived: Pick<LiftDerived, 'origin' | 'catalog'> | null, bottom: BottomScheme | null = null, collaudo: Collaudo | null = null): ValueMarks {
  const f = derived?.origin.machine === 'auto' ? derived.catalog?.fit ?? null : null;
  return {
    pEstimate: auto.P,
    geometry: (['L0', 'dx', 'Hv'] as const).filter((k) => auto[k]),
    machineProposed: derived?.origin.machine === 'auto',
    bottom,
    catalog: f && f.ratio ? { brand: f.machine.brand, model: f.machine.model, ratio: f.ratio, staticKg: f.machine.staticKg, src: f.machine.src } : null,
    collaudo,
  };
}

/** How the estimate is made, in Italian words for the documents (numbers from the registry). */
export const P_ESTIMATE_RULE = `${String(KL.carMassRatio).replace('.', ',')} × portata, arrotondata per eccesso a ${KL.carMassStep} kg`;
