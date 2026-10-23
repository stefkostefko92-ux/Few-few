// The catalogue's machine a calculation's values are, and the maker's model whose mass the loads on the building count
// (registry impianto.massa.argano): one rule for the relazione, sheet 1, the derivation of a lift design and the
// replacement's machine room, so that the same machine weighs the same on every path — the one form's proposal from a
// catalogue, a machine entered by hand (taken from the advice into the calculator, carried into a whole design), the
// replacement. Pure.
import type { FormValues, Machine, Plant } from '@/calc/types';
import { MACHINES, ratioValue, type Brand, type CatalogFit, type CatalogMachine } from '@/lib/catalog/machines';
import { throughWallMachine } from '@/lib/catalog/mounting';
import type { Made } from './machine';

/** The makers the advice compares (advice.ts), the first the recognition of a machine ranks among equal data. */
export const ADVICE_BRANDS: readonly Brand[] = ['SICOR', 'Montanari'];

/** The maker and model taken from the advice into the calculator's values (n_model), else empty. */
export const modelOf = (V: FormValues): string => (typeof V.n_model === 'string' ? V.n_model : '');

/** The catalogue's machine whose values the calculator holds: the ratio as the calculator takes it (to the thousandth),
 *  the static load, the mass when the catalogue gives one, the sheave in its range; the one taken from the advice by
 *  name (`named`, "Montanari M95": two models of equal data), then the advice's makers and an equal mass first. */
export function catalogMachineOf(I: Plant, N: Machine, named = ''): CatalogFit | null {
  const iIdeal = (Math.PI * (N.D / 1000) * N.nm) / (60 * I.v * I.r);
  const rank = (c: CatalogMachine): number => (`${c.brand} ${c.model}` === named ? 0 : 8) + (c.mass === N.mass ? 0 : 4) + (ADVICE_BRANDS.includes(c.brand) ? 0 : 2) + (c.byName ? 1 : 0);
  // a machine below: also the long-shaft and outboard-support variants at the static load they allow through the wall
  const variants = (c: CatalogMachine): CatalogMachine[] => [c, ...(I.layout === 'bottom' ? [throughWallMachine(c)].flatMap((x) => (x && x.staticKg !== c.staticKg ? [x] : [])) : [])];
  const found = MACHINES.flatMap(variants).flatMap((c): CatalogFit[] => {
    const ratio = c.ratios.find((r) => Math.abs(Math.round(ratioValue(r) * 1000) / 1000 - N.i) < 1e-9);
    const fits = ratio !== undefined && c.staticKg === N.shaftMax && (c.mass === null || c.mass === N.mass) && (!c.sheaves || (N.D >= c.sheaves[0] && N.D <= c.sheaves[1]));
    return fits ? [{ machine: c, ratio, i: ratioValue(ratio), dv: iIdeal / ratioValue(ratio) - 1, fails: [] }] : [];
  });
  return found.sort((a, b) => rank(a.machine) - rank(b.machine))[0] ?? null;
}

/** The maker's model whose whole mass the loads on the building count (machine-mass.ts): the one the proposal took
 *  from a catalogue (`made`), else the catalogue's machine the values `V` are (as the relazione names it); null: the
 *  generic machine, or one no catalogue holds (its mass is the whole machine). */
export const massModelOf = (I: Plant, N: Machine, V: FormValues, made: Made | null): Made | null =>
  made ?? catalogMachineOf(I, N, modelOf(V))?.machine ?? null;
