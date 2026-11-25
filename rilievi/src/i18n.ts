import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from './paths.js';

/**
 * Езикът на продукта: **само италиански** (решение на собственика) — полетата са дословно от заданието
 * на клиента (Италия). Текстовете стоят в `locales/it/`, не в кода.
 */
export const LOCALES = ['it'] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = 'it';

/** BCP-47 за Intl форматиране. */
export const LOCALE_TAG: Record<Locale, string> = { it: 'it-IT' };

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

/** `locales/<език>/*.json` — по един файл за раздел (common, auth, schede…), слети в един речник. */
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

export function keysOf(locale: Locale): string[] {
  return Object.keys(dictionaries()[locale]).sort();
}

export function hasKey(locale: Locale, key: string): boolean {
  return Object.hasOwn(dictionaries()[locale], key);
}

const pluralRules = new Map<Locale, Intl.PluralRules>();

/** Формата за брой: `ключ.one` / `ключ.other` според правилата на езика (1 scheda, 3 schede). */
function pluralKey(locale: Locale, key: string, count: number): [string, string] {
  let rules = pluralRules.get(locale);
  if (!rules) {
    rules = new Intl.PluralRules(LOCALE_TAG[locale]);
    pluralRules.set(locale, rules);
  }
  return [`${key}.${rules.select(count)}`, `${key}.other`];
}

/**
 * Текстът на `key`. Ако ключът има форми за брой (`.one`/`.other`), формата се избира по `params.n`.
 * Липсващ ключ връща самия ключ — екранът не остава празен, а липсата се вижда (и се хваща от теста).
 * `{име}` се замества от `params`.
 */
export function translate(
  locale: Locale,
  key: string,
  params: Record<string, string | number> = {},
): string {
  const dict = dictionaries()[locale];
  let template = dict[key];
  if (template === undefined && typeof params.n === 'number') {
    const [exact, other] = pluralKey(locale, key, params.n);
    template = dict[exact] ?? dict[other];
  }
  return (template ?? key).replace(/\{(\w+)\}/g, (match, name: string) =>
    name in params ? String(params[name]) : match,
  );
}

export type Translator = (key: string, params?: Record<string, string | number>) => string;

export function translatorFor(locale: Locale): Translator {
  return (key, params) => translate(locale, key, params);
}
