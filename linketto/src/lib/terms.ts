// Общите условия при регистрация (чисто, тества се). ЗЗП чл. 147а: ОУ обвързват
// потребителя, ако са му предоставени и той се е съгласил — изрична отметка (прост е-подпис)
// и запис на версията (User.termsAcceptedAt/termsVersion). Вдигай версията при промяна на ОУ.
export const TERMS_VERSION = '2026-11-22';

/** Отметката „Приемам Общите условия“ — само точната стойност от формата. */
export function termsAccepted(value: FormDataEntryValue | null | undefined): boolean {
  return value === '1';
}
