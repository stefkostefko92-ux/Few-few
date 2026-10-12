import type { FormValues } from '../schede/field-parsers.js';
import { fieldsOf, type ModuloField } from './moduli.js';
import { prefillValori, type PrefillContext } from './prefill.js';
import { SLOTS, type ModuloSlot } from './registry.js';
import { moduloFormValues, nameOf, shownName } from './valori.js';

/**
 * Модулите на доставчиците във формата на картата. При първото отваряне (няма знак `<префикс>-_`)
 * идват попълнени от огледа и от човека, който пише; после — каквото е въведено или записано.
 */
export function withPrefill(values: FormValues, ctx: Omit<PrefillContext, 'values'>): FormValues {
  const out: FormValues = { ...values };
  for (const slot of SLOTS) {
    if (values[shownName(slot.prefix)] === '1') continue;
    const valori = prefillValori(slot.modulo, { ...ctx, values });
    Object.assign(out, moduloFormValues(slot.modulo, slot.prefix, valori));
  }
  return out;
}

/** Поле от модул по името му във формата (`oq-cliente`) — за обобщението на грешките. */
export function moduloFieldOf(name: string): { slot: ModuloSlot; field: ModuloField } | null {
  for (const slot of SLOTS) {
    if (!name.startsWith(`${slot.prefix}-`)) continue;
    const field = fieldsOf(slot.modulo).find((f) => nameOf(slot.prefix, f.key) === name);
    if (field) return { slot, field };
  }
  return null;
}
