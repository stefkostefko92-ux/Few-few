import { LOCALE_TAG, type Locale } from '../i18n.js';
import { BUSINESS_TZ } from '../time.js';

/**
 * Датите в писмата — един формат за всички: дълга дата по София („4 октомври 2026 г.“, „4 October
 * 2026“). В BG дългият формат сам завършва с „г.“ — текстът не слага точка след `{date}`.
 */
export function longDate(at: Date, locale: Locale): string {
  return new Intl.DateTimeFormat(LOCALE_TAG[locale], {
    dateStyle: 'long',
    timeZone: BUSINESS_TZ,
  }).format(at);
}

/** Дата и час по София — за момент (вход, сключване, отказ), не за срок. */
export function longDateTime(at: Date, locale: Locale): string {
  return new Intl.DateTimeFormat(LOCALE_TAG[locale], {
    dateStyle: 'long',
    timeStyle: 'short',
    timeZone: BUSINESS_TZ,
  }).format(at);
}
