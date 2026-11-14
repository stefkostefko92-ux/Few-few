import { BRAND } from '../brand.js';
import type { Locale } from '../i18n.js';

/**
 * Приложението на началния екран (собственикът, 13.11.2026 — „да можем да го инсталираме като
 * приложение на телефона, таблета, компютъра като rilievi“): манифестът. `standalone` — собствен
 * прозорец без лентите на браузъра; лентата на системата (час, батерия) остава, както в офис
 * приложенията. Стартира в `/app` (без сесия — входът); обхватът е целият сайт, за да остават в
 * приложението и витрината, и PDF-ите. Манифестът е на езика на страницата (`/en/…` — английски).
 */
export const START_URL = '/app';

/** Иконите: марката от логото (`node scripts/brand-assets.mjs`) — цяла (`any`) и в кръга (`maskable`). */
export const ICONS = [
  { file: 'icon-192', size: 192, purpose: 'any' },
  { file: 'icon-512', size: 512, purpose: 'any' },
  { file: 'maskable-192', size: 192, purpose: 'maskable' },
  { file: 'maskable-512', size: 512, purpose: 'maskable' },
] as const;

/** Цветовете на марката: тъмносиньото от логото и белият фон на иконите. */
export const THEME_COLOR = '#0c1929';
export const BACKGROUND_COLOR = '#ffffff';

export function manifestPath(locale: Locale): string {
  return locale === 'en' ? '/en/manifest.webmanifest' : '/manifest.webmanifest';
}

export function manifestFor(locale: Locale, version: string) {
  const name = locale === 'bg' ? BRAND.name : BRAND.nameLatin;
  return {
    id: START_URL,
    name,
    short_name: name,
    description: BRAND.tagline[locale],
    lang: locale === 'bg' ? 'bg-BG' : 'en-GB',
    dir: 'ltr',
    start_url: locale === 'en' ? `${START_URL}?lang=en` : START_URL,
    scope: '/',
    display: 'standalone',
    orientation: 'any',
    background_color: BACKGROUND_COLOR,
    theme_color: THEME_COLOR,
    categories: ['business', 'finance', 'productivity'],
    prefer_related_applications: false,
    icons: ICONS.map(({ file, size, purpose }) => ({
      src: `/img/brand/${file}.png?v=${version}`,
      sizes: `${size}x${size}`,
      type: 'image/png',
      purpose,
    })),
  };
}
