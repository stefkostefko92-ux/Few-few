import type { Locale } from '../i18n.js';

/**
 * Публичните адреси по език — витрината (`/`, `/en/`, `/it/`) и правните страници. Чист модул: ползват
 * го маршрутите, sitemap и брошурата, без да внасят сървъра.
 */
export const PATHS: Record<Locale, string> = { bg: '/', en: '/en/', it: '/it/' };

export const LEGAL = ['privacy', 'terms'] as const;
export type LegalPage = (typeof LEGAL)[number];

export function legalPath(locale: Locale, page: LegalPage): string {
  return locale === 'bg' ? `/${page}` : `/${locale}/${page}`;
}
