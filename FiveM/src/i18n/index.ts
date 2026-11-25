import { bg, type Dictionary } from './dictionaries/bg';
import { en } from './dictionaries/en';
import { DEFAULT_LOCALE, isLocale, type Locale } from './config';

const DICTIONARIES: Record<Locale, Dictionary> = { bg, en };

/** Речникът е статичен обект — няма зареждане, няма await, няма мигане. */
export function getDictionary(locale: Locale): Dictionary {
  return DICTIONARIES[locale];
}

/** За страници, чийто `params.locale` идва от URL и още не е проверен. */
export function resolveLocale(value: string | undefined): Locale {
  return isLocale(value) ? value : DEFAULT_LOCALE;
}

export type { Dictionary, Locale };
