const PHONE = '+359 877 414 874';

/**
 * Издателят на Фактурист и администратор на личните данни на акаунтите (за данните във фактурите на
 * клиентите сме обработващ — чл. 28 ОРЗД). Същите данни като в Korpora (korpora/src/company.ts).
 */
export const COMPANY = {
  name: 'Carbon Stealth VCC',
  nameBg: 'Карбон Стелт ЕДПК',
  eik: '208725180',
  vat: 'BG208725180',
  street: { bg: 'ул. „Самуил“ № 3', en: 'ul. Samuil 3' },
  city: { bg: 'Бобов дол', en: 'Bobov Dol' },
  region: { bg: 'обл. Кюстендил', en: 'Kyustendil Province' },
  postalCode: '2670',
  country: 'BG',
  phone: PHONE,
  /** За `href`: RFC 3966 не допуска интервали в номера. */
  phoneHref: `tel:${PHONE.replace(/\s/g, '')}`,
  url: 'https://carbonstealth.eu',
  email: 'info@carbonstealth.eu',
  geo: { region: 'BG-10', placename: 'Bobov Dol', latitude: 42.3539, longitude: 23.0008 },
  /** Официалните профили на фирмата (`sameAs` в JSON-LD) — посочени от собственика; не се добавят други. */
  profiles: ['https://www.youtube.com/@CarbonStealth', 'https://www.tiktok.com/@zerofucksgiiven'],
} as const;

/**
 * Датата на последна промяна на витрината (lastmod в sitemap, dateModified в JSON-LD). Сменя се ръчно, когато
 * се промени съдържанието ѝ.
 */
export const CONTENT_UPDATED = '2026-11-12';
