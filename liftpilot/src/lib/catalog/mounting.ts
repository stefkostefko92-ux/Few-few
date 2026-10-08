// How the slow shaft of a catalogue machine carries the sheave (src/lib/catalog/machines.ts): the variants built for a
// sheave far from the gearbox — a long slow shaft (SICOR LS, Montanari AL) or the shaft on an outboard bearing (SICOR TS,
// Montanari S and the models "con supporto", GEM L/CL and "con supporto", FAER P58F) —, as the makers' documents name
// them (their `src`). A machine below beside the shaft has its sheave in the shaft on the slow shaft through the wall
// (src/lib/lift/bottom.ts belowMachine): only these variants take it, at the static load they allow with the longest
// shaft their sheet lists (registry impianto.basso.albero). Pure.
import type { CatalogMachine } from './machines';

export interface ShaftMount {
  /** a long slow shaft, or the slow shaft on an outboard bearing */
  kind: 'long' | 'support';
  /** the static load the maker's sheet allows for each length of the shaft it lists, the shortest first [kg]; none:
   *  one value, the catalogue's */
  byLength?: readonly number[];
}

const LONG: ShaftMount = { kind: 'long' }, SUPPORT: ShaftMount = { kind: 'support' };

/** The variants, by maker and model as the catalogue writes them. SICOR's LS: the static load by the length of the
 *  shaft (A = 500/600/725 mm) and its quota B (150/175/200 mm), brochure Geared 2026, pp. 59 and 69. */
export const SHAFT_MOUNTS: Readonly<Record<string, ShaftMount>> = {
  'SICOR SH140LS': { kind: 'long', byLength: [2000, 1700, 1500] },
  'SICOR SH160LS': { kind: 'long', byLength: [4300, 3700, 3200] },
  'SICOR MR21TS': SUPPORT,
  'SICOR MR26TS': SUPPORT,
  'Montanari M73S': SUPPORT,
  'Montanari M75S': SUPPORT,
  'Montanari M85': SUPPORT,
  'Montanari M95': SUPPORT,
  'Montanari M98': SUPPORT,
  'Montanari M73AL': LONG,
  'Montanari M75AL': LONG,
  'Montanari M83AL': LONG,
  'Montanari M93AL': LONG,
  'Montanari M98HAL': LONG,
  'GEM HW134L': SUPPORT,
  'GEM HW134L Ø600': SUPPORT,
  'GEM HW134VF con supporto': SUPPORT,
  'GEM HW135L-VF': SUPPORT,
  'GEM HW140CL': SUPPORT,
  'FAER P58F': SUPPORT,
};

/** The variant's mounting; null: a standard machine, the sheave overhung next to the gearbox. */
export const mountOf = (c: Pick<CatalogMachine, 'brand' | 'model'>): ShaftMount | null => SHAFT_MOUNTS[`${c.brand} ${c.model}`] ?? null;

/** The static load a variant allows with the sheave through a wall [kg]: with the longest shaft its sheet lists, else the
 *  catalogue's (to be confirmed by the maker for the overhang the order states). */
export const throughStatic = (c: CatalogMachine): number => {
  const m = mountOf(c);
  return m?.byLength?.length ? Math.min(...m.byLength) : c.staticKg;
};

/** The machine as the proposal takes it with the sheave through a wall: its static load there; null for a standard one. */
export const throughWallMachine = (c: CatalogMachine): CatalogMachine | null => (mountOf(c) ? { ...c, staticKg: throughStatic(c) } : null);
