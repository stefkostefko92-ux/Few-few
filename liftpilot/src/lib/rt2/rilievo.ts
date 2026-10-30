// What the installation's reference survey gives the relazione tecnica (round 57; src/server/rt/queries.ts rilievoHints):
// the registry's hints (persons, stops, matricola) and, for the owner's model (RT 2.x), what it asks of the lift before
// the modification — the roping, where the machine stands, the controller's regulation — and the lift's make. They fill
// only what the RT leaves empty («prima» empty is «as after»: the survey says what it was); the RT keeps them as typed.
// Pure.
import type { Regolazione } from '@/lib/lift/modifica';
import type { Rt2Inputs } from './input';

export interface RilievoHints {
  persone: number | null;
  fermate: number | null;
  matricola: string | null;
  /** the make of the lift (the card's «Marca») */
  marca: string | null;
  /** the roping the argano sheet ticks */
  taglia: 1 | 2 | null;
  /** where the machine stands */
  locale: 'alto' | 'basso' | null;
  regolazione: Regolazione | null;
  /** the survey's day (YYYY-MM-DD) */
  data: string;
}

/** The RT's inputs with what the survey gives where they are empty (`azionamento`: the regulation is asked there — the
 *  calculation's test has none); the paths filled. */
export function conRilievo(I: Rt2Inputs, h: RilievoHints | null, azionamento: boolean): { inputs: Rt2Inputs; dati: string[] } {
  if (!h) return { inputs: I, dati: [] };
  const prima = { ...(I.tecnici?.prima ?? {}) }, doc = { ...(I.doc ?? {}) }, dati: string[] = [];
  if (prima.r === undefined && h.taglia) { prima.r = h.taglia; dati.push('tecnici.prima.r'); }
  if (prima.locale === undefined && h.locale) { prima.locale = h.locale; dati.push('tecnici.prima.locale'); }
  if (azionamento && prima.azionamento === undefined && h.regolazione) { prima.azionamento = h.regolazione; dati.push('tecnici.prima.azionamento'); }
  const marca = h.marca?.trim().slice(0, 80);
  if (!doc.costruttore && marca) { doc.costruttore = marca; dati.push('doc.costruttore'); }
  if (!dati.length) return { inputs: I, dati };
  return { inputs: { ...I, doc, tecnici: { ...(I.tecnici ?? {}), prima } }, dati };
}
