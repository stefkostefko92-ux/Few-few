import type { Theme } from '@prisma/client';
import type { NomeRuolo } from './auth/nomi-ruoli.js';
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
     * Общото за шаблоните, което пише и чете и кодът. `t`/`locale`/`fmt` слага `applyPrefs` — преди
     * него (грешка още в началото на заявката) ги няма и обработчикът на грешки ги слага сам.
     */
    interface Locals {
      cspNonce: string;
      t: Translator;
      locale: Locale;
      theme: Theme;
      fmt: ViewHelpers;
      currentUser: SessionUser | null;
      csrfToken: string;
      flash: Flash | null;
      /** Темата „Personalizzato“ на човека — стилът ѝ и светла/тъмна основа (http/colori.ts). */
      temaPersonale?: { href: string; schema: 'light' | 'dark' } | null;
      /** Името на ролята във фирмата — записаното от нея или това от речника (auth/nomi-ruoli.ts). */
      ruolo: NomeRuolo;
      /** Таваните на снимките и клиповете — подсказката до качването (config.ts). */
      limitiAllegati: { file: number; foto: number; video: number; minuti: number };
    }
  }
}

export {};
