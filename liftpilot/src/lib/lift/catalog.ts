// The maker's machine the engineer picks for the proposal (src/lib/catalog/machines.ts): among the options of the
// sizing only those a machine of the catalogue takes, with the catalogue's ratio nearest the ideal one (the inverter
// brings the speed back to the rated one within KL.catalogRatioTol), the static load it allows and its mass. Pure.
import { compute } from '@/calc/compute';
import { readInputs } from '@/calc/inputs';
import { ceilTo } from '@/calc/math';
import { SHEAVE_GRID, compareOptions } from '@/calc/sizing';
import type { FormValues, SizingOption } from '@/calc/types';
import { catalogFit, catalogOf, type Brand, type CatalogFit, type CatalogMachine } from '@/lib/catalog/machines';
import { throughWallMachine } from '@/lib/catalog/mounting';
import { KL } from './norme';

export interface CatalogChoice {
  brand: Brand;
  /** one model of the brand; missing: any of them */
  model?: string;
  /** the sheave through a wall (the machine below beside the shaft, throughWall): only the long-shaft and outboard-support
   *  variants (registry impianto.basso.albero); missing: any mounting */
  wall?: boolean;
}

/** The machine below beside the shaft (the schemes head and room; none given: head): its sheave is in the shaft on the
 *  slow shaft through the wall (bottom.ts belowMachine). */
export const throughWall = (layout: unknown, scheme: string | null | undefined): boolean => layout === 'bottom' && (scheme ?? 'head') !== 'under';

/** The machines of a choice the proposal weighs: without a model those not proposed only by name; with the sheave
 *  through a wall only the long-shaft and outboard-support variants, named or not, at the static load they allow there
 *  (src/lib/catalog/mounting.ts). */
export function choiceMachines(choice: CatalogChoice): CatalogMachine[] {
  const all = catalogOf(choice.brand, choice.model);
  return choice.wall ? all.flatMap((c) => throughWallMachine(c) ?? []) : all.filter((c) => choice.model || !c.byName);
}

/** The sheaves a choice's machines take that the sizing's grid (SHEAVE_GRID) has none of: a model built with one sheave
 *  only, off the grid (FAER P80F Ø 550, Montanari M105 Ø 650) — the proposal and the advice weigh it too, so the model
 *  is proposed when it passes. */
export function offGrid(choice: CatalogChoice): number[] {
  return choiceMachines(choice)
    .flatMap((c) => {
      const s = c.sheaves;
      return s && !SHEAVE_GRID.some((D) => D >= s[0] && D <= s[1]) ? [s[0]] : [];
    });
}

/** The machine of the choice that takes an option: no failure, the lowest static load (the smallest machine), then
 *  the ratio nearest the ideal one; null when none does. Without a model, the machines proposed only by name are out. */
export function bestFit(choice: CatalogChoice, o: SizingOption, Q: number, r: number): CatalogFit | null {
  const fits = choiceMachines(choice)
    .map((c) => catalogFit(c, { D: o.D, iIdeal: o.iIdeal, Pn: o.Pn, staticKg: o.res.shaft.testKg, Q, r }, KL.catalogRatioTol))
    .filter((f) => f.fails.length === 0);
  return fits.sort((a, b) => a.machine.staticKg - b.machine.staticKg || Math.abs(a.dv) - Math.abs(b.dv))[0] ?? null;
}

/** What the machine of the catalogue sets in the calculation `V` (the sizing option's values already in it): its name
 *  (two models of equal data stay apart), its ratio, the static load it allows, its mass, and the brake per set sized
 *  again with its ratio by the sizing's rule (sizing.ts: the largest requirement, up to 5 N·m): the requirement on the
 *  motor's shaft follows the ratio, the option's brake was sized for the grid's. */
export function catalogValues(f: CatalogFit, V: FormValues): FormValues {
  const own: FormValues = {
    n_model: `${f.machine.brand} ${f.machine.model}`, n_i: Math.round(f.i * 1000) / 1000, n_shaftMax: f.machine.staticKg,
    ...(f.machine.mass !== null ? { n_mass: f.machine.mass } : {}),
  };
  const { I, N } = readInputs({ ...V, ...own }), b = compute(I, { ...N, brakeNm: 0 }).brake;
  return { ...own, n_brakeNm: ceilTo(Math.max(b.one, b.up, b.all / 2), 5) };
}

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
