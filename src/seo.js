// Централизирана SEO/GEO/AEO конфигурация: публични страници, robots.txt,
// sitemap.xml и llms.txt (за AI/answer engines).

export const SITE_NAME = 'MedQR';
export const SITE_LOCALE = 'bg_BG';
export const DEFAULT_DESCRIPTION =
  'MedQR създава защитен спешен медицински профил с QR код — кръвна група, ' +
  'алергии към лекарства, заболявания и спешен контакт, достъпни при злополука. ' +
  'Криптирано, GDPR-съвместимо, с хостинг в ЕС.';

// Само публичните (индексируеми) страници.
export const PUBLIC_PAGES = [
  { path: '/', changefreq: 'weekly', priority: '1.0' },
  { path: '/privacy', changefreq: 'yearly', priority: '0.5' },
  { path: '/cookies', changefreq: 'yearly', priority: '0.5' },
  { path: '/terms', changefreq: 'yearly', priority: '0.5' },
];

export function siteBaseUrl(req) {
  if (process.env.PUBLIC_BASE_URL) return process.env.PUBLIC_BASE_URL.replace(/\/$/, '');
  return `${req.protocol}://${req.get('host')}`;
}

export function robotsTxt(base) {
  return `# robots.txt — MedQR
User-agent: *
Allow: /$
Allow: /privacy
Allow: /cookies
Allow: /terms
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

# AI / answer engines са добре дошли по публичното съдържание.
User-agent: GPTBot
User-agent: OAI-SearchBot
User-agent: ChatGPT-User
User-agent: ClaudeBot
User-agent: Claude-Web
User-agent: PerplexityBot
User-agent: Google-Extended
User-agent: Applebot-Extended
Allow: /$
Allow: /privacy
Allow: /cookies
Allow: /terms
Disallow: /dashboard
Disallow: /profile
Disallow: /e/

Sitemap: ${base}/sitemap.xml
`;
}

export function sitemapXml(base, lastmod = new Date().toISOString().slice(0, 10)) {
  const urls = PUBLIC_PAGES.map(
    (p) =>
      `  <url>\n    <loc>${base}${p.path}</loc>\n    <lastmod>${lastmod}</lastmod>\n` +
      `    <changefreq>${p.changefreq}</changefreq>\n    <priority>${p.priority}</priority>\n  </url>`
  ).join('\n');
  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`
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
- Администратор на данните: CarbonStealth VCC. Хостинг: Hetzner (Германия, ЕС).
- Не е медицинско изделие и не замества професионална медицинска оценка.

## Страници
- [Начало](${base}/): какво е MedQR и как работи.
- [Политика за поверителност](${base}/privacy): какви данни се обработват и на какво основание.
- [Политика за бисквитки](${base}/cookies): използват се само строго необходими бисквитки.
- [Общи условия](${base}/terms): условия за ползване на услугата.
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
    theme_color: '#0b6e8c',
    lang: 'bg',
    icons: [{ src: '/favicon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }],
  };
}
