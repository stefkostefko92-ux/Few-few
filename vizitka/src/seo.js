// SEO: robots.txt, sitemap.xml и JSON-LD за публичните визитки.
import db from './db.js';

// Данни на доставчика (импресум) — както в medqr.
export const COMPANY = {
  name: 'Carbon Stealth VCC',
  legalForm: 'дружество с променлив капитал (VCC)',
  url: 'https://carbonstealth.eu',
  uic: '208725180', // ЕИК
  vat: 'BG208725180', // ДДС №
  address: 'ул. „Самуил“ 3, 2670 Бобов дол, България',
  // Структуриран адрес + координати за GEO/LocalBusiness (седалище Бобов дол).
  streetAddress: 'ул. „Самуил“ 3',
  addressLocality: 'Бобов дол',
  addressRegion: 'област Кюстендил',
  postalCode: '2670',
  addressCountry: 'BG',
  geo: { lat: 42.3675, lon: 23.0003 },
  manager: 'Стефан Костадинов',
  email: 'info@carbonstealth.eu',
  privacyEmail: 'privacy@carbonstealth.eu',
  securityEmail: 'security@carbonstealth.eu',
  phone: '+359 877 414 874',
};

// Структуриран пощенски адрес (schema.org PostalAddress) — за JSON-LD.
const postalAddress = {
  '@type': 'PostalAddress',
  streetAddress: COMPANY.streetAddress,
  addressLocality: COMPANY.addressLocality,
  addressRegion: COMPANY.addressRegion,
  postalCode: COMPANY.postalCode,
  addressCountry: COMPANY.addressCountry,
};

// Дата на последна промяна на статичните страници (за sitemap lastmod).
export const SITE_UPDATED = '2026-07-08';

export function robotsTxt(base) {
  return [
    'User-agent: *',
    'Disallow: /dashboard',
    'Disallow: /login',
    'Disallow: /register',
    'Disallow: /b/', // клик-редиректи на банери
    'Disallow: /api/', // печатно API
    'Disallow: /p/*/print', // печатни страници (нямат SEO стойност)
    'Disallow: /p/*/wallet', // портфейл файлове (лични, не за индексиране)
    'Disallow: /v1/', // Apple Wallet update web service
    'Allow: /',
    '',
    // AI-обучаващи ботове: търсещите/извличащите са добре дошли (видимост в AI
    // отговори), но обучението върху личните профили спираме — лични данни.
    ...['GPTBot', 'ClaudeBot', 'CCBot', 'Google-Extended'].flatMap((bot) => [
      `User-agent: ${bot}`,
      'Disallow: /p/',
      '',
    ]),
    `Sitemap: ${base}/sitemap.xml`,
    '',
  ].join('\n');
}

// Карта за LLM асистенти (Claude, Perplexity четат llms.txt; Google/OpenAI — не).
export function llmsTxt(base) {
  return `# Vizitka

> Vizitka е безплатна дигитална визитка с постоянен QR код: създаваш професионален
> профил (личен или фирмен) със снимка и контакти, а сканиращият винаги вижда
> актуалните данни. Услуга на ${COMPANY.name} (${COMPANY.url}), хоствана в ЕС,
> на български език.

## Страници

- [Начало](${base}/): какво е Vizitka, как работи, често задавани въпроси
- [Политика за поверителност](${base}/privacy): какви данни се обработват и защо
- [Общи условия](${base}/terms): правила на услугата

## Как работи

- Публичните визитки живеят на ${base}/p/<адрес> — съдържанието им се управлява от
  собственика и е публично по негово решение.
- Всяка визитка предлага vCard (.vcf) файл и QR код (PNG) на същия адрес.

## Контакт

- ${COMPANY.email} (общи въпроси) · ${COMPANY.privacyEmail} (лични данни)
`;
}

const xmlEsc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Статичните страници + публичните визитки (публикувани по избор на потребителя).
// Google игнорира <priority>, затова не го генерираме.
export function sitemapXml(base) {
  const urls = [
    { loc: `${base}/`, lastmod: SITE_UPDATED },
    { loc: `${base}/privacy`, lastmod: SITE_UPDATED },
    { loc: `${base}/terms`, lastmod: SITE_UPDATED },
  ];
  const profiles = db
    .prepare('SELECT slug, updated_at FROM profiles WHERE is_public = 1 ORDER BY updated_at DESC')
    .all();
  for (const p of profiles) {
    urls.push({ loc: `${base}/p/${p.slug}`, lastmod: p.updated_at.slice(0, 10) });
  }
  const body = urls
    .map(
      (u) =>
        `  <url><loc>${xmlEsc(u.loc)}</loc>` +
        (u.lastmod ? `<lastmod>${u.lastmod}</lastmod>` : '') +
        `</url>`
    )
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`;
}

// Често задавани въпроси — рендират се на началната И влизат във FAQPage схемата.
export const FAQ = [
  {
    q: 'Какво е Vizitka?',
    a: 'Vizitka е безплатна дигитална визитка с постоянен QR код. Създаваш професионален профил — личен или фирмен — със снимка, телефон, имейл и социални мрежи, а всеки, който сканира кода, вижда винаги актуалните ти данни.',
  },
  {
    q: 'Какво става, когато сменя телефона или длъжността си?',
    a: 'Редактираш профила си от таблото и готово — QR кодът остава същият, затова всички вече отпечатани визитки, стикери и табели продължават да водят към новите данни. Нищо не се преиздава.',
  },
  {
    q: 'Как посетителят записва контакта ми?',
    a: 'С бутона „Запази контакта“ на визитката се сваля vCard (.vcf) файл — телефонът го отваря и записва името, номера, имейла и снимката ти в указателя за секунди.',
  },
  {
    q: 'Мога ли да направя фирмена визитка?',
    a: 'Да. При регистрация (или по-късно от таблото) избираш вид профил „Фирмен“ — визитката и vCard файлът се представят като организация, с лого вместо портретна снимка.',
  },
  {
    q: 'Мога ли временно да скрия визитката си?',
    a: 'Да. От таблото изключваш „Визитката е публична“ — адресът и QR кодът спират да показват данните ти, докато не я включиш отново.',
  },
];

// Entity-схема за самия сайт (WebSite + Organization + FAQPage) — за началната.
export function siteJsonLd(base) {
  return JSON.stringify({
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebSite',
        '@id': `${base}/#website`,
        name: 'Vizitka',
        url: `${base}/`,
        inLanguage: 'bg',
        description:
          'Дигитална визитка с постоянен QR код — професионален профил (личен или фирмен), който винаги е актуален.',
        publisher: { '@id': `${base}/#organization` },
      },
      {
        // Операторът като локален бизнес със седалище в Бобов дол, обслужващ
        // цяла България — силен GEO сигнал за търсачки и AI.
        '@type': ['Organization', 'LocalBusiness'],
        '@id': `${base}/#organization`,
        name: COMPANY.name,
        url: COMPANY.url,
        logo: `${base}/logo.png`,
        image: `${base}/logo.png`,
        email: COMPANY.email,
        telephone: COMPANY.phone,
        vatID: COMPANY.vat,
        address: postalAddress,
        geo: {
          '@type': 'GeoCoordinates',
          latitude: COMPANY.geo.lat,
          longitude: COMPANY.geo.lon,
        },
        areaServed: { '@type': 'Country', name: 'Bulgaria' },
        contactPoint: {
          '@type': 'ContactPoint',
          telephone: COMPANY.phone,
          email: COMPANY.email,
          contactType: 'customer support',
          areaServed: 'BG',
          availableLanguage: ['Bulgarian'],
        },
        knowsAbout: ['дигитални визитки', 'QR кодове', 'vCard контакти', 'уеб приложения'],
        sameAs: [COMPANY.url],
      },
      {
        // Самата услуга — безплатно уеб приложение, за да я разбират като продукт.
        '@type': 'WebApplication',
        '@id': `${base}/#app`,
        name: 'Vizitka',
        url: `${base}/`,
        applicationCategory: 'BusinessApplication',
        operatingSystem: 'Web',
        inLanguage: 'bg',
        description:
          'Безплатна дигитална визитка с постоянен QR код — професионален профил (личен или фирмен), който винаги е актуален.',
        offers: { '@type': 'Offer', price: '0', priceCurrency: 'BGN' },
        areaServed: { '@type': 'Country', name: 'Bulgaria' },
        provider: { '@id': `${base}/#organization` },
        publisher: { '@id': `${base}/#organization` },
      },
      {
        '@type': 'FAQPage',
        '@id': `${base}/#faq`,
        mainEntity: FAQ.map(({ q, a }) => ({
          '@type': 'Question',
          name: q,
          acceptedAnswer: { '@type': 'Answer', text: a },
        })),
      },
    ],
  });
}

// JSON-LD (schema.org Person/Organization + BreadcrumbList) за публичната визитка.
export function cardJsonLd(profile, publicUrl, base) {
  const isCompany = profile.type === 'company';
  const data = {
    '@type': isCompany ? 'Organization' : 'Person',
    '@id': `${publicUrl}#${isCompany ? 'org' : 'person'}`,
    mainEntityOfPage: publicUrl,
    name: profile.display_name,
    url: publicUrl,
  };
  if (profile.type === 'personal' && profile.headline) data.jobTitle = profile.headline;
  if (profile.type === 'personal' && profile.company)
    data.worksFor = { '@type': 'Organization', name: profile.company };
  if (profile.type === 'company' && profile.headline) data.description = profile.headline;
  if (profile.phone) data.telephone = profile.phone;
  if (profile.contact_email) data.email = profile.contact_email;
  if (profile.address) data.address = profile.address;
  if (profile.photo) data.image = `${base}/photo/${profile.photo}`;
  const sameAs = [profile.website, profile.facebook, profile.instagram, profile.linkedin].filter(
    Boolean
  );
  if (sameAs.length) data.sameAs = sameAs;
  return JSON.stringify({
    '@context': 'https://schema.org',
    '@graph': [
      data,
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Начало', item: `${base}/` },
          { '@type': 'ListItem', position: 2, name: profile.display_name, item: publicUrl },
        ],
      },
    ],
  });
}
