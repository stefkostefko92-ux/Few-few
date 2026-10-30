// What the user says about an uploaded file (round 49): its kind (the database's AttachmentKind), its title, the part of
// the relazione tecnica di modifica it belongs to (a section, the installation, the building) — the three things that
// may change later (trigger attachment_guard) — and the uploaded name, kept cleaned for display only. zod at the
// boundary: the upload route and the edit action both parse with these. Pure.
import { z } from 'zod';
import { ALLEGATO_KINDS, COMPONENTI, type AllegatoKind, type Componente } from '@/lib/rt/types';
import { ALLEGATI_LIMITS, EXT_OF, type AllegatoType } from './limits';

export { ALLEGATO_KINDS, COMPONENTI, type AllegatoKind, type Componente };

// C0 and C1 controls, and the bidirectional overrides and isolates that make «fdp.exe» read «exe.pdf»
// eslint-disable-next-line no-control-regex -- the point is to remove them
const UNSAFE = /[\u0000-\u001f\u007f-\u009f\u200e\u200f\u202a-\u202e\u2066-\u2069]/g;

/** A text without control or direction characters, its spaces collapsed, trimmed, NFC. */
export const plainText = (s: string): string => s.normalize('NFC').replace(UNSAFE, ' ').replace(/\s+/g, ' ').trim();

/** At most `n` characters as PostgreSQL counts them (code points, not UTF-16 units). */
const codePoints = (s: string, n: number): string => Array.from(s).slice(0, n).join('').trim();

/**
 * The uploaded file's name as the product shows it: its last path segment (a browser sends «C:\…\x.pdf» or
 * «../../x.pdf» only when tampered with), without control or direction characters, at most 120 characters; never
 * empty. Never used as a path or in a download's name.
 */
export function cleanFileName(raw: string, type: AllegatoType): string {
  const base = plainText(raw.split(/[\\/]/).pop() ?? '').replace(/^\.+/, '');
  return codePoints(base, ALLEGATI_LIMITS.fileNameMax) || `documento.${EXT_OF[type]}`;
}

/** A title from the file's name when the user gives none: the name without its extension, at most 160 characters. */
export const titleFromName = (name: string): string =>
  codePoints(plainText(name.replace(/\.[A-Za-z0-9]{1,5}$/, '').replace(/[_]+/g, ' ')), ALLEGATI_LIMITS.titleMax) || 'Documento';

/** A form's value: an empty or blank field is no value (as the plant form). */
const blankToUndefined = (v: unknown): unknown => (typeof v === 'string' && v.trim() === '' ? undefined : v);

export const titleSchema = z.string().transform(plainText).pipe(z.string().min(1).max(ALLEGATI_LIMITS.titleMax));
export const kindSchema = z.enum(ALLEGATO_KINDS);
export const componentSchema = z.enum(COMPONENTI);

/** The fields of an upload besides the file: the kind is required, the title defaults to the file's name. */
export const uploadMetaSchema = z.object({
  kind: kindSchema,
  title: z.preprocess(blankToUndefined, titleSchema.optional()),
  component: z.preprocess(blankToUndefined, componentSchema.optional()),
}).strict();
export type UploadMeta = z.infer<typeof uploadMetaSchema>;

/** An edit: the three columns that may change; no component clears it. */
export const editSchema = z.object({
  id: z.string().trim().min(1).max(40).regex(/^[a-z0-9]+$/i),
  kind: kindSchema,
  title: titleSchema,
  component: z.preprocess((v) => (v === null ? undefined : blankToUndefined(v)), componentSchema.optional()),
}).strict();
export type AttachmentEdit = z.infer<typeof editSchema>;
