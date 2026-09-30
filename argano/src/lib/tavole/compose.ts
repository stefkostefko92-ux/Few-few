// What an issued drawing set keeps beside the calculation and the shaft design it was made from: the project, the
// data of the installation and the company name as they were at issue, the revisions. Validated on the way in and
// on the way out of the database (zod), so a set is drawn again the same. Pure.
import { z } from 'zod';
import type { FormValues } from '@/calc/types';
import type { Layout } from '@/shaft/types';
import { plantSchema } from '../plant';
import type { TavoleInput, TavoleRevision } from './input';

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
}

/** The input of the drawing set of a stored set; null when a stored part does not read back. */
export function storedInput(values: FormValues, layout: Layout, s: StoredSet, logo: { mime: 'image/png' | 'image/jpeg'; data: Uint8Array } | null): TavoleInput | null {
  const plant = plantSchema.safeParse(s.plant ?? {}), project = projectDataSchema.safeParse(s.projectData), revs = revisionsSchema.safeParse(s.revisions);
  if (!plant.success || !project.success || !revs.success) return null;
  const revisions: TavoleRevision[] = revs.data.map((r) => ({ mark: r.mark, text: r.text, date: new Date(r.date) }));
  return {
    values, layout, plant: plant.data, project: project.data,
    company: { name: s.companyName, logo: logo ? { mime: logo.mime, data: Buffer.from(logo.data).toString('base64') } : null },
    set: { number: s.number, issuedAt: s.createdAt, author: s.authorInitials, revisions },
  };
}
