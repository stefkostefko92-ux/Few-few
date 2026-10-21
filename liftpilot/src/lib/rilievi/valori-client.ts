// Values in the sheet's form, shared by the browser's rules for the modules' survey fields (prefill-client.ts) and for
// the linked data (collegati-client.ts): numbers the Italian way, the option of a list for a text, what a field of the
// sheet takes. Pure (no maps, no DOM). The same rules as the server's: numeri.ts (stessoValore, coppiaDi) and
// ordini/opzioni.ts (opzioneDi). Ported 1:1 from rilievi (public/js/valori.js, commit 988f3cf37).
import type { FieldKind } from './field-types';
import { numeriDi, stessoValore, coppiaDi } from './ordini/numeri';
import { opzioneDi } from './ordini/opzioni';

/** The same value: the same numbers in the same order; a text without numbers — the same text. */
export const same = stessoValore;

/** Two lines for one thing («LUCE PORTA: [800] x [2000]») as one value. */
export const pairOf = coppiaDi;

const NUMBER = /[1-9]\d{0,2}(?:\.\d{3})+(?:,\d+)?|\d+(?:[.,]\d+)?/g;

/** The reverse: the value's numbers in the two lines; none or more than two — both empty (rilievi's splitPair). */
export function splitPair(value: string): [string, string] {
  const parts = value.match(NUMBER) ?? [];
  return parts.length <= 2 ? [parts[0] ?? '', parts[1] ?? ''] : ['', ''];
}

/** The option of a list for a text (`options`: the list's option values; the empty "—" is skipped): the same word
 *  («Selcom» → «SELCOM»), otherwise the only option with the same numbers («24 V DC» → «24Vcc»); otherwise ''. */
export function optionFor(options: readonly string[], value: string): string {
  return opzioneDi(options.filter(Boolean), value) ?? '';
}

/** A field of the sheet as the browser sees it (collegati-browser.ts CampoScheda). */
export interface SheetField {
  kind?: FieldKind;
  min?: number;
  max?: number;
  maxLength?: number;
}

/**
 * A value goes into a field of the sheet only as the field would take it (fields.ts): a whole number in its range, a
 * decimal with two digits at most, digits only (a leading zero stays), or text up to its length. Anything else — nothing.
 */
export function forSheet(field: SheetField, text: string): string {
  const numbers = numeriDi(text);
  if (field.kind === 'int' || field.kind === 'decimal') {
    const n = numbers[0];
    const ok = numbers.length === 1 && n !== undefined && field.min !== undefined && field.max !== undefined && n >= field.min && n <= field.max;
    if (field.kind === 'int') return ok && Number.isInteger(n) ? String(n) : '';
    const out = String(n).replace('.', ',');
    return ok && /^\d+(?:,\d{1,2})?$/.test(out) ? out : '';
  }
  if (field.kind === 'digits') {
    const runs = text.match(/\d+/g) ?? [];
    const [run] = runs;
    return runs.length === 1 && run !== undefined && field.maxLength !== undefined && run.length <= field.maxLength ? run : '';
  }
  return field.maxLength ? text.slice(0, field.maxLength) : text;
}
