// The machine's name as the documents of a set write it — the catalogue's machine the calculation checked, the name the
// data of the installation give it only as a reference — and whether that name contradicts the catalogue's (a set is not
// issued so). Pure, without the drawing kernel: the form of the data of the installation checks it as it is typed.
import { BRANDS, MACHINES } from '../catalog/machines';
import type { Plant } from '../plant';

/** A machine's name reduced to its letters and digits, upper case: "M 73 (Sx)" → "M73SX". */
const bare = (s: string): string => s.normalize('NFKD').toUpperCase().replace(/[^A-Z0-9]/g, '');

/** A name's words: its runs of letters and digits, upper case, anything else between them a break ("M 73 (Sx)" → M, 73,
 *  SX). */
const words = (s: string): string[] => s.normalize('NFKD').toUpperCase().split(/[^A-Z0-9]+/).filter(Boolean);

/** A catalogue model's core: the model without what tells its sheave or its mounting apart — the words in brackets, the
 *  sheave ("Ø600"), "con …" — its words run together: "MR12 (storico)" → MR12, "HW134 Ø600" → HW134, "HW134VF con
 *  supporto" → HW134VF, "PENTA 830" → PENTA830. Two models with one core are one machine to name. */
export const modelCore = (model: string): string =>
  words(model.replace(/\([^)]*\)/g, ' ').replace(/[Øø]\s*\d+/g, ' ').replace(/\bcon\b.*$/i, ' ')).join('');

/** Every model's core in the catalogue, and the makers' names as words. */
const CORES = new Set(MACHINES.map((c) => modelCore(c.model)));
const MAKERS = new Set(BRANDS.map((b) => bare(b)));

/** The most words of a name one core is written in ("SH 130 G"). */
const RUN = 4;

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

/** The name the data of the installation give the machine contradicts the catalogue's machine of the design — the
 *  sheets would name a machine the calculation did not check, and a set is not issued so (drawing-actions.ts). Whole
 *  words, a core written over several of them run together ("M 73" is M73, "MR21 TS" MR21TS, but the "Sx" of "M 73 (Sx)"
 *  — the left hand — a word of its own): it does not name the core of the catalogue's model, or it names, outside the
 *  words that do, the core of another model of the catalogue (SH130G for SH130, M73S for M73 and the other way round,
 *  PENTA 830 for PENTA) or another maker. */
export const machineConflict = (plant: Plant, catalog: { brand: string; model: string } | null): boolean => {
  const own = plantName(plant), core = catalog ? modelCore(catalog.model) : '';
  if (!own || !catalog || !core) return false;
  // every run of up to RUN words, run together
  const w = words(own), runs: { i: number; j: number; s: string }[] = [];
  for (let i = 0; i < w.length; i++) {
    let s = '';
    for (let j = i; j < Math.min(w.length, i + RUN); j++) runs.push({ i, j, s: (s += w[j]) });
  }
  const named = runs.filter((r) => r.s === core);
  if (!named.length) return true;
  const within = (r: { i: number; j: number }): boolean => named.some((m) => m.i <= r.i && r.j <= m.j), maker = bare(catalog.brand);
  return runs.some((r) => !within(r) && ((r.s !== core && CORES.has(r.s)) || (r.i === r.j && r.s !== maker && MAKERS.has(r.s))));
};
