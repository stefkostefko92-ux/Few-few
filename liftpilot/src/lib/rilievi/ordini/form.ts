// The suppliers' modules in the sheet's form. At the first opening (no `<prefix>-_` mark) they come prefilled from the
// survey and from the person writing; afterwards with what was typed or stored. Ported 1:1 from rilievi
// (src/ordini/form.ts), plus the plain description of a module the form renders (`moduloSpec`).
import type { FormValues } from '../field-parsers';
import type { ModuloLookup } from '../form-help';
import { fieldsOf, type ModuloField } from './moduli';
import { prefillValori, type PrefillContext } from './prefill';
import { SLOTS, type ModuloSlot } from './registry';
import { moduloFormValues, nameOf, shownName } from './valori';

export function withPrefill(values: FormValues, ctx: Omit<PrefillContext, 'values'>): FormValues {
  const out: FormValues = { ...values };
  for (const slot of SLOTS) {
    if (values[shownName(slot.prefix)] === '1') continue;
    const valori = prefillValori(slot.modulo, { ...ctx, values });
    Object.assign(out, moduloFormValues(slot.modulo, slot.prefix, valori));
  }
  return out;
}

/** A module's field by its name in the form (`oq-cliente`) — for the summary of the errors. */
export function moduloFieldOf(name: string): { slot: ModuloSlot; field: ModuloField } | null {
  for (const slot of SLOTS) {
    if (!name.startsWith(`${slot.prefix}-`)) continue;
    const field = fieldsOf(slot.modulo).find((f) => nameOf(slot.prefix, f.key) === name);
    if (field) return { slot, field };
  }
  return null;
}

/** The errors' lookup of a module's field over the maps (form-help.ts): the server's and the tests' (the form uses its
 *  specs instead, specLookup). */
export const moduloLookup: ModuloLookup = (name) => {
  const hit = moduloFieldOf(name);
  return hit ? { label: hit.field.label, fornitore: hit.slot.modulo.fornitore, maxLength: hit.field.kind === 'check' ? null : hit.field.maxLength } : null;
};

/** One field of a module as the form renders it: its input name, kind, label (verbatim from the supplier's paper,
 *  never translated), whether the label is only for screen readers, the length bound and the prefill token. */
export interface ModuloFieldSpec {
  name: string;
  key: string;
  kind: 'check' | 'text' | 'textarea';
  label: string;
  labelHidden: boolean;
  maxLength: number | null;
  prefill: string | null;
}

/** A module as the form renders it, plain data (serialisable from a server component to a client one): its groups and
 *  rows in the order of the paper, the arrow before the field `freccia` of a row. */
export interface ModuloSpec {
  column: ModuloSlot['column'];
  question: ModuloSlot['question'];
  prefix: string;
  /** the hidden input `<prefix>-_` = '1', always rendered inside the module */
  shownName: string;
  path: ModuloSlot['path'];
  id: string;
  titolo: string;
  fornitore: string;
  gruppi: { titolo: string; righe: { freccia: number | null; campi: ModuloFieldSpec[] }[] }[];
}

export function moduloSpec(slot: ModuloSlot): ModuloSpec {
  const { modulo } = slot;
  return {
    column: slot.column, question: slot.question, prefix: slot.prefix, shownName: shownName(slot.prefix), path: slot.path,
    id: modulo.id, titolo: modulo.titolo, fornitore: modulo.fornitore,
    gruppi: modulo.gruppi.map((g) => ({
      titolo: g.titolo,
      righe: g.righe.map((r) => ({
        freccia: r.freccia ?? null,
        campi: (r.campi as ModuloField[]).map((f) => ({
          name: nameOf(slot.prefix, f.key), key: f.key, kind: f.kind, label: f.label, labelHidden: f.labelNascosta === true,
          maxLength: f.kind === 'check' ? null : f.maxLength, prefill: f.prefill ?? null,
        })),
      })),
    })),
  };
}

/** Both modules, in the order of the sheet (Pelazza under «Quadro», Montanari under «Argano»). */
export const moduloSpecs = (): ModuloSpec[] => SLOTS.map(moduloSpec);
