// What comes into the sheet's print and PDF — the choices at the end of the form: what is filled in the modules, each on
// its own (`riepilogoOrdini`), and the sections (`stampa`). The check of what was sent is here; the save is in
// validation.ts, the print and the PDF — ordine.ts (`sezioniStampate`) and ordini/riepilogo.ts. Pure, no database. The
// form's keys are in form-help.ts (the browser's form names them without the modules' maps this module reaches through
// the registry). Ported 1:1 from rilievi (src/schede/stampa.ts, commit 988f3cf37), without its tolerance for the
// section «telesoccorso» merged into «allarme» (a rilievi page opened before the merge; LiftPilot never had the section
// — the owner's decision, round 49).
import { z } from 'zod';
import { RIEPILOGO_KEY, STAMPA_KEY, STAMPA_MARK } from './form-help';
import { ORDINABILI } from './ordine';
import { COLONNE } from './ordini/registry';

export { RIEPILOGO_KEY, STAMPA_KEY, STAMPA_MARK };

/** A page from before the choice one by one sends one tick «1» for all the modules. */
const TUTTI = '1';
const scelte = (value: unknown): unknown => (value === undefined || value === '' ? [] : typeof value === 'string' ? [value] : value);

/**
 * The modules in the print: the ticked columns (`riepilogoOrdini`, a repeated key) in the order of the slots; «1» (an old
 * page) — all of them. Any other value is forged.
 */
export const riepilogoSchema = z.preprocess(
  scelte,
  z
    .array(z.string({ invalid_type_error: 'invalid' }), { invalid_type_error: 'invalid' })
    .max(COLONNE.length + 1, 'invalid')
    .refine((keys) => keys.every((key) => key === TUTTI || (COLONNE as readonly string[]).includes(key)), 'invalid')
    .transform((keys) => COLONNE.filter((col) => keys.includes(TUTTI) || keys.includes(col))),
);

/** The ticked modules as sent (the form comes back) — only the known columns. */
export function riepilogoFromBody(source: Record<string, unknown>): string[] {
  const list = scelte(source[RIEPILOGO_KEY]);
  if (!Array.isArray(list)) return [];
  return COLONNE.filter((col) => list.includes(col) || list.includes(TUTTI));
}

/**
 * The sections in the print and the PDF: the ticked ones (`stampa`, a repeated key). The list is in the form when it has
 * the mark `stampa-_`; without it (an old page) — all of them. The excluded ones are stored, so a new section comes into
 * the print by itself. A key outside the movable sections is forged.
 */
const stampaSchema = z.preprocess(
  (value) => (value === undefined ? [] : typeof value === 'string' ? [value] : value),
  z
    .array(z.string({ invalid_type_error: 'invalid' }), { invalid_type_error: 'invalid' })
    .max(ORDINABILI.length * 2, 'invalid')
    .refine((keys) => keys.every((key) => (ORDINABILI as readonly string[]).includes(key)), 'option'),
);

/** The excluded sections of what was sent, or a failure with a forged list. */
export function sezioniEscluseDi(raw: Record<string, unknown>): { success: true; data: string[] } | { success: false } {
  if (raw[STAMPA_MARK] !== '1') return { success: true, data: [] };
  const parsed = stampaSchema.safeParse(raw[STAMPA_KEY]);
  return parsed.success ? { success: true, data: ORDINABILI.filter((key) => !parsed.data.includes(key)) } : { success: false };
}

/** The ticked sections as sent (the form comes back) — only the known ones; without the list — all of them. */
export function stampaFromBody(source: Record<string, unknown>): string[] {
  const stampa = source[STAMPA_KEY];
  if (source[STAMPA_MARK] !== '1') return [...ORDINABILI];
  const list: unknown[] = typeof stampa === 'string' ? [stampa] : Array.isArray(stampa) ? stampa : [];
  return ORDINABILI.filter((key) => list.includes(key));
}
