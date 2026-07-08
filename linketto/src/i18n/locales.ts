// Единственото място, което се пипа при добавяне на нов език.
// Езици с непълни преводи автоматично падат към en (виж request.ts).

export const LOCALES = ['bg', 'en', 'it', 'es', 'de', 'fr'] as const;

export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = 'en';

// Езици отдясно-наляво — когато добавим ar/he/fa, само се изброяват тук;
// <html dir> се сменя автоматично.
export const RTL_LOCALES: readonly string[] = ['ar', 'he', 'fa'];

export const LOCALE_NAMES: Record<Locale, string> = {
  bg: 'Български',
  en: 'English',
  it: 'Italiano',
  es: 'Español',
  de: 'Deutsch',
  fr: 'Français',
};

export function isLocale(value: string): value is Locale {
  return (LOCALES as readonly string[]).includes(value);
}

export function dirFor(locale: string): 'ltr' | 'rtl' {
  return RTL_LOCALES.includes(locale) ? 'rtl' : 'ltr';
}

// Най-добро съвпадение по Accept-Language за публичните профили.
export function bestLocale(
  acceptLanguage: string | null,
  available: readonly string[],
  fallback: string,
): string {
  if (!acceptLanguage) return fallback;
  const wanted = acceptLanguage
    .split(',')
    .map((part) => {
      const [tag, qPart] = part.trim().split(';q=');
      return { tag: tag.toLowerCase(), q: qPart ? Number(qPart) : 1 };
    })
    .filter((item) => item.tag && !Number.isNaN(item.q))
    .sort((a, b) => b.q - a.q);
  for (const { tag } of wanted) {
    const exact = available.find((loc) => loc.toLowerCase() === tag);
    if (exact) return exact;
    const base = tag.split('-')[0];
    const partial = available.find((loc) => loc.toLowerCase() === base);
    if (partial) return partial;
  }
  return fallback;
}
