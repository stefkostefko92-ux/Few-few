// Interface languages: Italian (default, the market), English and Bulgarian.
export const LOCALES = ['it', 'en', 'bg'] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = 'it';

export const isLocale = (x: unknown): x is Locale => typeof x === 'string' && (LOCALES as readonly string[]).includes(x);

/** BCP 47 tags for number and date formatting. */
export const INTL_LOCALE: Record<Locale, string> = { it: 'it-IT', en: 'en-GB', bg: 'bg-BG' };
