// The suppliers' modules in the sheet's form. At the first opening (no `<prefix>-_` mark) they come prefilled from the
// survey, from the other module and from the person writing; afterwards with what was typed or stored. `auto` are the
// fields filled so (the linked ones — also with the blank module's value: «Loc. Macc. in ALTO»), or sent back by the
// browser as still following (and fields of the sheet filled from a module): the browser leads them after their source
// until the person types in them (collegati-client.ts, prefill-client.ts). `scritti` are the survey's fields of a module
// already being filled in (stored or sent back) that are empty although the survey has a value for them: the person
// emptied them — the browser does not fill them again (the owner, 21 October 2026: MoviLift's deleted e-mail came back).
// Ported 1:1 from rilievi (src/ordini/form.ts, commit 988f3cf37), plus the plain description of a module the form renders
// (`moduloSpec`).
import type { FormValues } from '../field-parsers';
import type { ModuloLookup } from '../form-help';
import { AUTO_KEY, campiCollegati, collegatiDelGruppo, NOMI_SEGUACI } from './collegamenti';
import { prefillCollegati } from './collegati';
import { fieldsOf, type ModuloField } from './moduli';
import { predefiniti, prefillToken, type PrefillContext } from './prefill';
import { SLOTS, type ModuloSlot, type Prefisso } from './registry';
import { moduloFormValues, nameOf, shownName } from './valori';

export { moduliDopo } from './dopo';

export function withPrefill(
  values: FormValues,
  ctx: Omit<PrefillContext, 'values'>,
): { values: FormValues; auto: Set<string>; scritti: Set<string> } {
  const out: FormValues = { ...values };
  const claimed = values[AUTO_KEY];
  const auto = new Set<string>(typeof claimed === 'string' ? claimed.split(' ').filter((name) => NOMI_SEGUACI.has(name)) : []);
  const scritti = new Set<string>();
  for (const slot of SLOTS) {
    const token = prefillToken(slot.modulo, { ...ctx, values });
    if (values[shownName(slot.prefix)] === '1') {
      for (const key of Object.keys(token)) {
        const name = nameOf(slot.prefix, key);
        if (values[name] === undefined || values[name] === '') scritti.add(name);
      }
      continue;
    }
    const linked = prefillCollegati(slot.prefix, values);
    const predefinito = predefiniti(slot.modulo);
    for (const key of campiCollegati(slot.prefix)) {
      if (Object.hasOwn(linked, key) || Object.hasOwn(predefinito, key)) auto.add(nameOf(slot.prefix, key));
    }
    for (const key of Object.keys(token)) auto.add(nameOf(slot.prefix, key));
    const valori = { ...predefinito, ...token, ...linked };
    Object.assign(out, moduloFormValues(slot.modulo, slot.prefix, valori));
  }
  return { values: out, auto, scritti };
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

/** The maxlength of a module's field (lines and notes), or null (ticks, radio groups, lists). */
const maxLengthOf = (f: ModuloField): number | null => ('maxLength' in f ? f.maxLength : null);

/** The errors' lookup of a module's field over the maps (form-help.ts): the server's and the tests' (the form uses its
 *  specs instead, specLookup). A sheet without a supplier (the argano sheet) is named by its title. */
export const moduloLookup: ModuloLookup = (name) => {
  const hit = moduloFieldOf(name);
  return hit ? { label: hit.field.label, fornitore: hit.slot.modulo.fornitore ?? hit.slot.modulo.titolo, maxLength: maxLengthOf(hit.field) } : null;
};

/** One field of a module as the form renders it: its input name, kind, label (verbatim from the supplier's paper, never
 *  translated), whether the label is only for screen readers, the length bound, the prefill token, the options of a radio
 *  group (by `valore`, in the order of the paper) or of a list (`valore` = `label` = the option), and the blank module's
 *  value (`predefinito`: a radio's `valore`, a line's text, true for a tick ticked on the blank paper). */
export interface ModuloFieldSpec {
  name: string;
  key: string;
  kind: 'check' | 'text' | 'textarea' | 'radio' | 'select';
  label: string;
  labelHidden: boolean;
  maxLength: number | null;
  prefill: string | null;
  opzioni: { valore: string; label: string }[] | null;
  predefinito: string | true | null;
}

/** A module as the form renders it, plain data (serialisable from a server component to a client one): its groups and
 *  rows in the order of the paper, the row's printed heading (`titolo`, «Norme di riferimento» — before its fields, a group
 *  for screen readers), the arrow before the field `freccia` of a row, and under each group the compared links with a
 *  field in it (`diff`, the keys of collegati-browser.ts — the list of discrepancies goes under the group). */
export interface ModuloSpec {
  column: ModuloSlot['column'];
  question: ModuloSlot['question'];
  /** the make it opens with (the panel: Pelazza, MoviLift or Mastech under one question), or null — with every make */
  marca: { field: 'quadroMarca'; value: string } | null;
  /** and the panel's model under the make (Mastech: NG120 or QI Touch — a second wrapper), or null */
  modello: { field: 'quadroModello'; value: string } | null;
  prefix: Prefisso;
  /** the hidden input `<prefix>-_` = '1', always rendered inside the module */
  shownName: string;
  path: ModuloSlot['path'];
  id: string;
  titolo: string;
  /** the supplier, or null (the argano sheet is for every kind of machine) */
  fornitore: string | null;
  /** «Titolo · Fornitore» or the title alone (moduli.ts nomeModulo) */
  nome: string;
  gruppi: { titolo: string; diff: string[]; righe: { titolo: string | null; freccia: number | null; campi: ModuloFieldSpec[] }[] }[];
}

function fieldSpec(prefix: string, f: ModuloField): ModuloFieldSpec {
  const opzioni = f.kind === 'radio' ? f.opzioni.map((o) => ({ valore: o.valore, label: o.label })) : f.kind === 'select' ? f.opzioni.map((o) => ({ valore: o, label: o })) : null;
  const predefinito = 'predefinito' in f && f.predefinito !== undefined ? f.predefinito : null;
  return {
    name: nameOf(prefix, f.key), key: f.key, kind: f.kind, label: f.label, labelHidden: f.labelNascosta === true, maxLength: maxLengthOf(f),
    prefill: 'prefill' in f && f.prefill ? f.prefill : null, opzioni, predefinito,
  };
}

export function moduloSpec(slot: ModuloSlot): ModuloSpec {
  const { modulo } = slot;
  return {
    column: slot.column, question: slot.question, marca: slot.marca ?? null, modello: slot.modello ?? null, prefix: slot.prefix, shownName: shownName(slot.prefix), path: slot.path,
    id: modulo.id, titolo: modulo.titolo, fornitore: modulo.fornitore ?? null, nome: modulo.fornitore ? `${modulo.titolo} · ${modulo.fornitore}` : modulo.titolo,
    gruppi: modulo.gruppi.map((g) => ({
      titolo: g.titolo,
      diff: collegatiDelGruppo(slot.prefix, g.righe.flatMap((r) => (r.campi as ModuloField[]).map((f) => f.key))),
      righe: g.righe.map((r) => ({
        titolo: r.titolo ?? null,
        freccia: r.freccia ?? null,
        campi: (r.campi as ModuloField[]).map((f) => fieldSpec(slot.prefix, f)),
      })),
    })),
  };
}

/** Every module, in the order of the registry (the panel's Pelazza, MoviLift, Mastech NG120 and QI Touch, the argano
 *  sheet, 2SG's sheet). The form puts each after the last field of its question's chain (`moduliDopo` — rilievi form.ejs:
 *  before the section's notes). */
export const moduloSpecs = (): ModuloSpec[] => SLOTS.map(moduloSpec);
