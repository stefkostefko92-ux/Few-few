import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Router } from 'express';
import type { Request } from 'express';
import { config } from '../config.js';
import { humanPrincipal } from '../auth/guards.js';
import { LOCALES, type Locale } from '../i18n.js';

/**
 * Витрината: единствената публична страница на продукта. Панелът зад нея е `noindex`,
 * затова целият слой за откриваемост (canonical, hreflang, JSON-LD, sitemap, llms.txt)
 * живее тук, а не в общия `head`.
 *
 * Нула твърдо зашити адреси: всичко се строи от `PUBLIC_BASE_URL`, който е конфигурация.
 */
export const landingRouter: Router = Router();

/** Абсолютен адрес спрямо публичната основа, без двойна наклонена черта. */
function absolute(path: string): string {
  return new URL(path, `${config().PUBLIC_BASE_URL.replace(/\/+$/, '')}/`).toString();
}

/** Канонично: витрината е на корена; езикът е параметър, не отделен адрес. */
function canonicalFor(locale: Locale): string {
  return locale === 'bg' ? absolute('/') : absolute(`/?lang=${locale}`);
}

/** Езиковите варианти за `hreflang`, плюс `x-default` към източника. */
function alternates(): Array<{ hreflang: string; href: string }> {
  return [
    ...LOCALES.map((code) => ({ hreflang: code, href: canonicalFor(code) })),
    { hreflang: 'x-default', href: absolute('/') },
  ];
}

const FAQ_KEYS = ['q1', 'q2', 'q3', 'q4', 'q5', 'q6'] as const;

landingRouter.get('/', (req: Request, res) => {
  const locale = res.locals.locale as Locale;
  const t = res.locals.t as (key: string) => string;
  const signedIn = Boolean(humanPrincipal(req));

  // Структурираните данни се строят от СЪЩИТЕ преводи, които вижда човекът — така
  // не може да се разминат, а при добавен език се превеждат заедно с останалото.
  const structured = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        '@id': absolute('/#organization'),
        name: 'Carbon Stealth VCC',
        url: 'https://carbonstealth.eu',
        slogan: t('landing.footer.madeBy'),
      },
      {
        '@type': 'WebSite',
        '@id': absolute('/#website'),
        url: absolute('/'),
        name: 'Piuma',
        description: t('landing.meta.description'),
        inLanguage: LOCALES.slice(),
        publisher: { '@id': absolute('/#organization') },
      },
      {
        '@type': 'SoftwareApplication',
        '@id': absolute('/#app'),
        name: 'Piuma',
        applicationCategory: 'BusinessApplication',
        operatingSystem: 'Web',
        description: t('landing.meta.description'),
        url: absolute('/'),
        inLanguage: locale,
        publisher: { '@id': absolute('/#organization') },
        featureList: [
          t('landing.how.step1Title'),
          t('landing.how.step2Title'),
          t('landing.how.step3Title'),
          t('landing.autopilot.title'),
          t('landing.security.title'),
        ],
      },
      {
        '@type': 'BreadcrumbList',
        '@id': absolute('/#breadcrumbs'),
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Piuma', item: canonicalFor(locale) },
        ],
      },
      {
        '@type': 'FAQPage',
        '@id': absolute('/#faq'),
        inLanguage: locale,
        mainEntity: FAQ_KEYS.map((key) => ({
          '@type': 'Question',
          name: t(`landing.faq.${key}`),
          acceptedAnswer: {
            '@type': 'Answer',
            text: t(`landing.faq.${key.replace('q', 'a')}`),
          },
        })),
      },
    ],
  };

  res.render('landing/index', {
    canonical: canonicalFor(locale),
    alternates: alternates(),
    ogImage: absolute('/static/landing/og.png'),
    faqKeys: FAQ_KEYS,
    signedIn,
    // Стойностите идват от речниците, не от вход на потребител; `<` пак се екранира,
    // за да не може низ да затвори етикета предсрочно.
    structuredData: JSON.stringify(structured).replace(/</g, '\\u003c'),
  });
});

/** Роботите: витрината се обхожда, панелът и машинните пътища — не. */
landingRouter.get('/robots.txt', (_req, res) => {
  res
    .type('text/plain')
    .send(
      [
        'User-agent: *',
        'Allow: /$',
        'Disallow: /admin',
        'Disallow: /agent/',
        'Disallow: /auth/',
        '',
        `Sitemap: ${absolute('/sitemap.xml')}`,
        '',
      ].join('\n'),
    );
});

landingRouter.get('/sitemap.xml', (_req, res) => {
  const today = new Date().toISOString().slice(0, 10);
  const links = alternates()
    .map((a) => `    <xhtml:link rel="alternate" hreflang="${a.hreflang}" href="${a.href}"/>`)
    .join('\n');
  const entries = LOCALES.map((locale) =>
    [
      '  <url>',
      `    <loc>${canonicalFor(locale)}</loc>`,
      links,
      `    <lastmod>${today}</lastmod>`,
      '    <changefreq>weekly</changefreq>',
      `    <priority>${locale === 'bg' ? '1.0' : '0.8'}</priority>`,
      '  </url>',
    ].join('\n'),
  ).join('\n');

  res
    .type('application/xml')
    .send(
      `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${entries}\n</urlset>\n`,
    );
});

/**
 * Ключът за IndexNow. НЕ е тайна — това е публичен знак за собственост: търсачката го
 * чете от сайта, за да приеме подаването. Протоколът го иска на `/<ключ>.txt`, а нашият
 * инструмент (`tools/seo/indexnow.mjs`) го търси и на `/indexnow-key.txt` — затова и
 * двата адреса отдават едно и също съдържание.
 */
const INDEXNOW_KEY = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'public', 'indexnow-key.txt'),
  'utf8',
).trim();

landingRouter.get(['/indexnow-key.txt', `/${INDEXNOW_KEY}.txt`], (_req, res) => {
  res.type('text/plain').send(INDEXNOW_KEY);
});

/** Съдържание за четящите модели: какво е продуктът и кое е важното, в прав текст. */
landingRouter.get('/llms.txt', (_req, res) => {
  const t = res.locals.t as (key: string) => string;
  res
    .type('text/plain')
    .send(
      [
        '# Piuma',
        '',
        `> ${t('landing.meta.description')}`,
        '',
        t('landing.hero.lead'),
        '',
        `## ${t('landing.how.title')}`,
        `- ${t('landing.how.step1Title')}: ${t('landing.how.step1Body')}`,
        `- ${t('landing.how.step2Title')}: ${t('landing.how.step2Body')}`,
        `- ${t('landing.how.step3Title')}: ${t('landing.how.step3Body')}`,
        '',
        `## ${t('landing.how.guardTitle')}`,
        `- ${t('landing.faq.q1')} ${t('landing.faq.a1')}`,
        `- ${t('landing.faq.q2')} ${t('landing.faq.a2')}`,
        '',
        '## Links',
        `- ${absolute('/')}`,
        '- https://carbonstealth.eu',
        '',
      ].join('\n'),
    );
});
