/**
 * Адресите в Peppol: `схема:идентификатор`. За България EAS 9926 е ДДС номерът с „BG“ (Peppol Party
 * Identifiers; EN 16931 BT-34/BT-49). ЕИК без ДДС регистрация няма схема в Peppol — фирма без ДДС номер
 * не се регистрира.
 */
export const BG_VAT_SCHEME = '9926';
const BG_VAT = /^BG\d{9,10}$/;
const PARTY_ID = /^\d{4}:[A-Za-z0-9][A-Za-z0-9.:_-]{1,99}$/;

export function partyIdForVat(vatNumber: string | null | undefined): string | null {
  const vat = vatNumber?.trim().toUpperCase().replace(/\s+/g, '') ?? '';
  return BG_VAT.test(vat) ? `${BG_VAT_SCHEME}:${vat}` : null;
}

/** Електронният адрес от документа (BT-49) като адрес в Peppol или null. */
export function partyIdFromAddress(
  address: { scheme: string; value: string } | undefined | null,
): string | null {
  if (!address) return null;
  const id = `${address.scheme.trim()}:${address.value.trim()}`;
  return PARTY_ID.test(id) ? id : null;
}
