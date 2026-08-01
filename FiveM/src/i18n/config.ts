/**
 * Двуезичие без външна зависимост: `bg` е източникът на истината, `en` е
 * пълен превод (не частичен — правило на продукта). Всеки нов низ влиза първо
 * в `dictionaries/bg.ts`; типът на речника се вади от него, така че липсващ
 * английски ключ е ГРЕШКА ПРИ КОМПИЛАЦИЯ, а не тиха дупка в интерфейса.
 */

export const LOCALES = ['bg', 'en'] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = 'bg';

export const LOCALE_NAMES: Record<Locale, string> = {
  bg: 'Български',
  en: 'English',
};

/** За `<html lang>` и за `og:locale`. */
export const HTML_LANG: Record<Locale, string> = { bg: 'bg', en: 'en' };
export const OG_LOCALE: Record<Locale, string> = { bg: 'bg_BG', en: 'en_GB' };

export function isLocale(value: string | undefined): value is Locale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value);
}

/**
 * Избира език по `Accept-Language`. Само за пътя без езиков префикс —
 * веднъж избрал, потребителят стои на своя (URL-ът е носителят, не бисквитка:
 * така всяка страница е споделяема и индексируема на точния си език).
 */
export function bestLocale(acceptLanguage: string | null | undefined): Locale {
  if (!acceptLanguage) return DEFAULT_LOCALE;
  const ranked = acceptLanguage
    .split(',')
    .map((part) => {
      const [tag, q] = part.trim().split(';q=');
      return { tag: tag.toLowerCase(), q: q ? Number(q) : 1 };
    })
    .sort((a, b) => b.q - a.q);

  for (const { tag } of ranked) {
    const base = tag.split('-')[0];
    if (isLocale(base)) return base;
  }
  return DEFAULT_LOCALE;
}

/** `/bg/servers/x` → `/en/servers/x`. Ползва се от превключвателя на езика. */
export function switchLocalePath(pathname: string, target: Locale): string {
  const segments = pathname.split('/').filter(Boolean);
  if (isLocale(segments[0])) segments[0] = target;
  else segments.unshift(target);
  return `/${segments.join('/')}`;
}
