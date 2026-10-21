import type { NextFunction, Request, Response } from 'express';
import { isProduction } from '../config.js';
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
/** Изборът на език се помни година (политиката за поверителност го казва). */
export const LOCALE_COOKIE_MAX_AGE_MS = 365 * DAY;

/**
 * Езикът на екрана, по ред на силата: `?lang=` (превключвателят) → бисквитката от последния избор на това
 * устройство → профилът на вписания човек → браузърът → българският. Превключвателят сменя само екрана;
 * езикът на акаунта (писмата, договорът) се сменя само от „Профил“ (POST, с CSRF) — GET не пише в базата.
 * Витрината не минава оттук — там езикът е в адреса (`/`, `/en/`, `/it/`), за да има всеки език свой URL за
 * търсачките.
 */
function chooseLocale(req: Request): { locale: Locale; fromQuery: boolean } {
  const asked = req.query.lang;
  if (isLocale(asked)) return { locale: asked, fromQuery: true };
  const cookie = readCookie(req, LOCALE_COOKIE);
  if (isLocale(cookie)) return { locale: cookie, fromQuery: false };
  const userLocale = req.principal?.user.locale;
  if (isLocale(userLocale)) return { locale: userLocale, fromQuery: false };
  return { locale: localeFromHeader(req.get('accept-language')), fromQuery: false };
}

/** Помни езика на екрана на това устройство — превключвателят и записът на профила. */
export function rememberLocale(res: Response, locale: Locale): void {
  res.cookie(LOCALE_COOKIE, locale, {
    httpOnly: true,
    sameSite: 'lax',
    secure: isProduction(),
    path: '/',
    maxAge: LOCALE_COOKIE_MAX_AGE_MS,
  });
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

/**
 * Слага езика на заявката. `?lang=` пише само бисквитката на устройството — не иска CSRF, работи и преди
 * вход и не пипа акаунта: споделена връзка с `?lang=` не сменя езика на писмата на човека.
 */
export function attachLocale(req: Request, res: Response, next: NextFunction): void {
  const { locale, fromQuery } = chooseLocale(req);
  applyLocale(res, locale);
  if (fromQuery) rememberLocale(res, locale);
  next();
}

/** Адресът на текущата страница със сменен език — за връзките на превключвателя. */
export function localeSwitchUrl(req: Request, locale: Locale): string {
  const url = new URL(req.originalUrl, 'http://placeholder.invalid');
  url.searchParams.set('lang', locale);
  return `${url.pathname}${url.search}`;
}
