// The maker's machine the engineer picks for the proposal (src/lib/catalog/machines.ts): among the options of the
// sizing only those a machine of the catalogue takes, with the catalogue's ratio nearest the ideal one (the inverter
// brings the speed back to the rated one within KL.catalogRatioTol), the static load it allows and its mass. Pure.
import { compareOptions } from '@/calc/sizing';
import type { FormValues, SizingOption } from '@/calc/types';
import { catalogFit, catalogOf, type Brand, type CatalogFit } from '@/lib/catalog/machines';
import { KL } from './norme';

export interface CatalogChoice {
  brand: Brand;
  /** one model of the brand; missing: any of them */
  model?: string;
}

/** The machine of the choice that takes an option: no failure, the lowest static load (the smallest machine), then
 *  the ratio nearest the ideal one; null when none does. Without a model, the machines proposed only by name are out. */
export function bestFit(choice: CatalogChoice, o: SizingOption, Q: number, r: number): CatalogFit | null {
  const fits = catalogOf(choice.brand, choice.model).filter((c) => choice.model || !c.byName)
    .map((c) => catalogFit(c, { D: o.D, iIdeal: o.iIdeal, Pn: o.Pn, staticKg: o.res.shaft.testKg, Q, r }, KL.catalogRatioTol))
    .filter((f) => f.fails.length === 0);
  return fits.sort((a, b) => a.machine.staticKg - b.machine.staticKg || Math.abs(a.dv) - Math.abs(b.dv))[0] ?? null;
}

/** What the machine of the catalogue sets in the calculation: its ratio, the static load it allows, its mass. */
export const catalogValues = (f: CatalogFit): FormValues => ({
  n_i: Math.round(f.i * 1000) / 1000, n_shaftMax: f.machine.staticKg, ...(f.machine.mass !== null ? { n_mass: f.machine.mass } : {}),
});

/** The sizing's own choice among the options found: per rope diameter the fewest ropes, then the smallest sheave
 *  (with the ropes kept, `keep`: every option), then compareOptions; null when none. */
export function pickOption<T extends { o: SizingOption }>(found: readonly T[], keep: boolean): T | null {
  const first = new Map<number, T>();
  for (const x of found) {
    const y = first.get(x.o.d);
    if (!y || x.o.n < y.o.n || (x.o.n === y.o.n && x.o.D < y.o.D)) first.set(x.o.d, x);
  }
  return [...(keep ? found : first.values())].sort((a, b) => compareOptions(a.o, b.o))[0] ?? null;
}
