// The section «Elaborati grafici» of the relazione di calcolo (Italian): the drawing sets issued on this calculation,
// each with its number, its latest revision, its sheets and the start of its fingerprint, so that the relazione and the
// sheets point to each other. A set keeps the data of the installation it was issued with (DrawingSet.plant), while
// the relazione and the relazione tecnica take them as they are now: where they differ, the documents say so and ask
// for a revision of the set. Pure.
import appIt from '../../../messages/it.json';
import { plantDiff, type Plant } from '../plant';
import type { ReportBlock } from './model';

/** A drawing set issued on the calculation: its number, revision (0: the first issue), sheets, day and SHA-256; the
 *  data of the installation it was issued with (plant.ts plantData of its snapshot; missing: not compared). */
export interface IssuedSet {
  number: string;
  revision: number;
  pages: number;
  createdAt: Date;
  sha256: string;
  plant?: Plant;
}

/** The latest revision of each number. */
function latest<T extends { number: string; revision: number }>(sets: readonly T[]): T[] {
  return [...sets.reduce((m, s) => (m.get(s.number)?.revision ?? -1) >= s.revision ? m : m.set(s.number, s), new Map<string, T>()).values()];
}

/** A set as the documents name it: «DIS. N° 26-196 R1». */
const setName = (s: { number: string; revision: number }): string => `DIS. N° ${s.number}${s.revision ? ` R${s.revision}` : ''}`;

/** A field of the data of the installation as its form names it, in a sentence. */
function fieldName(k: keyof Plant): string {
  const labels: Readonly<Record<string, string>> = appIt.tavole, label = (labels[`f_${k}`] ?? k).replace(/\s*\(.*\)\s*$/, '');
  const name = label.charAt(0).toLowerCase() + label.slice(1);
  return k.startsWith('mass') ? `massa della cabina: ${name}` : name;
}

/** The sets — the latest revision of each number — issued with other data of the installation than `now`: each named,
 *  with the fields that changed («DIS. N° 26-196 R1 (passo staffe cabina, paracadute)»); none when all agree. */
export function plantChanged(sets: readonly { number: string; revision: number; plant?: Plant }[], now: Plant): string[] {
  return latest(sets).flatMap((s) => {
    const diff = s.plant ? plantDiff(s.plant, now) : [];
    return diff.length ? [`${setName(s)} (${diff.map(fieldName).join(', ')})`] : [];
  });
}

/** The box of a document that takes the data of the installation as they are now beside the sets `changed`
 *  (plantChanged) issued with other data; `said`: what of the document does not match their sheet 1. */
export const plantChangedBox = (changed: readonly string[], said: string): ReportBlock => ({
  t: 'box', text: `⚠ DATI DELL’IMPIANTO MODIFICATI DOPO L’EMISSIONE DELLE TAVOLE: ${changed.join('; ')}. ${said} Le tavole restano come emesse: `
    + 'emetterne una revisione con i dati attuali, o riportare i dati dell’impianto a quelli dell’emissione.',
});

export function elaboratiBlocks(sets: readonly IssuedSet[], when: (d: Date) => string, plant: Plant | null = null): ReportBlock[] {
  const last = latest(sets);
  if (!last.length) {
    return [{ t: 'p', text: 'Nessuna serie di tavole è ancora emessa su questo calcolo: le tavole emesse dopo questa relazione la richiamano con il numero '
      + 'del calcolo, e la relazione va riemessa con il loro numero.' }];
  }
  const changed = plant ? plantChanged(last, plant) : [];
  return [{ t: 'grid', head: ['Tavole', 'Revisione', 'Fogli', 'Emesse il', 'Impronta SHA-256'], widths: [0.18, 0.12, 0.1, 0.3, 0.3], align: ['l', 'l', 'r', 'l', 'l'],
    rows: last.map((s) => [`DIS. N° ${s.number}`, s.revision ? `R${s.revision}` : 'prima emissione', String(s.pages), when(s.createdAt), `${s.sha256.slice(0, 16)}…`]) },
  ...(changed.length ? [plantChangedBox(changed, 'Le verifiche delle guide e i carichi sulle strutture di questa relazione sono calcolati con i dati attuali '
    + 'e non coincidono con il foglio 1 di quelle tavole.')] : [])];
}
