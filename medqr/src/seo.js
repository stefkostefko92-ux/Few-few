// Централизирана SEO/GEO/AEO конфигурация: публични страници, robots.txt,
// sitemap.xml и llms.txt (за AI/answer engines).

export const SITE_NAME = 'MedQR';
export const SITE_LOCALE = 'bg_BG';
export const DEFAULT_DESCRIPTION =
  'MedQR създава защитен спешен медицински профил с QR код — кръвна група, ' +
  'алергии към лекарства, заболявания и спешен контакт, достъпни при злополука. ' +
  'Криптирано, GDPR-съвместимо, с хостинг в ЕС.';

// Версия и дата на правните документи (поверителност, бисквитки, общи условия).
// Едно място — за да съвпадат страниците и структурираните данни.
export const LEGAL = { version: '1.1', effective: '2026-06-22' };

// Дата на последна значима промяна по съдържанието (за sitemap lastmod на
// началната страница). Фиксирана — за да не „плава" с всяко зареждане.
export const SITE_UPDATED = '2026-06-29';

// Класически GEO сигнали (държава/регион на услугата) за търсачки и карти.
export const GEO = {
  region: 'BG',
  placename: 'България',
  position: '42.6977;23.3219',
  icbm: '42.6977, 23.3219',
};

// Само публичните (индексируеми) страници. Правните страници носят датата на
// влизане в сила като lastmod.
export const PUBLIC_PAGES = [
  { path: '/', changefreq: 'weekly', priority: '1.0', lastmod: SITE_UPDATED },
  { path: '/about', changefreq: 'monthly', priority: '0.7', lastmod: SITE_UPDATED },
  { path: '/contact', changefreq: 'yearly', priority: '0.5', lastmod: SITE_UPDATED },
  { path: '/privacy', changefreq: 'yearly', priority: '0.5', lastmod: LEGAL.effective },
  { path: '/cookies', changefreq: 'yearly', priority: '0.5', lastmod: LEGAL.effective },
  { path: '/terms', changefreq: 'yearly', priority: '0.5', lastmod: LEGAL.effective },
  { path: '/accessibility', changefreq: 'yearly', priority: '0.4', lastmod: SITE_UPDATED },
];

export function siteBaseUrl(req) {
  if (process.env.PUBLIC_BASE_URL) return process.env.PUBLIC_BASE_URL.replace(/\/$/, '');
  return `${req.protocol}://${req.get('host')}`;
}

export function robotsTxt(base) {
  return `# robots.txt — MedQR
# Публично за индексиране е само маркетинговото и правното съдържание.
# Всички акаунт, спешни и генерирани (QR/карта) страници са забранени.
User-agent: *
Allow: /$
Allow: /privacy
Allow: /cookies
Allow: /terms
Allow: /llms.txt
Allow: /manifest.webmanifest
Allow: /logo.jpg
Allow: /logo.png
Allow: /.well-known/security.txt
Disallow: /dashboard
Disallow: /profile
Disallow: /login
Disallow: /register
Disallow: /2fa
Disallow: /forgot
Disallow: /reset
Disallow: /verify-email
Disallow: /e/
Disallow: /card
Disallow: /qr.png
Disallow: /label.svg

# AI / answer engines (GEO/AEO): достъп само до публичното съдържание,
# без акаунт и спешни данни.
User-agent: GPTBot
User-agent: OAI-SearchBot
User-agent: ChatGPT-User
User-agent: ClaudeBot
User-agent: Claude-Web
User-agent: anthropic-ai
User-agent: PerplexityBot
User-agent: Perplexity-User
User-agent: Google-Extended
User-agent: Applebot-Extended
User-agent: Amazonbot
User-agent: Bytespider
User-agent: CCBot
User-agent: Meta-ExternalAgent
User-agent: cohere-ai
User-agent: Bingbot
Allow: /$
Allow: /privacy
Allow: /cookies
Allow: /terms
Allow: /llms.txt
Disallow: /dashboard
Disallow: /profile
Disallow: /e/
Disallow: /card
Disallow: /qr.png
Disallow: /label.svg

Sitemap: ${base}/sitemap.xml
`;
}

export function sitemapXml(base, lastmod = new Date().toISOString().slice(0, 10)) {
  const urls = PUBLIC_PAGES.map((p) => {
    const loc = `${base}${p.path}`;
    // hreflang: BG (чист URL) = x-default, EN с ?lang=en — съвпада с canonical/head,
    // за да е кластерът реципрочен и само-референтен.
    const alts =
      `    <xhtml:link rel="alternate" hreflang="bg" href="${loc}"/>\n` +
      `    <xhtml:link rel="alternate" hreflang="en" href="${loc}?lang=en"/>\n` +
      `    <xhtml:link rel="alternate" hreflang="x-default" href="${loc}"/>\n`;
    return (
      `  <url>\n    <loc>${loc}</loc>\n    <lastmod>${p.lastmod || lastmod}</lastmod>\n` +
      `    <changefreq>${p.changefreq}</changefreq>\n    <priority>${p.priority}</priority>\n` +
      `${alts}  </url>`
    );
  }).join('\n');
  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" ` +
    `xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${urls}\n</urlset>\n`
  );
}

// llms.txt — конвенция (llmstxt.org) за насочване на LLM/answer engines
// към най-важното съдържание, в кратък markdown формат.
export function llmsTxt(base) {
  return `# MedQR

> MedQR е защитен спешен медицински профил, достъпен чрез сканиране на QR код.
> При злополука или влошаване спешен екип сканира кода и веднага вижда кръвна
> група, алергии към лекарства, хронични заболявания, медикаменти и контакт на
> близък — дори ако лицето не може да говори. Профилът изрично отбелязва слухов
> статус и предпочитан начин на комуникация.

## Ключови факти
- Данните се криптират в покой (AES-256-GCM); връзката е по HTTPS.
- Достъпът е чрез дълъг непредвидим токен, по избор защитен с PIN; всеки достъп се записва.
- GDPR-съвместимо: изрично съгласие, износ и изтриване на данните, двуфакторна автентикация.
- Администратор на данните: Carbon Stealth VCC (ЕИК 208725180, Бобов дол, България — ЕС). Хостинг: Hetzner (Германия, ЕС).
- Не е медицинско изделие и не замества професионална медицинска оценка.

## Страници
- [Начало](${base}/): какво е MedQR и как работи.
- [За нас и импресум](${base}/about): доставчик, мисия, данни на фирмата.
- [Контакти](${base}/contact): имейл, телефон, адрес, канал за сигурност.
- [Политика за поверителност](${base}/privacy): какви данни се обработват и на какво основание.
- [Политика за бисквитки](${base}/cookies): използват се само строго необходими бисквитки.
- [Общи условия](${base}/terms): условия за ползване на услугата.
- [Декларация за достъпност](${base}/accessibility): WCAG 2.1 AA / EN 301 549.
`;
}

// security.txt (RFC 9116) — насочва изследователите към канал за докладване.
export function securityTxt(base) {
  const expires = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();
  return `Contact: mailto:security@carbonstealth.eu
Expires: ${expires}
Preferred-Languages: bg, en
Canonical: ${base}/.well-known/security.txt
`;
}

export function webManifest() {
  return {
    name: 'MedQR — спешен медицински профил',
    short_name: 'MedQR',
    description: DEFAULT_DESCRIPTION,
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#f5f7fa',
    theme_color: '#1a3f66',
    lang: 'bg',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    shortcuts: [
      {
        name: 'Спешна помощ (SOS)',
        short_name: 'SOS',
        description: 'Отвори екрана за спешна помощ',
        url: '/sos',
      },
    ],
  };
}
