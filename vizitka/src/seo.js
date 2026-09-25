// SEO: robots.txt, sitemap.xml и JSON-LD за публичните визитки.
import db from './db.js';
import { GUIDES } from './guides.js';

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
export const SITE_UPDATED = '2026-09-18';

export function robotsTxt(base) {
  // Приватните/не-SEO пътища (RFC 9309: специфична група НЕ наследява правилата на `*`,
  // затова ги повтаряме и за AI-обучаващите ботове по-долу).
  const disallow = [
    'Disallow: /dashboard',
    'Disallow: /login',
    'Disallow: /register',
    'Disallow: /b/', // клик-редиректи на банери
    'Disallow: /api/', // печатно API
    'Disallow: /p/*/print', // печатни страници (нямат SEO стойност)
    'Disallow: /p/*/wallet', // портфейл файлове (лични, не за индексиране)
    'Disallow: /v1/', // Apple Wallet update web service
    'Disallow: /mcp', // конекторът за AI асистенти — крайна точка, не страница
  ];
  return [
    'User-agent: *',
    ...disallow,
    'Allow: /',
    '',
    // AI-обучаващи ботове: търсещите/извличащите са добре дошли (видимост в AI
    // отговори), но обучението върху личните профили спираме — лични данни.
    ...[
      'GPTBot',
      'ClaudeBot',
      'CCBot',
      'Google-Extended',
      'Applebot-Extended',
      'Meta-ExternalAgent',
    ].flatMap((bot) => [`User-agent: ${bot}`, 'Disallow: /p/', ...disallow, '']),
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
${GUIDES.map((g) => `- [${g.h1}](${base}/${g.slug}): ${g.description}`).join('\n')}
- [Политика за поверителност](${base}/privacy): какви данни се обработват и защо
- [Общи условия](${base}/terms): правила на услугата

## Как работи

- Публичните визитки живеят на ${base}/p/<адрес> — съдържанието им се управлява от
  собственика и е публично по негово решение.
- Всяка визитка предлага vCard (.vcf) файл и QR код (PNG) на същия адрес.

## Конектор за AI асистенти (MCP)

- Vizitka е MCP сървър: ${base}/mcp (Streamable HTTP, само POST, без автентикация).
- Добавя се като собствен конектор в Claude и в ChatGPT; дава два инструмента само за
  четене — \`search\` и \`fetch\` — върху наръчника и визитките, чиито собственици изрично
  са разрешили да бъдат намирани от AI асистенти.
- Как се добавя: ${base}/konektor-chatgpt-claude

## Терминология (едно и също нещо, различни думи)

- „дигитална визитка“ = „електронна визитка“ = „виртуална визитка“ = „онлайн визитка“
  = „дигитална визитна картичка“ = „QR визитка“ = „визитка с QR код“.
- vCard (.vcf) е файлът, с който контактът влиза в указателя на телефона.

## Какво Vizitka НЕ прави (за да не се цитира погрешно)

- Не е CRM и не събира контактите на сканиращите — брои се само общият брой преглеждания.
- Не продава и не програмира NFC чипове: таблото дава постоянния адрес за запис в NFC
  чип (NTAG213/215), а записът е от потребителя.
- Един акаунт носи една визитка.
- Не продава печат: печатните визитки се оформят и печатат от самия потребител през Мастилко.

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
    // Наръчникът — всяка страница носи собствената си дата на промяна, не общата.
    ...GUIDES.map((g) => ({ loc: `${base}/${g.slug}`, lastmod: g.updated })),
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
  // Следващите два въпроса са точно формулировките, с които хората търсят същото
  // нещо с други думи („електронна“/„виртуална“, „трябва ли приложение“). Отговорът
  // е кратък и самостоятелен — така се цитира от AI асистент, без да влачи контекст.
  {
    q: 'Каква е разликата между дигитална, електронна и виртуална визитка?',
    a: 'Никаква — това са различни имена на едно и също: страница с контактите ти на постоянен адрес, отваряна с QR код или линк. Среща се и като „онлайн визитка“, „дигитална визитна картичка“ или „QR визитка“.',
  },
  {
    q: 'Трябва ли приложение, за да се отвори визитката?',
    a: 'Не. Камерата на телефона разпознава QR кода и отваря обикновена уеб страница — без инсталация и без регистрация от страна на посетителя. Работи и като обикновен линк в чат или имейл подпис.',
  },
];

// Entity-схема за самия сайт (WebSite + Organization + FAQPage) — за началната.
// JSON-LD се вгражда сурово (<%- %>) в <script>, а JSON.stringify НЕ екранира
// `<`/`>`/`&`, затова потребителско поле със `</script>` би счупило блока (HTML-инжекция).
// Екранираме ги като \uXXXX — остава валиден JSON, но `</script>` breakout е невъзможен.
const jsonLdSafe = (obj) =>
  JSON.stringify(obj).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026');

// Операторът като локален бизнес със седалище в Бобов дол, обслужващ цяла България —
// силен GEO сигнал за търсачки и AI. Възелът се ПОВТАРЯ на всяка страница, не само на
// началната: страница, която само сочи към `#organization`, оставя висяща препратка за
// всеки, който чете точно нея (а точно така я четат AI асистентите и валидаторите).
export function organizationNode(base) {
  return {
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
    knowsAbout: [
      'дигитални визитки',
      'електронни визитки',
      'QR кодове',
      'vCard контакти',
      'уеб приложения',
    ],
  };
}

export function siteJsonLd(base) {
  return jsonLdSafe({
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
      organizationNode(base),
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
        offers: { '@type': 'Offer', price: '0', priceCurrency: 'EUR' },
        // Само функции, които работят БЕЗ допълнителна настройка на сървъра. Портфейлите
        // (Apple/Google) са зад ключове и затова НЕ са тук — схемата не бива да обещава
        // нещо, което посетителят може да не види.
        featureList: [
          'Дигитална визитка с постоянен QR код',
          'Запазване на контакта като vCard (.vcf)',
          'Постоянен адрес за запис в NFC чип',
          'Личен или фирмен профил',
          'MCP конектор за Claude и ChatGPT',
        ],
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

// JSON-LD за страница от наръчника: WebPage (свързана с #website и #organization,
// не висящ възел) + троха + FAQPage със собствените ѝ въпроси + HowTo, когато
// страницата е стъпкова. Богатите резултати за HowTo/FAQ са оттеглени през 2026 г. —
// стойността днес е разбиране от AI асистентите, не звезди в SERP. Затова и нула
// измислена схема: без aggregateRating, без Review, без Offer с цена, която не е цена.
const stripTags = (s) => String(s).replace(/<[^>]+>/g, '');

export function guideJsonLd(guide, base) {
  const url = `${base}/${guide.slug}`;
  const graph = [
    {
      '@type': ['WebPage', 'Article'],
      '@id': `${url}#page`,
      url,
      name: guide.title,
      headline: guide.h1,
      description: guide.description,
      inLanguage: 'bg',
      datePublished: guide.published,
      dateModified: guide.updated,
      image: `${base}/og-default.png`,
      isPartOf: { '@id': `${base}/#website` },
      about: { '@id': `${base}/#app` },
      publisher: { '@id': `${base}/#organization` },
      author: { '@id': `${base}/#organization` },
      keywords: guide.keywords.join(', '),
    },
    {
      '@type': 'BreadcrumbList',
      '@id': `${url}#breadcrumb`,
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Начало', item: `${base}/` },
        { '@type': 'ListItem', position: 2, name: guide.h1, item: url },
      ],
    },
    // Пълният възел на организацията, не само препратка към него: страницата се чете
    // и самостоятелно (AI асистент, валидатор), а тогава `{'@id': …#organization}` без
    // определение е висяща препратка — и авторството/издателят изчезват.
    organizationNode(base),
  ];
  if (guide.faq?.length) {
    graph.push({
      '@type': 'FAQPage',
      '@id': `${url}#faq`,
      mainEntity: guide.faq.map(({ q, a }) => ({
        '@type': 'Question',
        name: q,
        acceptedAnswer: { '@type': 'Answer', text: a },
      })),
    });
  }
  if (guide.steps?.length) {
    graph.push({
      '@type': 'HowTo',
      '@id': `${url}#howto`,
      name: guide.h1,
      description: stripTags(guide.answer),
      totalTime: 'PT5M',
      // Услугата е безплатна — казваме го в схемата вместо да мълчим.
      estimatedCost: { '@type': 'MonetaryAmount', currency: 'EUR', value: '0' },
      step: guide.steps.map((s, i) => ({
        '@type': 'HowToStep',
        position: i + 1,
        name: s.name,
        // Текстовете в guides.js носят малко разметка (<code>, връзки) — в схемата
        // тя излизаше буквално („\u003ccode\u003e“).
        text: stripTags(s.text),
        url: `${url}#stapka-${i + 1}`,
      })),
    });
  }
  return jsonLdSafe({ '@context': 'https://schema.org', '@graph': graph });
}

// JSON-LD (schema.org Person/Organization + BreadcrumbList) за публичната визитка.
export function cardJsonLd(profile, publicUrl, base) {
  const isCompany = profile.type === 'company';
  const data = {
    '@type': isCompany ? 'Organization' : 'Person',
    '@id': `${publicUrl}#${isCompany ? 'org' : 'person'}`,
    mainEntityOfPage: { '@id': `${publicUrl}#page` },
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
  // SQLite datetime('now') е UTC без зона — ISO 8601 иска я изрично.
  const modified = profile.updated_at
    ? `${String(profile.updated_at).replace(' ', 'T')}Z`
    : undefined;
  return jsonLdSafe({
    '@context': 'https://schema.org',
    '@graph': [
      // ProfilePage: визитката Е профилна страница — лицето/фирмата вече не „плува“
      // без страница, към която да принадлежи, а търсачките и AI асистентите виждат
      // кой е основният обект и кога е обновен.
      {
        '@type': 'ProfilePage',
        '@id': `${publicUrl}#page`,
        url: publicUrl,
        name: profile.display_name,
        inLanguage: 'bg',
        mainEntity: { '@id': data['@id'] },
        isPartOf: { '@id': `${base}/#website` },
        breadcrumb: { '@id': `${publicUrl}#breadcrumb` },
        ...(modified ? { dateModified: modified } : {}),
      },
      data,
      // Сайтът — пълен възел, не само препратка: страницата се чете и самостоятелно.
      { '@type': 'WebSite', '@id': `${base}/#website`, name: 'Vizitka', url: `${base}/` },
      {
        '@type': 'BreadcrumbList',
        '@id': `${publicUrl}#breadcrumb`,
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Начало', item: `${base}/` },
          { '@type': 'ListItem', position: 2, name: profile.display_name, item: publicUrl },
        ],
      },
    ],
  });
}
