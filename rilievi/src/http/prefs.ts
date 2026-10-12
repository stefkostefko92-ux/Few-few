import type { NextFunction, Request, Response } from 'express';
import type { Theme } from '@prisma/client';
import { isProduction } from '../config.js';
import { prisma } from '../db.js';
import { LOCK_MINUTES, MAX_FAILED_LOGINS } from '../auth/lockout.js';
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

const LOCALE_COOKIE = 'rilievi_lang';
const THEME_COOKIE = 'rilievi_theme';
const PREF_MAX_AGE_MS = 365 * DAY;

/** Стойностите на `?tema=` (италиански адрес, както и останалите) → темата в базата. */
const THEME_BY_PARAM: Readonly<Record<string, Theme>> = {
  auto: 'AUTO',
  chiaro: 'LIGHT',
  scuro: 'DARK',
};
export const THEME_PARAM: Readonly<Record<Theme, string>> = {
  AUTO: 'auto',
  LIGHT: 'chiaro',
  DARK: 'scuro',
};

function themeFromParam(value: unknown): Theme | null {
  return typeof value === 'string' && Object.hasOwn(THEME_BY_PARAM, value)
    ? THEME_BY_PARAM[value]!
    : null;
}

/**
 * Езикът, по ред на силата: `?lang=` (превключвателят) → профилът на вписания → бисквитката →
 * браузърът → италианският.
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

/** Темата: `?tema=` → профилът → бисквитката → AUTO (следва системата на устройството). */
function chooseTheme(req: Request): { theme: Theme; fromQuery: boolean } {
  const asked = themeFromParam(req.query.tema);
  if (asked) return { theme: asked, fromQuery: true };
  const user = req.principal?.user;
  if (user) return { theme: user.theme, fromQuery: false };
  return { theme: themeFromParam(readCookie(req, THEME_COOKIE)) ?? 'AUTO', fromQuery: false };
}

/** Числата от правилата, които текстовете ползват — идват от кода, не се пишат в речника. */
const TEXT_PARAMS = {
  passwordMin: PASSWORD_MIN_LENGTH,
  passwordMax: PASSWORD_MAX_LENGTH,
  lockMinutes: LOCK_MINUTES,
  maxAttempts: MAX_FAILED_LOGINS,
};

export function applyPrefs(res: Response, locale: Locale, theme: Theme = 'AUTO'): void {
  const translate = translatorFor(locale);
  const t: Translator = (key, params) => translate(key, { ...TEXT_PARAMS, ...params });
  res.locals.locale = locale;
  res.locals.t = t;
  res.locals.fmt = viewHelpers(locale);
  res.locals.theme = theme;
}

function remember(res: Response, name: string, value: string): void {
  res.cookie(name, value, {
    httpOnly: true,
    sameSite: 'lax',
    secure: isProduction(),
    path: '/',
    maxAge: PREF_MAX_AGE_MS,
  });
}

/**
 * Слага езика и темата на заявката. `?lang=`/`?tema=` записва избора (бисквитка + профил) и връща към
 * същия адрес без параметъра — презареждането или споделената връзка не сменят избора на друг.
 */
export function attachPrefs(req: Request, res: Response, next: NextFunction): void {
  const { locale, fromQuery: localeAsked } = chooseLocale(req);
  const { theme, fromQuery: themeAsked } = chooseTheme(req);
  applyPrefs(res, locale, theme);
  if (!localeAsked && !themeAsked) {
    next();
    return;
  }
  if (localeAsked) remember(res, LOCALE_COOKIE, locale);
  if (themeAsked) remember(res, THEME_COOKIE, THEME_PARAM[theme]);
  const principal = req.principal;
  if (principal) {
    principal.user.locale = locale;
    principal.user.theme = theme;
    void prisma.user
      .update({ where: { id: principal.user.id }, data: { locale, theme } })
      .catch(() => undefined);
  }
  if (req.method !== 'GET') {
    next();
    return;
  }
  const url = new URL(req.originalUrl, 'http://placeholder.invalid');
  url.searchParams.delete('lang');
  url.searchParams.delete('tema');
  res.redirect(303, `${url.pathname}${url.search}`);
}

/** Адресът на текущата страница с нов език или тема — за връзките на превключвателите. */
export function prefUrl(req: Request, key: 'lang' | 'tema', value: string): string {
  const url = new URL(req.originalUrl, 'http://placeholder.invalid');
  url.searchParams.set(key, value);
  return `${url.pathname}${url.search}`;
}
