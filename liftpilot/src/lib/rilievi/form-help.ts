// What the sheet's form shows around its fields, as rilievi's form.ejs and _field.ejs computed it: the label of an error
// in the summary (a field, a cell of the measurements, a field of a supplier's module, the identifiers), the link to the
// field, the values of the error's text, the text of an error; and the names of the files of the PDFs. Pure, and light
// enough for the browser: a supplier module's field is looked up through `ModuloLookup` — over the modules' specs the
// page hands to the form (specLookup), or over their maps on the server (ordini/form.ts moduloLookup) — so the maps with
// their PDF coordinates never reach the browser.
import { fieldByKey, IDENTIFIERS_ERROR_KEY, isNumberField, isTextField } from './fields';
import type { FieldErrorCode } from './field-parsers';
import { misuraOf } from './misure';
import type { ModuloSpec } from './ordini/form';
import type { RilieviT } from './t';

/** What the errors need of a supplier module's field: its label (the paper's, verbatim), its supplier, its length. */
export interface ModuloFieldInfo {
  label: string;
  fornitore: string;
  maxLength: number | null;
}

/** A supplier module's field by its name in the form (`oq-cliente`), or null for any other key. */
export type ModuloLookup = (name: string) => ModuloFieldInfo | null;

const noModulo: ModuloLookup = () => null;

/** The lookup over the modules' specs (moduloSpec, plain data the server page passes to the form). */
export function specLookup(specs: readonly ModuloSpec[]): ModuloLookup {
  const byName = new Map<string, ModuloFieldInfo>();
  for (const spec of specs) {
    for (const g of spec.gruppi) for (const r of g.righe) for (const f of r.campi) byName.set(f.name, { label: f.label, fornitore: spec.fornitore, maxLength: f.maxLength });
  }
  return (name) => byName.get(name) ?? null;
}

/** The label of an error's key in the summary: «Identificazione», «Lunghezza, fermata 2», «Quantità: (Pelazza Peppino)»,
 *  or the field's label. */
export function errorLabelOf(key: string, t: RilieviT, modulo: ModuloLookup = noModulo): string {
  if (key === IDENTIFIERS_ERROR_KEY) return t('scheda.identifiers');
  const moduloField = modulo(key);
  if (moduloField) return t('ordini.errorLabel', { label: moduloField.label, fornitore: moduloField.fornitore });
  const misura = misuraOf(key);
  if (misura) return t('scheda.misure.errorLabel', { col: t(`scheda.misure.col.${misura.column.key}`), n: misura.n });
  return t(`scheda.field.${key}`);
}

/** The link of an error in the summary: the field (`#f-<key>`); the identifiers go to the address. */
export const errorAnchorOf = (key: string): string => (key === IDENTIFIERS_ERROR_KEY ? '#f-indirizzo' : `#f-${key}`);

/** The values of an error's text («Massimo {maxLength} caratteri», «tra {min} e {max}») for a key of the form, as
 *  strings so that they print as rilievi printed them (100000, not 100.000). */
export function errorParamsOf(key: string, modulo: ModuloLookup = noModulo): Record<string, string> {
  const misura = misuraOf(key);
  const moduloField = misura ? null : modulo(key);
  if (moduloField) return moduloField.maxLength === null ? {} : { maxLength: String(moduloField.maxLength) };
  const field = misura ? misura.column : fieldByKey(key);
  const out: Record<string, string> = {};
  if (!field) return out;
  if ('min' in field && typeof field.min === 'number') out.min = String(field.min);
  if ('max' in field && typeof field.max === 'number') out.max = String(field.max);
  if ('maxLength' in field && typeof field.maxLength === 'number') out.maxLength = String(field.maxLength);
  return out;
}

/** The text of an error of the form (`rilievi.scheda.error.<code>`, with its values). */
export const errorTextOf = (key: string, code: FieldErrorCode, t: RilieviT, modulo: ModuloLookup = noModulo): string =>
  t(`scheda.error.${code}`, errorParamsOf(key, modulo));

/** The unit shown next to a number field (`scheda.unit.<u>` with n = 2: «kg», «persone», «mm», «m»), or null. */
export function unitTextOf(key: string, t: RilieviT): string | null {
  const field = fieldByKey(key);
  return field && isNumberField(field) && field.unit ? t(`scheda.unit.${field.unit}`, { n: 2 }) : null;
}

/** The `maxlength` of a text input of the sheet (rilievi's _field.ejs: digits and text their bound, int 9, decimal 10). */
export function inputMaxLengthOf(key: string): number | null {
  const field = fieldByKey(key);
  if (!field) return null;
  if (isTextField(field)) return field.maxLength;
  if (field.kind === 'int') return field.min < 0 ? null : 9;
  if (field.kind === 'decimal') return 10;
  return null;
}

/** A sheet's identity in its files: the lift's number, otherwise the matricola, otherwise the last 8 of its id. */
const identOf = (s: { numeroImpianto: string | null; matricola: string | null; id: string }): string => s.numeroImpianto ?? s.matricola ?? s.id.slice(-8);

/** The sheet PDF's name: «scheda-104552-2026-10-12.pdf», safe characters only. */
export function pdfFileName(scheda: { numeroImpianto: string | null; matricola: string | null; id: string; data: Date }): string {
  return `scheda-${identOf(scheda)}-${scheda.data.toISOString().slice(0, 10)}.pdf`.replace(/[^A-Za-z0-9._-]/g, '');
}

/** A supplier's module PDF's name: «ordine-quadro-880011-2026-10-12.pdf», safe characters only. */
export function moduloFileName(path: string, scheda: { numeroImpianto: string | null; matricola: string | null; id: string; data: Date }): string {
  return `${path}-${identOf(scheda)}-${scheda.data.toISOString().slice(0, 10)}.pdf`.replace(/[^A-Za-z0-9._-]/g, '');
}

/** The one-time notices after an action (`?ok=<key>` on the page it lands on; text: `rilievi.flash.<key>`). */
export const FLASH_KEYS = ['schedaCreated', 'schedaSaved', 'schedaTrashed', 'schedaRestored', 'schedaPurged'] as const;
export type FlashKey = (typeof FLASH_KEYS)[number];
export const flashOf = (v: unknown): FlashKey | null => (FLASH_KEYS as readonly unknown[]).includes(v) ? (v as FlashKey) : null;
