// What an issued drawing set keeps beside the calculation and the shaft design it was made from: the project, the
// data of the installation and the company name as they were at issue, the revisions. Validated on the way in and
// on the way out of the database (zod), so a set is drawn again the same. Pure.
import { z } from 'zod';
import type { FormValues } from '@/calc/types';
import type { Layout } from '@/shaft/types';
import { NO_MARKS, type ValueMarks } from '../lift/marks';
import { plantReadSchema } from '../plant';
import type { SetRecords, TavoleInput, TavoleRevision } from './input';

const text = (max: number) => z.string().trim().max(max);

export const projectDataSchema = z.object({
  name: text(160).min(1),
  address: text(200).nullable(),
  city: text(120).nullable(),
  province: text(40).nullable(),
  plantNumber: text(80).nullable(),
  client: text(160).nullable(),
}).strict();

export type ProjectData = z.infer<typeof projectDataSchema>;

export const revisionsSchema = z.array(z.object({
  mark: z.string().regex(/^R\d{1,2}$/),
  text: text(120).min(1),
  date: z.string().datetime(),
}).strict()).max(99);

/** Initials in the title block: letters, dots and spaces, e.g. "A.C.". */
export const initialsSchema = z.string().trim().min(1).max(12).regex(/^[\p{L}][\p{L}. '-]*$/u);

/** The initials of a name, as the title block and the issue form take them: "Giulia Ferrari" → "G.F."; '' when no word
 *  of the name starts with a letter. */
export const initialsOf = (name: string): string =>
  name.split(/\s+/).map((w) => /^\p{L}/u.exec(w)?.[0]?.toUpperCase() ?? '').filter(Boolean).slice(0, 3).map((c) => `${c}.`).join('');

export const revisionNoteSchema = text(120).min(3);

export const projectData = (p: ProjectData): ProjectData => ({
  name: p.name, address: p.address, city: p.city, province: p.province, plantNumber: p.plantNumber, client: p.client,
});

/** Number of a set: the year's last two digits and the sequence, e.g. 26-001. */
export const setNumber = (year: number, seq: number): string => `${String(year % 100).padStart(2, '0')}-${String(seq).padStart(3, '0')}`;

export interface StoredSet {
  number: string;
  createdAt: Date;
  authorInitials: string;
  revisions: unknown;
  plant: unknown;
  projectData: unknown;
  companyName: string;
  /** the date of the set's first issue (its R0) when this row is a revision; none: `createdAt` */
  firstIssuedAt?: Date | null;
}

/** What every stored set keeps beside what it was made of: the data of the installation, the project, the company and
 *  its logo, the client's logo, the identity of the issue; null when a stored part does not read back. */
export function storedParts(
  s: StoredSet, logo: { mime: 'image/png' | 'image/jpeg'; data: Uint8Array } | null, clientLogo: { mime: 'image/png' | 'image/jpeg'; data: Uint8Array } | null = null,
): Omit<TavoleInput, 'values' | 'layout' | 'marks'> | null {
  const plant = plantReadSchema.safeParse(s.plant ?? {}), project = projectDataSchema.safeParse(s.projectData), revs = revisionsSchema.safeParse(s.revisions);
  if (!plant.success || !project.success || !revs.success) return null;
  const revisions: TavoleRevision[] = revs.data.map((r) => ({ mark: r.mark, text: r.text, date: new Date(r.date) }));
  return {
    plant: plant.data, project: project.data,
    company: { name: s.companyName, logo: logo ? { mime: logo.mime, data: Buffer.from(logo.data).toString('base64') } : null },
    clientLogo: clientLogo ? { mime: clientLogo.mime, data: Buffer.from(clientLogo.data).toString('base64') } : null,
    set: { number: s.number, issuedAt: s.createdAt, author: s.authorInitials, revisions, ...(s.firstIssuedAt ? { firstIssuedAt: s.firstIssuedAt } : {}) },
  };
}

/** The input of the drawing set of a stored set; null when a stored part does not read back. `records`: what sheet 1
 *  cites (the calculation and the shaft design the set is drawn from). */
export function storedInput(
  values: FormValues, layout: Layout, s: StoredSet, logo: { mime: 'image/png' | 'image/jpeg'; data: Uint8Array } | null, marks: ValueMarks = NO_MARKS,
  clientLogo: { mime: 'image/png' | 'image/jpeg'; data: Uint8Array } | null = null, records?: SetRecords,
): TavoleInput | null {
  const p = storedParts(s, logo, clientLogo);
  return p ? { values, layout, marks, ...p, ...(records ? { records } : {}) } : null;
}
