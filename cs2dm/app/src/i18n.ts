import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Езиците на сайта. **Българският е източникът на истината** — пише се първо и от него се
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

/** BCP 47 етикет за Intl (дати, числа, евро) и `og:locale`. */
export const LOCALE_TAG: Record<Locale, string> = { bg: 'bg-BG', en: 'en-GB', it: 'it-IT' };
export const OG_LOCALE: Record<Locale, string> = { bg: 'bg_BG', en: 'en_GB', it: 'it_IT' };

const LOCALE_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'locales');

type Dictionary = Record<string, string>;

/**
 * Влагането в JSON е за четимост; вътре работим с плоски ключове `home.faq.q1`. Масивите
 * (абзаци на правните текстове) стават `ключ.0`, `ключ.1`… — така паритетът хваща и
 * абзац, който липсва само в единия превод.
 */
function flatten(value: unknown, prefix = '', out: Dictionary = {}): Dictionary {
  if (typeof value === 'string') {
    out[prefix] = value;
    return out;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => flatten(item, `${prefix}.${index}`, out));
    return out;
  }
  if (value && typeof value === 'object') {
    for (const [key, nested] of Object.entries(value)) {
      flatten(nested, prefix ? `${prefix}.${key}` : key, out);
    }
  }
  return out;
}

function load(): Record<Locale, Dictionary> {
  const dictionaries = {} as Record<Locale, Dictionary>;
  for (const locale of LOCALES) {
    const raw = readFileSync(join(LOCALE_DIR, `${locale}.json`), 'utf8');
    dictionaries[locale] = flatten(JSON.parse(raw) as unknown);
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

export function keysOf(locale: Locale): string[] {
  return Object.keys(dictionaries()[locale]).sort();
}

export type Params = Record<string, string | number>;

/**
 * Превежда `key`. Липсващият превод пада към българския, после към самия ключ — страницата
 * никога не показва празно място, а липсата се вижда (и се хваща от теста). `{име}` се
 * замества от `params`; непознат заместител остава видим, вместо да стане „undefined“.
 */
export function translate(locale: Locale, key: string, params: Params = {}): string {
  const dicts = dictionaries();
  const template = dicts[locale][key] ?? dicts[DEFAULT_LOCALE][key] ?? key;
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in params ? String(params[name]) : match,
  );
}

/** Абзаците на масив от речника (`ключ.0`, `ключ.1`…) в реда им. */
export function translateList(locale: Locale, key: string, params: Params = {}): string[] {
  const dict = dictionaries()[locale];
  const out: string[] = [];
  for (let index = 0; `${key}.${index}` in dict; index += 1) {
    out.push(translate(locale, `${key}.${index}`, params));
  }
  return out;
}

/** Множествено число по правилата на езика: `ключ.one` / `ключ.other` (и `many`, ако го има). */
export function translatePlural(locale: Locale, key: string, count: number, params: Params = {}) {
  const category = new Intl.PluralRules(LOCALE_TAG[locale]).select(count);
  const dict = dictionaries()[locale];
  const chosen = `${key}.${category}` in dict ? `${key}.${category}` : `${key}.other`;
  return translate(locale, chosen, { count, ...params });
}

export interface Translator {
  (key: string, params?: Params): string;
  list: (key: string, params?: Params) => string[];
  plural: (key: string, count: number, params?: Params) => string;
}

export function translatorFor(locale: Locale): Translator {
  const t = ((key: string, params?: Params) => translate(locale, key, params)) as Translator;
  t.list = (key, params) => translateList(locale, key, params);
  t.plural = (key, count, params) => translatePlural(locale, key, count, params);
  return t;
}

/** Езикът на браузъра — първият познат от `Accept-Language` по тегло, иначе българският. */
export function localeFromHeader(header: string | undefined): Locale {
  if (!header || header.length > 512) return DEFAULT_LOCALE;
  const ranked = header
    .split(',')
    .slice(0, 20)
    .map((part) => {
      const [tag = '', ...rest] = part.trim().split(';');
      const quality = Number(
        rest
          .find((item) => item.trim().startsWith('q='))
          ?.trim()
          .slice(2),
      );
      return {
        tag: tag.toLowerCase().split('-')[0] ?? '',
        quality: rest.length === 0 ? 1 : Number.isFinite(quality) ? quality : 0,
      };
    })
    .sort((a, b) => b.quality - a.quality);
  const found = ranked.find((item) => item.quality > 0 && isLocale(item.tag));
  return found && isLocale(found.tag) ? found.tag : DEFAULT_LOCALE;
}
