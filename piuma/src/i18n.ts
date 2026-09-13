import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Езиците на панела. **Българският е източникът на истината** — той се пише първо и
 * от него се превежда; другите два са пълни огледала (тестът гейтва паритета на ключовете).
 */
export const LOCALES = ['bg', 'en', 'it'] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = 'bg';

export const LOCALE_LABEL: Record<Locale, string> = {
  bg: 'Български',
  en: 'English',
  it: 'Italiano',
};

const LOCALE_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'locales');

export class TranslationError extends Error {}

type Dictionary = Record<string, string>;

/** Влагането в JSON е за четимост; вътре работим с плоски ключове `posts.title`. */
function flatten(value: unknown, prefix = '', out: Dictionary = {}): Dictionary {
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

function load(): Record<Locale, Dictionary> {
  const dictionaries = {} as Record<Locale, Dictionary>;
  for (const locale of LOCALES) {
    const path = join(LOCALE_DIR, `${locale}.json`);
    dictionaries[locale] = flatten(JSON.parse(readFileSync(path, 'utf8')) as unknown);
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

export function localeFiles(): string[] {
  return readdirSync(LOCALE_DIR).filter((file) => file.endsWith('.json'));
}

export function keysOf(locale: Locale): string[] {
  return Object.keys(dictionaries()[locale]).sort();
}

/**
 * Превежда `key` за езика. Липсващият превод пада към българския, а после към самия ключ —
 * панелът никога не показва празно място, а липсата се вижда (и се хваща от теста).
 * `{име}` в текста се замества от `params`.
 */
export function translate(
  locale: Locale,
  key: string,
  params: Record<string, string | number> = {},
): string {
  const dicts = dictionaries();
  const template = dicts[locale][key] ?? dicts[DEFAULT_LOCALE][key] ?? key;
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in params ? String(params[name]) : match,
  );
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
      const quality = Number(rest.find((item) => item.startsWith('q='))?.slice(2) ?? '1');
      return {
        tag: tag.toLowerCase().split('-')[0] ?? '',
        quality: Number.isNaN(quality) ? 0 : quality,
      };
    })
    .sort((a, b) => b.quality - a.quality);
  return (ranked.find((item) => isLocale(item.tag))?.tag as Locale | undefined) ?? DEFAULT_LOCALE;
}
