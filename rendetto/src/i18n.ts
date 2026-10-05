import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from './paths.js';

/**
 * Езиците на продукта. **Българският е източникът на истината** — пише се първо и от него се
 * превежда; английският и италианският са пълни огледала (тестът гейтва паритета на ключовете).
 */
export const LOCALES = ['bg', 'en', 'it'] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = 'bg';

export const LOCALE_LABEL: Record<Locale, string> = {
  bg: 'Български',
  en: 'English',
  it: 'Italiano',
};

/** BCP-47 за Intl форматиране. */
export const LOCALE_TAG: Record<Locale, string> = { bg: 'bg-BG', en: 'en-GB', it: 'it-IT' };

/** Езикът за Open Graph (`bg_BG`) — от LOCALE_TAG, за да не се разминат собственият и алтернативните. */
export function ogLocale(locale: Locale): string {
  return LOCALE_TAG[locale].replace('-', '_');
}

type Dictionary = Record<string, string>;

/** Влагането в JSON е за четимост; вътре работим с плоски ключове `auth.loginTitle`. */
function flatten(
  value: unknown,
  prefix = '',
  out: Dictionary = Object.create(null) as Dictionary,
): Dictionary {
  if (typeof value === 'string') {
    out[prefix] = value;
    return out;
  }
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    for (const [key, nested] of Object.entries(value)) {
      flatten(nested, prefix ? `${prefix}.${key}` : key, out);
    }
  }
  return out;
}

/** `locales/<език>/*.json` — по един файл за раздел (common, auth, admin…), слети в един речник. */
function load(): Record<Locale, Dictionary> {
  const dictionaries = {} as Record<Locale, Dictionary>;
  for (const locale of LOCALES) {
    const dir = join(ROOT, 'locales', locale);
    const merged: Dictionary = Object.create(null) as Dictionary;
    const files = readdirSync(dir).filter((name) => name.endsWith('.json'));
    for (const file of files.sort()) {
      const part = flatten(JSON.parse(readFileSync(join(dir, file), 'utf8')) as unknown);
      for (const [key, value] of Object.entries(part)) {
        if (key in merged) throw new Error(`повторен ключ ${key} в locales/${locale}/${file}`);
        merged[key] = value;
      }
    }
    dictionaries[locale] = merged;
  }
  return dictionaries;
}

let cache: Record<Locale, Dictionary> | null = null;

function dictionaries(): Record<Locale, Dictionary> {
  cache ??= load();
  return cache;
}

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value);
}

/** Езикът на акаунта (писмата, страниците след вход); непознат запис — подразбиращият се език. */
export function accountLocale(user: { locale: string }): Locale {
  return isLocale(user.locale) ? user.locale : DEFAULT_LOCALE;
}

export function keysOf(locale: Locale): string[] {
  return Object.keys(dictionaries()[locale]).sort();
}

export function hasKey(locale: Locale, key: string): boolean {
  return Object.hasOwn(dictionaries()[locale], key);
}

const pluralRules = new Map<Locale, Intl.PluralRules>();

/** Формата за брой: `ключ.one` / `ключ.other` според правилата на езика (1 месец, 3 месеца). */
function pluralKey(locale: Locale, key: string, count: number): [string, string] {
  let rules = pluralRules.get(locale);
  if (!rules) {
    rules = new Intl.PluralRules(LOCALE_TAG[locale]);
    pluralRules.set(locale, rules);
  }
  return [`${key}.${rules.select(count)}`, `${key}.other`];
}

const IT_MONTHS =
  'gennaio|febbraio|marzo|aprile|maggio|giugno|luglio|agosto|settembre|ottobre|novembre|dicembre';
/** В италианския членът се слива пред 1, 8 и 11: „l'8 ottobre“, „dall'11 marzo“ — не „il 8“, „dal 11“. */
const IT_ELISION = new RegExp(`\\b(il|dal|al|del|nel|sul) (1|8|11) (${IT_MONTHS})\\b`, 'gi');
const IT_ELIDED: Readonly<Record<string, string>> = {
  il: "l'",
  dal: "dall'",
  al: "all'",
  del: "dell'",
  nel: "nell'",
  sul: "sull'",
};

function elideItalian(text: string): string {
  return text.replace(IT_ELISION, (match, article: string, day: string, month: string) => {
    const elided = IT_ELIDED[article.toLowerCase()];
    if (!elided) return match;
    const head = article[0] === article[0]?.toUpperCase() ? elided[0]?.toUpperCase() : elided[0];
    return `${head ?? ''}${elided.slice(1)}${day} ${month}`;
  });
}

/**
 * Превежда `key`. Ако ключът има форми за брой (`.one`/`.other`), формата се избира по `params.n`.
 * Липсващ превод пада към българския, после към самия ключ — екранът не остава празен, а липсата
 * се вижда (и се хваща от теста). `{име}` се замества от `params`.
 */
export function translate(
  locale: Locale,
  key: string,
  params: Record<string, string | number> = {},
): string {
  const dicts = dictionaries();
  let template = dicts[locale][key] ?? dicts[DEFAULT_LOCALE][key];
  if (template === undefined && typeof params.n === 'number') {
    const [exact, other] = pluralKey(locale, key, params.n);
    template = dicts[locale][exact] ?? dicts[locale][other] ?? dicts[DEFAULT_LOCALE][other];
  }
  const text = (template ?? key).replace(/\{(\w+)\}/g, (match, name: string) =>
    name in params ? String(params[name]) : match,
  );
  return locale === 'it' ? elideItalian(text) : text;
}

export type Translator = (key: string, params?: Record<string, string | number>) => string;

export function translatorFor(locale: Locale): Translator {
  return (key, params) => translate(locale, key, params);
}

/** Езикът на браузъра — първият познат от `Accept-Language`, иначе българският. */
export function localeFromHeader(header: string | undefined): Locale {
  if (!header) return DEFAULT_LOCALE;
  const ranked = header
    .split(',')
    .map((part) => {
      const [tag = '', ...rest] = part.trim().split(';');
      const quality = Number(
        rest
          .find((item) => item.trim().startsWith('q='))
          ?.trim()
          .slice(2) ?? '1',
      );
      return {
        tag: tag.toLowerCase().split('-')[0] ?? '',
        quality: Number.isNaN(quality) ? 0 : quality,
      };
    })
    .sort((a, b) => b.quality - a.quality);
  const found = ranked.find((item) => isLocale(item.tag));
  return found && isLocale(found.tag) ? found.tag : DEFAULT_LOCALE;
}
