import { LOCALES, type Locale } from '../i18n.js';

/**
 * Публичните адреси по език. Италианският е източникът, затова е в корена (`/`); българският и
 * английският — под `/bg/` и `/en/`. Чист модул: ползват го маршрутите, sitemap, llms.txt и robots.txt.
 * Всичко останало (входът, картите, хората, фирмите) е частно и не се обхожда.
 */
export const PUBLIC_PAGES = ['home', 'privacy'] as const;
export type PublicPage = (typeof PUBLIC_PAGES)[number];

const PREFIX: Record<Locale, string> = { it: '', bg: '/bg', en: '/en' };

export function publicPath(locale: Locale, page: PublicPage): string {
  return page === 'home' ? `${PREFIX[locale]}/` : `${PREFIX[locale]}/privacy`;
}

/** Страницата след пратена заявка — само след формата, не се обхожда. */
export function sentPath(locale: Locale): string {
  return `${PREFIX[locale]}/richiesta-inviata`;
}

/** Езикът по адреса на публична страница — или null, ако адресът не е такъв. */
export function publicPageOf(path: string): { locale: Locale; page: PublicPage } | null {
  for (const locale of LOCALES) {
    for (const page of PUBLIC_PAGES) {
      if (publicPath(locale, page) === path) return { locale, page };
    }
  }
  return null;
}

export interface Alternate {
  locale: Locale;
  href: string;
}

/** Пълните адреси на страницата на всеки език — за hreflang, sitemap и превключвателя на езика. */
export function alternatesOf(base: string, page: PublicPage): Alternate[] {
  return LOCALES.map((locale) => ({ locale, href: `${base}${publicPath(locale, page)}` }));
}
