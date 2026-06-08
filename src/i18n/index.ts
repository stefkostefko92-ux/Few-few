import bg from './bg.json';
import en from './en.json';

export type Lang = 'bg' | 'en';

type Dict = Record<string, string>;

const DICTS: Record<Lang, Dict> = {
  bg: bg as Dict,
  en: en as Dict,
};

export const LANGS: readonly Lang[] = ['bg', 'en'];

let current: Lang = 'bg';

export function getLang(): Lang {
  return current;
}

export function setLang(lang: Lang): void {
  current = lang;
  if (typeof document !== 'undefined') {
    document.documentElement.lang = lang;
  }
}

/**
 * Превежда ключ към текущия език. Връща самия ключ, ако липсва превод —
 * така липсващите низове са веднага видими при разработка вместо празно поле.
 */
export function t(key: string): string {
  const dict = DICTS[current];
  const value = dict[key];
  if (value === undefined) {
    if (import.meta.env.DEV) {
      console.warn(`[i18n] липсва ключ за "${current}": ${key}`);
    }
    // Резервен вариант към другия език, после към самия ключ.
    const fallback = current === 'bg' ? DICTS.en[key] : DICTS.bg[key];
    return fallback ?? key;
  }
  return value;
}

export function langLabel(lang: Lang): string {
  return lang === 'bg' ? t('menu.lang.bg') : t('menu.lang.en');
}
