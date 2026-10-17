import type { FormValues } from '../schede/field-parsers.js';
import type { FieldDef } from '../schede/field-types.js';
import { AUTO_KEY, campiCollegati, NOMI_SEGUACI } from './collegamenti.js';
import { prefillCollegati } from './collegati.js';
import { fieldsOf, type ModuloField } from './moduli.js';
import { predefiniti, prefillToken, type PrefillContext } from './prefill.js';
import { SLOTS, type ModuloSlot } from './registry.js';
import { moduloFormValues, nameOf, shownName } from './valori.js';

/**
 * Модулите на доставчиците във формата на картата. При първото отваряне (няма знак `<префикс>-_`)
 * идват попълнени от огледа, от другия модул и от човека, който пише; после — каквото е въведено или
 * записано. `auto` са полетата, попълнени така (свързаните — и със стойността на празния модул: „Loc.
 * Macc. in ALTO“), или върнати от браузъра като още следващи (и полета на картата, попълнени от
 * модул): браузърът ги води след източника им, докато човекът не пише в тях (public/js/collegati.js,
 * moduli.js).
 */
export function withPrefill(
  values: FormValues,
  ctx: Omit<PrefillContext, 'values'>,
): { values: FormValues; auto: Set<string> } {
  const out: FormValues = { ...values };
  const claimed = values[AUTO_KEY];
  const auto = new Set<string>(
    typeof claimed === 'string' ? claimed.split(' ').filter((name) => NOMI_SEGUACI.has(name)) : [],
  );
  for (const slot of SLOTS) {
    if (values[shownName(slot.prefix)] === '1') continue;
    const linked = prefillCollegati(slot.prefix, values);
    const predefinito = predefiniti(slot.modulo);
    const token = prefillToken(slot.modulo, { ...ctx, values });
    for (const key of campiCollegati(slot.prefix)) {
      if (Object.hasOwn(linked, key) || Object.hasOwn(predefinito, key)) {
        auto.add(nameOf(slot.prefix, key));
      }
    }
    for (const key of Object.keys(token)) auto.add(nameOf(slot.prefix, key));
    const valori = { ...predefinito, ...token, ...linked };
    Object.assign(out, moduloFormValues(slot.modulo, slot.prefix, valori));
  }
  return { values: out, auto };
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

/**
 * След кое поле на раздела стои всеки модул във формата: след въпроса си и полетата, които зависят от
 * него (и от тях — „Numero sospensioni“), преди следващото поле без връзка с въпроса — бележките на
 * раздела са след модула. Ключът е полето, стойността — колоните на модулите след него.
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
