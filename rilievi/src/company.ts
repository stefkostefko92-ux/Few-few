/**
 * Телефоните: италианският — първи (сайтът е за Италия; собственикът, 30 октомври 2026), после този на
 * седалището в България.
 */
const PHONES = ['+39 379 29 69 699', '+359 877 414 874'] as const;

/** За `href`: RFC 3966 не допуска интервали в номера. */
const tel = (number: string): string => `tel:${number.replace(/\s/g, '')}`;

/**
 * Издателят на портала и администратор на личните данни — същите вписани данни като в другите продукти
 * на Carbon Stealth (Korpora, `korpora/src/company.ts`; продуктите не делят код, затова са копирани).
 * Сайтът е само на италиански, затова тук е само латинското име. Адресът и правната форма за показ са
 * в речника (`company.*`), тук са само стойностите, които не са текст.
 */
export const COMPANY = {
  name: 'Carbon Stealth VCC',
  eik: '208725180',
  vat: 'BG208725180',
  postalCode: '2670',
  country: 'BG',
  /** Главният номер (JSON-LD `telephone`) — италианският. */
  phone: PHONES[0],
  phoneHref: tel(PHONES[0]),
  /** Всички номера, в реда на показване. */
  phones: PHONES.map((number) => ({ number, href: tel(number) })),
  url: 'https://carbonstealth.eu',
  geo: { region: 'BG-10', latitude: 42.3539, longitude: 23.0008 },
} as const;

/** Последната промяна на публичната страница — сменя се ръчно с текста ѝ; отива в sitemap и JSON-LD. */
export const CONTENT_UPDATED = '2026-10-30';

/** Последната промяна на политиката за поверителност — показва се на страницата и отива в sitemap. */
export const PRIVACY_UPDATED = '2026-10-30';
