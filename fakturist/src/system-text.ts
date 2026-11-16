import type { Locale } from './i18n.js';

/**
 * Текстовете, които системата сама записва в базата на български и после показва: името на началната
 * серия, грешките към точката за достъп на Peppol, бележката на плащане от банково извлечение. В
 * базата остават както са (серията се преименува от човека; грешката е запис), а изгледът на английски
 * ги показва преведени. Непознат текст — въведен от човек или върнат от доставчика — остава същият.
 * Местата, които ги записват, ползват константите оттук — тестът пази, че всяка има превод.
 */
export const DEFAULT_SERIES_NAME = 'Основна';
export const AP_NO_RESPONSE = 'Точката за достъп не отговори';
export const AP_BAD_CREDENTIALS = 'eConnect отказа данните на клиента';
export const AP_NO_TOKEN = 'eConnect identity: няма access_token';
export const AP_TOO_LARGE = 'Полученият документ е над 2 MB';
export const AP_NO_UBL = 'Документът няма UBL';
export const UNKNOWN_ERROR = 'Неизвестна грешка';
export const GENERIC_ERROR = 'Грешка';
export const BANK_NOTE = 'Извлечение';
export const BANK_NOTE_REF = 'Извлечение, реф. ';

export const SYSTEM_TEXT_EN: Readonly<Record<string, string>> = {
  [DEFAULT_SERIES_NAME]: 'Main',
  [AP_NO_RESPONSE]: 'The access point did not respond',
  [AP_BAD_CREDENTIALS]: 'eConnect rejected the client credentials',
  [AP_NO_TOKEN]: 'eConnect identity: no access_token',
  [AP_TOO_LARGE]: 'The received document is over 2 MB',
  [AP_NO_UBL]: 'The document has no UBL',
  [UNKNOWN_ERROR]: 'Unknown error',
  [GENERIC_ERROR]: 'Error',
  [BANK_NOTE]: 'Bank statement',
  // Записано преди кода `terminated` (src/accounts/termination.ts) — старите шаблони го носят така.
  'Фирмата е прекратена.': 'The company is terminated.',
};

/** Записаният от системата текст на езика на изгледа. */
export function systemText(value: string, locale: Locale): string {
  if (locale === 'bg') return value;
  const known = SYSTEM_TEXT_EN[value];
  if (known !== undefined) return known;
  if (value.startsWith(BANK_NOTE_REF)) {
    return `Bank statement, ref. ${value.slice(BANK_NOTE_REF.length)}`;
  }
  return value;
}
