import type { NextFunction, Request, Response } from 'express';
import { isProduction } from '../config.js';
import { prisma } from '../db.js';
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from '../auth/password.js';
import {
  isLocale,
  localeFromHeader,
  translatorFor,
  type Locale,
  type Translator,
} from '../i18n.js';
import { DAY } from '../time.js';
import { readCookie } from './cookies.js';
import { viewHelpers } from './view.js';

const LOCALE_COOKIE = 'rd_lang';
const YEAR = 365 * DAY;

/**
 * Езикът на екрана, по ред на силата: `?lang=` (превключвателят) → профилът на вписания човек →
 * бисквитката от предишен избор → браузърът → българският. Витрината не минава оттук — там езикът е
 * в адреса (`/`, `/en/`, `/it/`), за да има всеки език свой URL за търсачките.
 */
function chooseLocale(req: Request): { locale: Locale; fromQuery: boolean } {
  const asked = req.query.lang;
  if (isLocale(asked)) return { locale: asked, fromQuery: true };
  const userLocale = req.principal?.user.locale;
  if (isLocale(userLocale)) return { locale: userLocale, fromQuery: false };
  const cookie = readCookie(req, LOCALE_COOKIE);
  if (isLocale(cookie)) return { locale: cookie, fromQuery: false };
  return { locale: localeFromHeader(req.get('accept-language')), fromQuery: false };
}

/**
 * Числата от правилата, които текстовете на страниците ползват (дължината на паролата в подсказката и
 * в грешките, където и да се покажат) — идват от кода, не се пишат в речника.
 */
const TEXT_PARAMS = { passwordMin: PASSWORD_MIN_LENGTH, passwordMax: PASSWORD_MAX_LENGTH };

export function applyLocale(res: Response, locale: Locale): void {
  const translate = translatorFor(locale);
  const t: Translator = (key, params) => translate(key, { ...TEXT_PARAMS, ...params });
  res.locals.locale = locale;
  res.locals.t = t;
  res.locals.fmt = viewHelpers(locale);
}

/** Слага езика на заявката. `?lang=` пише само предпочитание — не иска CSRF и работи и преди вход. */
export function attachLocale(req: Request, res: Response, next: NextFunction): void {
  const { locale, fromQuery } = chooseLocale(req);
  applyLocale(res, locale);
  if (fromQuery) {
    res.cookie(LOCALE_COOKIE, locale, {
      httpOnly: true,
      sameSite: 'lax',
      secure: isProduction(),
      path: '/',
      maxAge: YEAR,
    });
    const principal = req.principal;
    if (principal && principal.user.locale !== locale) {
      principal.user.locale = locale;
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
