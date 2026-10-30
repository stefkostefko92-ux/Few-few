// Where each supplier's module stands in the sheet's form (rilievi src/ordini/form.ts moduliDopo, commit 988f3cf37 —
// re-exported from ordini/form.ts as there). Apart from form.ts and with type-only imports, so that a client component
// can place the modules without pulling the maps (rilievi-client-bundle.test.ts).
import type { FieldDef } from '../field-types';
import type { ModuloSlot } from './registry';

/**
 * After which field of the section each module stands in the form: after its question and the fields that depend on it
 * (and on them — «Numero sospensioni»), before the next field with no link to the question — the section's notes come
 * after the module. The key is the field, the value — the columns of the modules after it.
 */
export function moduliDopo(fields: readonly FieldDef[]): Map<string, ModuloSlot['column'][]> {
  const out = new Map<string, ModuloSlot['column'][]>();
  fields.forEach((field, i) => {
    if (!field.modulo) return;
    const legati = new Set([field.key]);
    let ultimo = field.key;
    for (const next of fields.slice(i + 1)) {
      if (!next.when || !legati.has(next.when.field)) continue;
      legati.add(next.key);
      ultimo = next.key;
    }
    out.set(ultimo, [...(out.get(ultimo) ?? []), field.modulo]);
  });
  return out;
}
