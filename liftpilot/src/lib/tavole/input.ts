// What the drawing set is made of: the saved calculation (form values), the shaft design laid out, the data of the
// installation, the project and the company, and the identity of this issue of the set (number, author, revisions).
import type { FormValues } from '@/calc/types';
import type { Layout } from '@/shaft/types';
import type { ValueMarks } from '../lift/marks';
import type { Plant } from '../plant';

export interface TavoleRevision {
  /** R1, R2, R3 (R0, the first issue, is the set's own date) */
  mark: string;
  text: string;
  date: Date;
}

export interface TavoleInput {
  values: FormValues;
  layout: Layout;
  plant: Plant;
  /** what the software filled in, when the calculation comes from the one form of a lift design */
  marks?: ValueMarks;
  project: { name: string; address: string | null; city: string | null; province: string | null; plantNumber: string | null; client: string | null };
  company: { name: string; logo: { mime: 'image/png' | 'image/jpeg'; data: string } | null };
  /** the logo of the client who commissioned the project, next to its name in the title block */
  clientLogo?: { mime: 'image/png' | 'image/jpeg'; data: string } | null;
  set: {
    /** drawing number, e.g. 26-001 */
    number: string;
    issuedAt: Date;
    /** initials of who drew the set */
    author: string;
    revisions: readonly TavoleRevision[];
    /** the date of the first issue (R0) of a revised set; none: `issuedAt` (the first issue itself) */
    firstIssuedAt?: Date;
  };
  /** the records the set is drawn from, as sheet 1 names them (the relazione of the same calculation goes with it):
   *  the calculation, the shaft design of a whole project or the machine room surveyed of a replacement */
  records?: SetRecords;
}

/** A stored record: its id and SHA-256. */
export interface RecordRef {
  id: string;
  sha256: string;
}

export interface SetRecords {
  calc: RecordRef;
  design?: RecordRef;
  room?: RecordRef;
}

/** dd/mm/yyyy in Italy's time zone. */
export const dateIt = (d: Date): string => new Intl.DateTimeFormat('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Europe/Rome' }).format(d);

/** The address as the title block writes it: street, then town with its province. */
export function placeLines(p: TavoleInput['project']): [string, string] {
  const town = [p.city, p.province ? `(${p.province})` : null].filter(Boolean).join(' ');
  return [p.address || p.name, town || '—'];
}
