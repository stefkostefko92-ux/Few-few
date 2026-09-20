import type { NextFunction, Request, Response } from 'express';
import { isProduction } from '../config.js';
import { prisma } from '../db.js';
import { humanPrincipal } from '../auth/guards.js';
import { DEFAULT_LOCALE, isLocale, localeFromHeader, translatorFor, type Locale } from '../i18n.js';
import * as presenters from './presenters.js';

const LOCALE_COOKIE = 'lang';
const YEAR = 365 * 24 * 3600 * 1000;

/**
 * Кой език вижда човекът, по ред на силата:
 * 1) `?lang=` в адреса (така се сменя от превключвателя и на страницата за вход),
 * 2) изборът, записан в профила му,
 * 3) бисквитката от предишен избор,
 * 4) езикът на браузъра,
 * 5) българският.
 */
function chooseLocale(req: Request): { locale: Locale; fromQuery: boolean } {
  const asked = req.query.lang;
  if (isLocale(asked)) return { locale: asked, fromQuery: true };

  const principal = humanPrincipal(req);
  if (principal && isLocale(principal.user.locale)) {
    return { locale: principal.user.locale, fromQuery: false };
  }

  const cookies = (req as Request & { cookies?: Record<string, string> }).cookies ?? {};
  if (isLocale(cookies[LOCALE_COOKIE])) {
    return { locale: cookies[LOCALE_COOKIE] as Locale, fromQuery: false };
  }

  return { locale: localeFromHeader(req.get('accept-language')), fromQuery: false };
}

/** Функциите за форматиране, вече наточени за езика на заявката. */
function localizedUi(locale: Locale) {
  return {
    ...presenters,
    num: (value: number | null | undefined) => presenters.num(value, locale),
    date: (value: Date | null | undefined) => presenters.date(value, locale),
    dateTime: (value: Date | null | undefined) => presenters.dateTime(value, locale),
    relative: (value: Date | null | undefined) => presenters.relative(value, locale),
    delta: (value: number | null | undefined) => presenters.delta(value, locale),
  };
}

/**
 * Слага езика на заявката. Смяната през `?lang=` е безвредна по замисъл: пише само
 * предпочитание (бисквитка, а за вписан човек и профила) — никакво друго състояние,
 * затова не иска CSRF токен и работи и преди вход.
 */
export function attachLocale(req: Request, res: Response, next: NextFunction): void {
  const { locale, fromQuery } = chooseLocale(req);
  res.locals.locale = locale;
  res.locals.t = translatorFor(locale);
  res.locals.ui = localizedUi(locale);

  if (fromQuery) {
    res.cookie(LOCALE_COOKIE, locale, {
      httpOnly: true,
      sameSite: 'lax',
      secure: isProduction(),
      path: '/',
      maxAge: YEAR,
    });
    const principal = humanPrincipal(req);
    if (principal && principal.user.locale !== locale) {
      // Изборът на език не бива да проваля страницата, ако базата примигне.
      void prisma.user
        .update({ where: { id: principal.user.id }, data: { locale } })
        .catch(() => undefined);
    }
  }
  next();
}

/** Адресът на текущата страница със сменен език — за връзките на превключвателя. */
export function localeSwitchUrl(req: Request, locale: Locale): string {
  const url = new URL(req.originalUrl, 'http://placeholder.invalid');
  url.searchParams.set('lang', locale);
  return `${url.pathname}${url.search}`;
}

export { DEFAULT_LOCALE, LOCALE_COOKIE };
