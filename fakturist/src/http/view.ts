import type { NextFunction, Request, Response } from 'express';
import { BRAND } from '../brand.js';
import { COMPANY } from '../company.js';
import { hasKey, translator, type Locale } from '../i18n.js';
import { setting } from '../admin/settings.js';
import { icon } from './icons.js';
import { SOFTWARE_VERSION } from '../version.js';
import { systemText } from '../system-text.js';

/** Езикът, избран в адреса (`?lang=en` / `?lang=bg`) — за посетител без профил. */
export function queryLocale(req: Request): Locale | null {
  const lang = req.query['lang'];
  return lang === 'en' || lang === 'bg' ? lang : null;
}

/** Езикът на приложението: избраният в профила, иначе от адреса, иначе български. */
export function appLocale(req: Request): Locale {
  if (req.principal) return req.principal.user.locale;
  return queryLocale(req) ?? 'bg';
}

/**
 * Изгледът на даден език: преводачът, `<html lang>`, сумите и `langQuery` — частта от адреса, с която
 * формите и връзките на посетител без профил пазят езика (`?lang=en`); за влязъл езикът е в профила.
 * Ползва се и от страниците по връзка от писмо (нова парола), които са на езика на профила.
 */
export function useLocale(res: Response, locale: Locale, signedIn: boolean): void {
  res.locals.lang = locale;
  res.locals.htmlLang = locale;
  res.locals.t = translator(locale);
  res.locals.tOr = (key: string, fallback: string): string =>
    hasKey(locale, key) ? translator(locale)(key) : fallback;
  res.locals.sys = (value: string): string => systemText(value, locale);
  // Сума за показ във всеки изглед — точна (низ, не float); маршрутът може да подаде своя.
  res.locals.money = (cents: bigint | number, currency: string): string =>
    money(cents, currency, locale);
  res.locals.langQuery = !signedIn && locale === 'en' ? '?lang=en' : '';
}

/** Пътят за връщане след смяна на езика: само наш относителен адрес в приложението или панела. */
export function safeBack(value: unknown): string {
  return typeof value === 'string' &&
    value.length <= 500 &&
    /^\/(app|admin|prilozhenie)(\/[\w\-./%]*)?(\?[\w\-.=&%]*)?$/.test(value) &&
    !value.includes('//') &&
    !value.includes('/../')
    ? value
    : '/app';
}

/**
 * Превключвателят BG/EN в лентата. Влязъл — формата сменя езика в профила и връща на страницата (за
 * страница, показана след изпратена форма — там, откъдето е изпратена); посетител — връзки с `?lang=`.
 */
function languageSwitch(req: Request): { back: string; hrefs: Record<Locale, string> } {
  const url = new URL(req.originalUrl, 'http://local');
  const hrefs = Object.fromEntries(
    (['bg', 'en'] as const).map((lang) => {
      const params = new URLSearchParams(url.search);
      params.set('lang', lang);
      return [lang, `${url.pathname}?${params.toString()}`];
    }),
  ) as Record<Locale, string>;
  let back = req.method === 'GET' ? url.pathname + url.search : '/app';
  if (req.method !== 'GET') {
    const referer = req.get('referer');
    if (referer) {
      try {
        const from = new URL(referer);
        back = from.pathname + from.search;
      } catch {
        back = '/app';
      }
    }
  }
  return { back: safeBack(back), hrefs };
}

/** Общото за изгледите на приложението и панела. */
export function appLocals() {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const locale = appLocale(req);
      useLocale(res, locale, Boolean(req.principal));
      res.locals.languageSwitch = languageSwitch(req);
      res.locals.icon = icon;
      res.locals.softwareVersion = SOFTWARE_VERSION;
      res.locals.brand = BRAND;
      res.locals.company = COMPANY;
      res.locals.currentUser = req.principal?.user ?? null;
      res.locals.csrfToken = req.principal?.csrfToken ?? '';
      res.locals.path = req.path;
      res.locals.notice = await setting('site.notice');
      res.locals.appUrls = { register: '/registraciya', login: '/vhod' };
      // Резултатът от „Изпрати отново“ на лентата за потвърждение на имейла (src/routes/account.ts).
      const verify = req.query['verify'];
      res.locals.verifyNotice =
        verify === 'queued' || verify === 'already' || verify === 'rateLimited' ? verify : null;
      next();
    } catch (error) {
      next(error);
    }
  };
}

/** Центовете като точен десетичен низ („-1234.05“) — без float, и за суми над 2^53. */
export function centsDecimal(cents: bigint | number): string {
  const value = typeof cents === 'bigint' ? cents : BigInt(Math.trunc(cents));
  const sign = value < 0n ? '-' : '';
  const abs = value < 0n ? -value : value;
  return `${sign}${abs / 100n}.${(abs % 100n).toString().padStart(2, '0')}`;
}

/** Сума в центове за показ: Intl форматира десетичния низ точно (без float). */
export function money(cents: bigint | number, currency: string, locale: Locale): string {
  // Intl приема десетичен низ (NumberFormat v3); типът на TS още е само number | bigint.
  const format = new Intl.NumberFormat(locale === 'bg' ? 'bg-BG' : 'en-GB', {
    style: 'currency',
    currency,
  }).format as (value: string) => string;
  return format(centsDecimal(cents));
}
