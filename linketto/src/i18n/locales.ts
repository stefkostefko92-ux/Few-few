// Единственото място, което се пипа при добавяне на нов език.
// Езици с непълни преводи автоматично падат към en (виж request.ts).
//
// Покритие: всичките 24 официални езика на ЕС + 3 италиански диалекта
// (неаполитански nap, сицилиански scn, ломбардски/милански lmo).

export const LOCALES = [
  // първоначалните
  'bg',
  'en',
  'it',
  'es',
  'de',
  'fr',
  // останалите официални езици на ЕС
  'pt',
  'nl',
  'pl',
  'ro',
  'el',
  'sv',
  'da',
  'fi',
  'cs',
  'sk',
  'sl',
  'hr',
  'hu',
  'et',
  'lv',
  'lt',
  'ga',
  'mt',
  // италиански диалекти
  'nap',
  'scn',
  'lmo',
] as const;

export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = 'en';

// Езици отдясно-наляво — когато добавим ar/he/fa, само се изброяват тук;
// <html dir> се сменя автоматично. (Нито един от текущите не е RTL.)
export const RTL_LOCALES: readonly string[] = ['ar', 'he', 'fa'];

export const LOCALE_NAMES: Record<Locale, string> = {
  bg: 'Български',
  en: 'English',
  it: 'Italiano',
  es: 'Español',
  de: 'Deutsch',
  fr: 'Français',
  pt: 'Português',
  nl: 'Nederlands',
  pl: 'Polski',
  ro: 'Română',
  el: 'Ελληνικά',
  sv: 'Svenska',
  da: 'Dansk',
  fi: 'Suomi',
  cs: 'Čeština',
  sk: 'Slovenčina',
  sl: 'Slovenščina',
  hr: 'Hrvatski',
  hu: 'Magyar',
  et: 'Eesti',
  lv: 'Latviešu',
  lt: 'Lietuvių',
  ga: 'Gaeilge',
  mt: 'Malti',
  nap: 'Napulitano',
  scn: 'Sicilianu',
  lmo: 'Lombard',
};

// og:locale иска language_TERRITORY. Диалектите ползват it_IT.
export const OG_LOCALE: Record<Locale, string> = {
  bg: 'bg_BG',
  en: 'en_US',
  it: 'it_IT',
  es: 'es_ES',
  de: 'de_DE',
  fr: 'fr_FR',
  pt: 'pt_PT',
  nl: 'nl_NL',
  pl: 'pl_PL',
  ro: 'ro_RO',
  el: 'el_GR',
  sv: 'sv_SE',
  da: 'da_DK',
  fi: 'fi_FI',
  cs: 'cs_CZ',
  sk: 'sk_SK',
  sl: 'sl_SI',
  hr: 'hr_HR',
  hu: 'hu_HU',
  et: 'et_EE',
  lv: 'lv_LV',
  lt: 'lt_LT',
  ga: 'ga_IE',
  mt: 'mt_MT',
  nap: 'it_IT',
  scn: 'it_IT',
  lmo: 'it_IT',
};

export function isLocale(value: string): value is Locale {
  return (LOCALES as readonly string[]).includes(value);
}

// ── Автоматичен избор на език по геолокация (държава/регион от IP) ─────
// Държава → основен език, който поддържаме. Езиково смесените държави
// (Белгия, Швейцария, Люксембург) нарочно ги няма — там пада към
// Accept-Language, който е по-точен.
const COUNTRY_LOCALE: Record<string, Locale> = {
  BG: 'bg',
  HR: 'hr',
  CZ: 'cs',
  DK: 'da',
  NL: 'nl',
  EE: 'et',
  FI: 'fi',
  FR: 'fr',
  DE: 'de',
  AT: 'de',
  GR: 'el',
  CY: 'el',
  HU: 'hu',
  IT: 'it',
  LV: 'lv',
  LT: 'lt',
  MT: 'mt',
  PL: 'pl',
  PT: 'pt',
  RO: 'ro',
  SK: 'sk',
  SI: 'sl',
  ES: 'es',
  SE: 'sv',
  IE: 'en',
  GB: 'en',
  US: 'en',
};

// Италиански регион → диалект (когато CDN подава регион). Само IT.
function regionDialect(
  country?: string | null,
  region?: string | null,
): Locale | null {
  if (!country || country.toUpperCase() !== 'IT' || !region) return null;
  const r = region.toLowerCase();
  if (r.includes('campania') || r.includes('napoli') || r.includes('naples'))
    return 'nap';
  if (r.includes('sicil')) return 'scn';
  if (r.includes('lombard')) return 'lmo';
  return null;
}

/**
 * Езикът по геолокация: регион-диалект → държава-език → Accept-Language →
 * fallback. `available` ограничава избора (напр. до преводите на профил).
 */
export function localeFromGeo(opts: {
  country?: string | null;
  region?: string | null;
  acceptLanguage?: string | null;
  available?: readonly string[];
  fallback: string;
}): string {
  const available = opts.available ?? LOCALES;
  const ok = (loc: string | null | undefined): string | null =>
    loc && (available as readonly string[]).includes(loc) ? loc : null;

  const dialect = regionDialect(opts.country, opts.region);
  const byCountry = opts.country
    ? COUNTRY_LOCALE[opts.country.toUpperCase()]
    : null;
  return (
    ok(dialect) ??
    ok(byCountry) ??
    bestLocale(opts.acceptLanguage ?? null, available, opts.fallback)
  );
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
