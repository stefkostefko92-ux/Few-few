/**
 * Издателят на Rendetto и администратор на личните данни — същите данни като в правните страници на
 * останалите продукти на Carbon Stealth. Адресът за показ е в преводите (`company.*`), тук са само
 * стойностите, които не зависят от езика.
 */
export const COMPANY = {
  name: 'Carbon Stealth VCC',
  eik: '208725180',
  vat: 'BG208725180',
  postalCode: '2670',
  country: 'BG',
  url: 'https://carbonstealth.eu',
  email: 'info@carbonstealth.eu',
  geo: { region: 'BG-10', latitude: 42.3539, longitude: 23.0008 },
} as const;

/** Публичният адрес на Rendetto — за печатните материали (сайтът взима своя от PUBLIC_BASE_URL). */
export const PRODUCT_URL = 'https://rendetto.carbonstealth.eu';

/** Датата на последна промяна на витрината — сменя се ръчно, когато се промени съдържанието ѝ. */
export const CONTENT_UPDATED = '2026-10-03';

/** Последна промяна на всеки правен текст — показва се на страницата и отива в sitemap. */
export const LEGAL_UPDATED = { privacy: '2026-10-03', terms: '2026-10-03' } as const;
