import type { NextFunction, Request, Response } from 'express';
import type { Theme } from '@prisma/client';
import { isProduction } from '../config.js';
import { prisma } from '../db.js';
import { LOCK_MINUTES, MAX_FAILED_LOGINS } from '../auth/lockout.js';
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from '../auth/password.js';
import { DEFAULT_LOCALE, translatorFor, type Translator } from '../i18n.js';
import { DAY } from '../time.js';
import { readCookie } from './cookies.js';
import { viewHelpers } from './view.js';

const THEME_COOKIE = 'rilievi_theme';
const PREF_MAX_AGE_MS = 365 * DAY;

/** Стойностите на `?tema=` (италиански адрес, както и останалите) → темата в базата. */
const THEME_BY_PARAM: Readonly<Record<string, Theme>> = {
  auto: 'AUTO',
  chiaro: 'LIGHT',
  scuro: 'DARK',
};
const THEME_PARAM: Readonly<Record<Theme, string>> = {
  AUTO: 'auto',
  LIGHT: 'chiaro',
  DARK: 'scuro',
};

function themeFromParam(value: unknown): Theme | null {
  return typeof value === 'string' && Object.hasOwn(THEME_BY_PARAM, value)
    ? THEME_BY_PARAM[value]!
    : null;
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

export function applyPrefs(res: Response, theme: Theme = 'AUTO'): void {
  const translate = translatorFor(DEFAULT_LOCALE);
  const t: Translator = (key, params) => translate(key, { ...TEXT_PARAMS, ...params });
  res.locals.locale = DEFAULT_LOCALE;
  res.locals.t = t;
  res.locals.fmt = viewHelpers(DEFAULT_LOCALE);
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
 * Слага речника (само италиански) и темата на заявката. `?tema=` записва избора (бисквитка + профил) и
 * връща към същия адрес без параметъра — презареждането или споделената връзка не сменят избора на друг.
 */
export function attachPrefs(req: Request, res: Response, next: NextFunction): void {
  const { theme, fromQuery } = chooseTheme(req);
  applyPrefs(res, theme);
  if (!fromQuery) {
    next();
    return;
  }
  remember(res, THEME_COOKIE, THEME_PARAM[theme]);
  const principal = req.principal;
  if (principal) {
    principal.user.theme = theme;
    void prisma.user
      .update({ where: { id: principal.user.id }, data: { theme } })
      .catch(() => undefined);
  }
  if (req.method !== 'GET') {
    next();
    return;
  }
  const url = new URL(req.originalUrl, 'http://placeholder.invalid');
  url.searchParams.delete('tema');
  res.redirect(303, `${url.pathname}${url.search}`);
}

/** Адресът на текущата страница с друга тема — за връзките на превключвателя. */
export function themeUrl(req: Request, value: string): string {
  const url = new URL(req.originalUrl, 'http://placeholder.invalid');
  url.searchParams.set('tema', value);
  return `${url.pathname}${url.search}`;
}
