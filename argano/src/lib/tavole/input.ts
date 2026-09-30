// What the drawing set is made of: the saved calculation (form values), the shaft design laid out, the data of the
// installation, the project and the company, and the identity of this issue of the set (number, author, revisions).
import type { FormValues } from '@/calc/types';
import type { Layout } from '@/shaft/types';
import type { Plant } from '../plant';

export interface TavoleRevision {
  /** R1, R2, R3 */
  mark: string;
  text: string;
  date: Date;
}

export interface TavoleInput {
  values: FormValues;
  layout: Layout;
  plant: Plant;
  project: { name: string; address: string | null; city: string | null; province: string | null; plantNumber: string | null; client: string | null };
  company: { name: string; logo: { mime: 'image/png' | 'image/jpeg'; data: string } | null };
  set: {
    /** drawing number, e.g. 26-001 */
    number: string;
    issuedAt: Date;
    /** initials of who drew the set */
    author: string;
    revisions: readonly TavoleRevision[];
  };
}

/** dd/mm/yyyy in Italy's time zone. */
export const dateIt = (d: Date): string => new Intl.DateTimeFormat('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Europe/Rome' }).format(d);

/** The address as the title block writes it: street, then town with its province. */
export function placeLines(p: TavoleInput['project']): [string, string] {
  const town = [p.city, p.province ? `(${p.province})` : null].filter(Boolean).join(' ');
  return [p.address || p.name, town || '—'];
}
