// Многоезичие (bg/en/it/de/es) — нула зависимости, по правилата на репото:
// българският е ИЗТОЧНИКЪТ НА ИСТИНАТА; липсващ ключ пада към bg. Преводите минават
// през агента Преводач. ВАЖНО: одитната следа и съобщенията на предпазителите
// (guard.js) остават на български по желязно правило №7 — тук се превежда само UI.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const LOCALES = ['bg', 'en', 'it', 'de', 'es'];
export const DEFAULT_LOCALE = 'bg';
export const LOCALE_NAMES = { bg: 'БГ', en: 'EN', it: 'IT', de: 'DE', es: 'ES' };
export const LANG_COOKIE = 'sam_lang';

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'locales');
const messages = new Map();
for (const loc of LOCALES) {
  messages.set(loc, JSON.parse(fs.readFileSync(path.join(dir, `${loc}.json`), 'utf8')));
}

export function t(locale, key, params) {
  const s = messages.get(locale)?.[key] ?? messages.get(DEFAULT_LOCALE)?.[key] ?? key;
  if (!params) return s;
  return s.replace(/\{(\w+)\}/g, (m, k) => (params[k] !== undefined ? String(params[k]) : m));
}

export function messageKeys(locale) {
  return Object.keys(messages.get(locale) || {});
}

// Избор на език: ?lang= (записва бисквитка) → бисквитка → Accept-Language → bg.
export function localeMiddleware(req, res, next) {
  let locale = null;
  if (req.query.lang && LOCALES.includes(req.query.lang)) {
    locale = req.query.lang;
    res.cookie(LANG_COOKIE, locale, {
      maxAge: 365 * 24 * 3600 * 1000,
      sameSite: 'lax',
      httpOnly: true,
    });
  } else if (LOCALES.includes(req.cookies?.[LANG_COOKIE])) {
    locale = req.cookies[LANG_COOKIE];
  } else {
    locale = req.acceptsLanguages(LOCALES) || DEFAULT_LOCALE;
  }
  res.locals.locale = locale;
  res.locals.locales = LOCALES;
  res.locals.localeNames = LOCALE_NAMES;
  req.t = res.locals.t = (key, params) => t(locale, key, params);
  next();
}
