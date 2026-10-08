import type { Flash } from './http/flash.js';
import type { ViewHelpers } from './http/view.js';
import type { Locale, Translator } from './i18n.js';
import type { Principal, SessionUser } from './types.js';

declare global {
  namespace Express {
    interface Request {
      principal?: Principal;
    }

    /**
     * Общото за шаблоните, което пише и чете и кодът. `t`/`locale`/`fmt` слага `applyLocale` — преди
     * него (грешка още в началото на заявката) ги няма и обработчикът на грешки ги слага сам.
     */
    interface Locals {
      cspNonce: string;
      t: Translator;
      locale: Locale;
      fmt: ViewHelpers;
      currentUser: SessionUser | null;
      csrfToken: string;
      mfaPassed: boolean;
      flash: Flash | null;
      /** Страница без превключвател на езика (след POST или с изразходван токен). */
      hideLangs?: boolean;
    }
  }
}

export {};
