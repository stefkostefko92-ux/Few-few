// „Езикова дупка" — уникалната ни функция, която English-only конкурентите
// не могат да копират. Кръстосваме два наши актива: аналитиката без
// бисквитки (държава на посетителя) и многоезичните профили. Показваме на
// създателя кои езици говорят посетителите му и кои от тях още НЯМА
// преведени — с подкана да ги преведе с един клик.

import { LOCALE_NAMES, localeForCountry, type Locale } from '@/i18n/locales';

export interface CountryCount {
  country: string | null;
  count: number;
}

export interface LanguageDemand {
  locale: Locale;
  name: string;
  visitors: number;
  /** Дял от посетителите, чиято държава сме успели да картографираме (%). */
  percent: number;
  hasTranslation: boolean;
}

export interface LanguageGap {
  /** Всички търсени езици (с превод и без), по брой посетители низходящо. */
  demand: LanguageDemand[];
  /** Само липсващите преводи с реални посетители — суровината за подканата. */
  missing: LanguageDemand[];
  /** Посетители, чиято държава можахме да свържем с наш език. */
  mappedVisitors: number;
}

/**
 * Изчислява езиковото търсене от разбивка по държави и наличните преводи.
 * Чиста функция (без БД) — тества се директно.
 */
export function languageDemand(
  byCountry: readonly CountryCount[],
  existingLocales: readonly string[],
): LanguageGap {
  const have = new Set(existingLocales);
  const byLang = new Map<Locale, number>();
  let mappedVisitors = 0;

  for (const row of byCountry) {
    if (row.count <= 0) continue;
    const locale = localeForCountry(row.country);
    if (!locale) continue; // непозната/смесена държава — не гадаем
    mappedVisitors += row.count;
    byLang.set(locale, (byLang.get(locale) ?? 0) + row.count);
  }

  const demand: LanguageDemand[] = [...byLang.entries()]
    .map(([locale, visitors]) => ({
      locale,
      name: LOCALE_NAMES[locale],
      visitors,
      percent:
        mappedVisitors > 0
          ? Math.round((visitors / mappedVisitors) * 100)
          : 0,
      hasTranslation: have.has(locale),
    }))
    .sort((a, b) => b.visitors - a.visitors);

  const missing = demand.filter((item) => !item.hasTranslation);

  return { demand, missing, mappedVisitors };
}
