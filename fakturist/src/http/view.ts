import type { NextFunction, Request, Response } from 'express';
import { BRAND } from '../brand.js';
import { COMPANY } from '../company.js';
import { hasKey, translator, type Locale } from '../i18n.js';
import { setting } from '../admin/settings.js';
import { icon } from './icons.js';

/** Езикът на приложението: избраният от човека, иначе от адреса (`?lang=en`), иначе български. */
export function appLocale(req: Request): Locale {
  if (req.principal) return req.principal.user.locale;
  return req.query['lang'] === 'en' ? 'en' : 'bg';
}

/** Общото за изгледите на приложението и панела. */
export function appLocals() {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const locale = appLocale(req);
      res.locals.lang = locale;
      res.locals.htmlLang = locale;
      res.locals.t = translator(locale);
      res.locals.tOr = (key: string, fallback: string): string =>
        hasKey(locale, key) ? translator(locale)(key) : fallback;
      res.locals.icon = icon;
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

/** Сума в центове за показ (никога през float за смятане — само за изгледа). */
export function money(cents: bigint | number, currency: string, locale: Locale): string {
  const value = typeof cents === 'bigint' ? Number(cents) / 100 : cents / 100;
  return new Intl.NumberFormat(locale === 'bg' ? 'bg-BG' : 'en-GB', {
    style: 'currency',
    currency,
  }).format(value);
}
