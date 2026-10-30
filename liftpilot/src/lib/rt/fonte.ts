// The source of a datum the engineer types for the relazione tecnica di modifica (owner's decision 7): every block of
// component data entered by hand carries where it was read — the plate, a certificate, the maker's data sheet, the
// logbook, a verbale, the survey, a declaration — and, when it is one of the installation's files, which one (the RT
// prints «Allegato n»). Data from LiftPilot's catalogues, the design or the calculation carry their origin by
// themselves (D/E/R/P). Shared by the schemas of the RT (input.ts, input-componenti.ts, anagrafica.ts). Pure.
import { z } from 'zod';

export const FONTE_TIPI = ['targa', 'certificato', 'scheda', 'libretto', 'verbale', 'rilievo', 'dichiarazione', 'altro'] as const;
export type FonteTipo = (typeof FONTE_TIPI)[number];

/** An uploaded file's id (cuid). */
export const allegatoIdSchema = z.string().regex(/^[a-z0-9]{1,40}$/i);

/** A text field: trimmed, at most `max` characters, at least `min` when the RT is issued (a draft keeps what is being
 *  typed). */
export const testo = (min: number, max: number, bozza: boolean) => (bozza ? z.string().trim().max(max) : z.string().trim().min(min).max(max));

/** The source of a block of data: what it is and its reference (3–160 characters at issue), with the file it is in. In a
 *  draft every part may still be missing. */
export const fonteSchemaDi = (bozza: boolean) => (bozza
  ? z.object({ tipo: z.enum(FONTE_TIPI).optional(), rif: testo(0, 160, true).optional(), attachmentId: allegatoIdSchema.optional() }).strict()
  : z.object({ tipo: z.enum(FONTE_TIPI), rif: testo(3, 160, false), attachmentId: allegatoIdSchema.optional() }).strict());
export const fonteSchema = fonteSchemaDi(false);
export type Fonte = z.infer<typeof fonteSchema>;

const isRecord = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);

/** The form's values with every empty text (after trimming) left out, at every depth, as the plant's form sends them:
 *  an empty field is a missing one, never an empty string to validate. Arrays keep their items (an empty text in a
 *  list is the item's own business). */
export function senzaVuoti(x: unknown): unknown {
  if (Array.isArray(x)) return x.map(senzaVuoti);
  if (!isRecord(x)) return x;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(x)) {
    if (typeof v === 'string' && v.trim() === '') continue;
    if (v === undefined || v === null) continue;
    out[k] = senzaVuoti(v);
  }
  return out;
}
