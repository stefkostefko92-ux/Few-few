import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from './paths.js';

/** Български е източникът на истината; английският следва ключ по ключ (tests/i18n.test.ts пази паритета). */
export const LOCALES = ['bg', 'en'] as const;
export type Locale = (typeof LOCALES)[number];

/** BCP-47 за Intl форматиране и за `<html lang>`. */
export const LOCALE_TAG: Record<Locale, string> = { bg: 'bg-BG', en: 'en-GB' };

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value);
}

type Dictionary = Record<string, string>;

/** Влагането в JSON е за четимост; вътре работим с плоски ключове `site.hero.title`. */
function flatten(value: unknown, prefix: string, out: Dictionary): Dictionary {
  if (typeof value === 'string') {
    out[prefix] = value;
    return out;
  }
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    for (const [key, nested] of Object.entries(value)) {
      flatten(nested, prefix ? `${prefix}.${key}` : key, out);
    }
    return out;
  }
  throw new Error(`Непознат тип стойност в речника при ключ ${prefix}`);
}

/** `locales/<език>/*.json` — по един файл за раздел; името на файла е първата част на ключа. */
function load(): Record<Locale, Dictionary> {
  const dictionaries = {} as Record<Locale, Dictionary>;
  for (const locale of LOCALES) {
    const dir = join(ROOT, 'locales', locale);
    const merged: Dictionary = Object.create(null) as Dictionary;
    for (const file of readdirSync(dir)
      .filter((name) => name.endsWith('.json'))
      .sort()) {
      const section = file.replace(/\.json$/, '');
      const parsed = JSON.parse(readFileSync(join(dir, file), 'utf8')) as unknown;
      flatten(parsed, section, merged);
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

export function keysOf(locale: Locale): string[] {
  return Object.keys(dictionaries()[locale]).sort();
}

export function hasKey(locale: Locale, key: string): boolean {
  return Object.hasOwn(dictionaries()[locale], key);
}

export type Params = Record<string, string | number>;
export type Translate = (key: string, params?: Params) => string;

/**
 * Преводът с `{име}` заместване. Липсващ ключ е грешка в разработката (гърми веднага), а в продукция
 * показва самия ключ — страницата не пада заради един низ.
 */
export function translator(
  locale: Locale,
  strict = process.env.NODE_ENV !== 'production',
): Translate {
  const dictionary = dictionaries()[locale];
  return (key, params) => {
    const template = dictionary[key];
    if (template === undefined) {
      if (strict) throw new Error(`Липсващ превод ${locale}:${key}`);
      return key;
    }
    if (!params) return template;
    return template.replace(/\{(\w+)\}/g, (match, name: string) =>
      Object.hasOwn(params, name) ? String(params[name]) : match,
    );
  };
}
