// The machine's name as the documents of a set write it — the catalogue's machine the calculation checked, the name the
// data of the installation give it only as a reference — and whether that name contradicts the catalogue's (a set is not
// issued so). Pure, without the drawing kernel: the form of the data of the installation checks it as it is typed.
import type { Plant } from '../plant';

/** A machine's name reduced to its letters and digits, upper case: "M 73 (Sx)" → "M73SX". */
const bare = (s: string): string => s.normalize('NFKD').toUpperCase().replace(/[^A-Z0-9]/g, '');

/** The name the data of the installation give the machine, trimmed; null when none. */
const plantName = (plant: Plant): string | null => plant.machine?.trim() || null;

/** The machine as the drawings label it: the catalogue's machine of the design (maker and model) whenever there is one —
 *  the machine the calculation checked —, else the name the data of the installation give it, else none. */
export const machineName = (plant: Plant, catalog: { brand: string; model: string } | null): string =>
  catalog ? `${catalog.brand} ${catalog.model}` : plantName(plant) ?? '';

/** The machine as sheet 1 and the relazione name it: the catalogue's machine of the design, with the name the data of
 *  the installation give it as a reference ("(rif. impianto: …)") when it says more than that; without a catalogue
 *  machine, that name; else none. */
export function machineText(plant: Plant, catalog: { brand: string; model: string } | null): string {
  const own = plantName(plant);
  if (!catalog) return own ?? '';
  const name = `${catalog.brand} ${catalog.model}`;
  return own && bare(own) !== bare(name) ? `${name} (rif. impianto: ${own})` : name;
}

/** The name the data of the installation give the machine contradicts the catalogue's machine of the design: it does not
 *  name its model (letters and digits, spaces and signs aside). A set is not issued so (drawing-actions.ts): the sheets
 *  would name a machine the calculation did not check. */
export const machineConflict = (plant: Plant, catalog: { brand: string; model: string } | null): boolean => {
  const own = plantName(plant);
  return !!own && !!catalog && !bare(own).includes(bare(catalog.model));
};
