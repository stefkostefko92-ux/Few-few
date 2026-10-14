// What the title block of a set writes, the same for a whole project's sheet 1 and a replacement's: the client, the
// place, the author, the date, the revisions from R0, the drawing number, the plant number (a new lift's is assigned
// at its putting into service, an existing one's is to be given), the company; and the line of the records the set goes
// with. Italian, like the drawings. Pure.
import { dateIt, placeLines, type SetRecords, type TavoleInput } from './input';
import type { TitleData } from './title-block';

/** The drawing number of a draft (an export of a saved record, not issued: no number, no R0). */
export const DRAFT_NUMBER = 'BOZZA';

/** The plant number as the title block and the strips write it: the one entered; else, for an existing lift (a
 *  modification under UNI 10411), to be given — the body and the municipality know the lift by it (DPR 162/1999,
 *  art. 12) —, for a new one, to be assigned at its putting into service. */
export const plantMark = (plantNumber: string | null, existing: boolean): string =>
  plantNumber?.trim() || (existing ? 'DA COMUNICARE' : 'DA ASSEGNARE');

/** The title block's words of a set. `existing`: the lift exists (its plant number is to be given when missing). */
export function titleOf(x: Pick<TavoleInput, 'project' | 'company' | 'clientLogo' | 'set'>, pages: number, existing: boolean): TitleData {
  return {
    client: x.project.client || '—', location: placeLines(x.project), author: x.set.author, date: dateIt(x.set.issuedAt),
    revisions: x.set.revisions.map((r) => ({ mark: r.mark, text: r.text, date: dateIt(r.date) })),
    number: x.set.number, pages, plant: plantMark(x.project.plantNumber, existing), company: x.company.name, logo: x.company.logo !== null,
    clientLogo: x.clientLogo != null, first: x.set.number === DRAFT_NUMBER ? null : dateIt(x.set.firstIssuedAt ?? x.set.issuedAt),
  };
}

/** The first 16 hexadecimal digits of a SHA-256, as the documents cite a record. */
const short = (sha: string): string => sha.slice(0, 16);

/** The records a set goes with, as sheet 1 cites them (the relazione made from the same calculation goes with the
 *  sheets); null without them (a set drawn outside the records). */
export function refsText(r: SetRecords | undefined): string | null {
  if (!r) return null;
  const calc = `calcolo ${r.calc.id} (SHA-256 ${short(r.calc.sha256)})`;
  if (r.room) return `ELABORATI COLLEGATI: relazione tecnica del rilievo del locale ${r.room.id} (SHA-256 ${short(r.room.sha256)}) e relazione di calcolo del ${calc}`;
  return `ELABORATI COLLEGATI: relazione di calcolo del ${calc}${r.design ? `; progetto del vano ${r.design.id} (SHA-256 ${short(r.design.sha256)})` : ''}`;
}
