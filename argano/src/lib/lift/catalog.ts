// The maker's machine the engineer picks for the proposal (src/lib/catalog/machines.ts): among the options of the
// sizing only those a machine of the catalogue takes, with the catalogue's ratio nearest the ideal one (the inverter
// brings the speed back to the rated one within KL.catalogRatioTol), the static load it allows and its mass. Pure.
import type { FormValues, SizingOption } from '@/calc/types';
import { catalogFit, catalogOf, type Brand, type CatalogFit } from '@/lib/catalog/machines';
import { KL } from './norme';

export interface CatalogChoice {
  brand: Brand;
  /** one model of the brand; missing: any of them */
  model?: string;
}

/** The machine of the choice that takes an option: no failure, the lowest static load (the smallest machine), then
 *  the ratio nearest the ideal one; null when none does. */
export function bestFit(choice: CatalogChoice, o: SizingOption, Q: number, r: number): CatalogFit | null {
  const fits = catalogOf(choice.brand, choice.model)
    .map((c) => catalogFit(c, { D: o.D, iIdeal: o.iIdeal, Pn: o.Pn, staticKg: o.res.shaft.testKg, Q, r }, KL.catalogRatioTol))
    .filter((f) => f.fails.length === 0);
  return fits.sort((a, b) => a.machine.staticKg - b.machine.staticKg || Math.abs(a.dv) - Math.abs(b.dv))[0] ?? null;
}

/** What the machine of the catalogue sets in the calculation: its ratio, the static load it allows, its mass. */
export const catalogValues = (f: CatalogFit): FormValues => ({
  n_i: Math.round(f.i * 1000) / 1000, n_shaftMax: f.machine.staticKg, ...(f.machine.mass !== null ? { n_mass: f.machine.mass } : {}),
});
