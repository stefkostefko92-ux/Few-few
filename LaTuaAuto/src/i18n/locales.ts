// Единственото място за добавяне на език. Италиански е източникът на истината
// за този продукт (IT пазар); непълните преводи падат към it (request.ts).
export const LOCALES = ['it', 'en', 'de'] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = 'it';

export const LOCALE_NAMES: Record<Locale, string> = {
  it: 'Italiano',
  en: 'English',
  de: 'Deutsch',
};

export const OG_LOCALE: Record<Locale, string> = {
  it: 'it_IT',
  en: 'en_GB',
  de: 'de_IT', // Alto Adige / Südtirol
};

export function isLocale(value: string): value is Locale {
  return (LOCALES as readonly string[]).includes(value);
}

/** Избор по Accept-Language: първият поддържан език или подразбирането. */
export function bestLocale(acceptLanguage: string | null, fallback: Locale = DEFAULT_LOCALE): Locale {
  if (!acceptLanguage) return fallback;
  for (const part of acceptLanguage.split(',')) {
    const tag = part.split(';')[0]?.trim().toLowerCase() ?? '';
    const base = tag.split('-')[0] ?? '';
    if (isLocale(base)) return base;
  }
  return fallback;
}
