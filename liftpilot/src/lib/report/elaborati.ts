// The section «Elaborati grafici» of the relazione di calcolo (Italian): the drawing sets issued on this calculation,
// each with its number, its latest revision, its sheets and the start of its fingerprint, so that the relazione and the
// sheets point to each other. The relazione tecnica of a replacement lists its attachments by the same rule: the
// revision in force of each number, in the order of the year and the number (round 37). A set keeps the data of the
// installation it was issued with (DrawingSet.plant), while the relazione and the relazione tecnica take them as they are
// now: where they differ in what a document reads (the relazione di calcolo: the fields of its rails' check and loads;
// the relazione tecnica: all), it says so and asks for a revision of the set. Pure.
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

/** The latest revision of each number, in the order the numbers first come (the queries give them by year, number and
 *  revision): a superseded revision is not an attachment. */
export const latestRevisions = <T extends { number: string; revision: number }>(sets: readonly T[]): T[] =>
  [...sets.reduce((m, s) => ((m.get(s.number)?.revision ?? -1) >= s.revision ? m : m.set(s.number, s)), new Map<string, T>()).values()];

/** A revision as the relazioni write it: the first issue, else R1, R2… */
export const revisionText = (revision: number): string => (revision ? `R${revision}` : 'prima emissione');

/** A set as the documents name it: «DIS. N° 26-196 R1». */
const setName = (s: { number: string; revision: number }): string => `DIS. N° ${s.number}${s.revision ? ` R${s.revision}` : ''}`;

/** A field of the data of the installation as its form names it, in a sentence. */
function fieldName(k: keyof Plant): string {
  const labels: Readonly<Record<string, string>> = appIt.tavole, label = (labels[`f_${k}`] ?? k).replace(/\s*\(.*\)\s*$/, '');
  const name = label.charAt(0).toLowerCase() + label.slice(1);
  return k.startsWith('mass') ? `massa della cabina: ${name}` : name;
}

/** The sets — the latest revision of each number — issued with other data of the installation than `now`: each named,
 *  with the fields that changed («DIS. N° 26-196 R1 (passo staffe cabina, paracadute)»); none when all agree.
 *  `fields`: only those the document reads (the relazione di calcolo: sheet-loads.ts GUIDE_PLANT_FIELDS); all of them
 *  when missing (the relazione tecnica reads the data of sheet 1). */
export function plantChanged(sets: readonly { number: string; revision: number; plant?: Plant }[], now: Plant, fields?: readonly (keyof Plant)[]): string[] {
  return latestRevisions(sets).flatMap((s) => {
    const diff = s.plant ? plantDiff(s.plant, now, fields) : [];
    return diff.length ? [`${setName(s)} (${diff.map(fieldName).join(', ')})`] : [];
  });
}

/** The box of a document that takes the data of the installation as they are now beside the sets `changed`
 *  (plantChanged) issued with other data; `said`: what of the document does not match their sheet 1. */
export const plantChangedBox = (changed: readonly string[], said: string): ReportBlock => ({
  t: 'box', text: `⚠ DATI DELL’IMPIANTO MODIFICATI DOPO L’EMISSIONE DELLE TAVOLE: ${changed.join('; ')}. ${said} Le tavole restano come emesse: `
    + 'emetterne una revisione con i dati attuali, o riportare i dati dell’impianto a quelli dell’emissione.',
});

/** The section's blocks: the latest revision of each set; `changed`: the sets issued with other data of the
 *  installation in the fields its rails' check and loads read (plantChanged with GUIDE_PLANT_FIELDS, as build.ts
 *  computes them for «Guide e carichi»). */
export function elaboratiBlocks(sets: readonly IssuedSet[], when: (d: Date) => string, changed: readonly string[] = []): ReportBlock[] {
  const last = latestRevisions(sets);
  if (!last.length) {
    return [{ t: 'p', text: 'Nessuna serie di tavole è ancora emessa su questo calcolo: le tavole emesse dopo questa relazione la richiamano con il numero '
      + 'del calcolo, e la relazione va riemessa con il loro numero.' }];
  }
  return [{ t: 'grid', head: ['Tavole', 'Revisione', 'Fogli', 'Emesse il', 'Impronta SHA-256'], widths: [0.18, 0.12, 0.1, 0.3, 0.3], align: ['l', 'l', 'r', 'l', 'l'],
    rows: last.map((s) => [`DIS. N° ${s.number}`, revisionText(s.revision), String(s.pages), when(s.createdAt), `${s.sha256.slice(0, 16)}…`]) },
  ...(changed.length ? [plantChangedBox(changed, 'Le verifiche delle guide e i carichi sulle strutture di questa relazione sono calcolati con i dati attuali '
    + 'e non coincidono con il foglio 1 di quelle tavole.')] : [])];
}
