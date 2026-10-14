// The kinds of fields of the survey sheet and their checks — what fields.ts (the list), the form and the PDF share.
// Ported 1:1 from rilievi (src/schede/field-types.ts, commit ae6329cb6).

export type FieldKind =
  | 'date' // today by default
  | 'text' // short text
  | 'textarea' // notes
  | 'digits' // an identifier made of digits only (the leading zero is kept: a string)
  | 'int' // whole number
  | 'decimal' // at most 2 places ("6,5" or "6.5")
  | 'checks' // ticks (more than one allowed)
  | 'choice' // one choice of several (or none)
  | 'yesno'; // Sì / No / not answered

export type Unit = 'kg' | 'persone' | 'mm' | 'm';

export type SectionKey =
  | 'impianto'
  | 'ubicazione'
  | 'tipologia'
  | 'funi'
  | 'limitatore'
  | 'cavi'
  | 'serrature'
  | 'allarme'
  | 'note'
  | 'quadro'
  | 'argano';

/**
 * When a field makes sense: an earlier field of the form has one of `values` — for Sì/No that is 'si', for ticks one of
 * those listed is enough. Otherwise the field is not shown and not stored (null).
 */
export interface Condition {
  field: string;
  values: readonly string[];
}

interface BaseField {
  key: string;
  kind: FieldKind;
  /** On a whole row of the form and of the PDF (address, notes). */
  wide?: boolean;
  when?: Condition;
  /** In the form the label is a question (`scheda.question.<key>`); on the sheet `scheda.field.<key>`. */
  question?: boolean;
  /** With "Sì" it carries the table of the old push-button panels' measurements, a row per stop (misure.ts). */
  misure?: boolean;
  /** With "Sì" it opens the supplier's module (ordini/) — its own PDF, apart from the sheet. */
  modulo?: 'ordineQuadro' | 'preventivoArgano' | 'ordineSospensioni';
}

export interface TextField extends BaseField {
  kind: 'text' | 'textarea' | 'digits';
  maxLength: number;
}

export interface NumberField extends BaseField {
  kind: 'int' | 'decimal';
  min: number;
  max: number;
  unit?: Unit;
}

export interface OptionsField extends BaseField {
  kind: 'checks' | 'choice';
  options: readonly string[];
}

export interface PlainField extends BaseField {
  kind: 'date' | 'yesno';
  /** Sì/No with words of its own and in this order (`scheda.option.<key>.no|si`): «Accessi: 1 / 2» is «Doppio accesso:
   *  No / Sì». The record and the linked data stay Sì/No. */
  risposte?: readonly ['no', 'si'];
}

export type FieldDef = TextField | NumberField | OptionsField | PlainField;

export interface SectionDef {
  key: SectionKey;
  fields: readonly FieldDef[];
}

export function isTextField(field: FieldDef): field is TextField {
  return field.kind === 'text' || field.kind === 'textarea' || field.kind === 'digits';
}

export function isNumberField(field: FieldDef): field is NumberField {
  return field.kind === 'int' || field.kind === 'decimal';
}

export function isOptionsField(field: FieldDef): field is OptionsField {
  return field.kind === 'checks' || field.kind === 'choice';
}
