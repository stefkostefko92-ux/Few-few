import type { Lang } from './types';

export const LANGS: Lang[] = ['it', 'en', 'bg'];
export const DEFAULT_LANG: Lang = 'it';

/** Извежда езика от pathname: /en/* → en, /bg/* → bg, иначе it. */
export function langFromPath(pathname: string): Lang {
  const seg = pathname.replace(/^\/+/, '').split('/')[0];
  if (seg === 'en') return 'en';
  if (seg === 'bg') return 'bg';
  return 'it';
}

/** Префиксът на езика в URL („“ за IT, „/en“, „/bg“). */
export function langPrefix(lang: Lang): string {
  return lang === 'it' ? '' : `/${lang}`;
}

/** Началната страница на даден език. */
export function homePath(lang: Lang): string {
  return lang === 'it' ? '/' : `/${lang}/`;
}

/** Нормализира pathname до вид със завършващ „/“ (без двойни слешове). */
export function normalizePath(pathname: string): string {
  let p = pathname.replace(/\/{2,}/g, '/');
  if (!p.startsWith('/')) p = '/' + p;
  if (!p.endsWith('/')) p += '/';
  return p;
}

/** Взима pathname от абсолютен canonical URL от данните. */
export function pathOf(url: string): string {
  try {
    return normalizePath(new URL(url).pathname);
  } catch {
    return normalizePath(url);
  }
}
