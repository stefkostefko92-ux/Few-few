import type { Locale, Translator } from './i18n.js';

declare global {
  namespace Express {
    interface Locals {
      cspNonce: string;
      /** Езикът на заявката и преводачът — слагат се от езиковия рутер (или от 404/500). */
      locale: Locale;
      t: Translator;
    }
  }
}

export {};
