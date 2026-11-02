/**
 * Сервиране на SPA-то с правилни HTTP статуси и сървърно рендирани SEO
 * метаданни (Google Search Essentials):
 *
 *  - Само реалните маршрути на клиента (client/src/App.tsx) получават
 *    index.html; всичко друго → истински HTTP 404 (полезна страница +
 *    noindex), не „soft 404“ с началната страница и статус 200.
 *  - `/`, `/?lang=it`, `/?lang=bg` са истински езикови версии: <html lang>,
 *    <title>, description, keywords, текстът за краулъри без JS и
 *    самореферентният canonical са на съответния език; hreflang клъстерът е
 *    реципрочен + x-default.
 *  - `/terms`, `/privacy` — индексируеми, собствен title/description/canonical.
 *  - `/login`, `/register` и останалите служебни/игрови маршрути — noindex,
 *    без canonical към `/` и без hreflang.
 *
 * Шаблонът е билднатият client/dist/index.html; заменят се блоковете между
 * маркерите <!--seo:head-->…<!--/seo:head--> и <!--seo:body-->…<!--/seo:body-->
 * и атрибутът lang на <html>.
 */
import fs from 'fs';
import path from 'path';
import express from 'express';
import type { Express, Request, Response } from 'express';
import {
  DOC_PAGES,
  LANDING,
  LOCALES,
  NOT_FOUND,
  UTILITY_PAGES,
  type Locale,
  type PageCopy,
  type UtilityPage,
} from './copy';

export const SITE_ORIGIN = 'https://nexus.carbonstealth.eu';
const OG_IMAGE = `${SITE_ORIGIN}/og-cover.jpg`;
const ORG_ID = 'https://carbonstealth.eu/#organization';
const WEBSITE_ID = `${SITE_ORIGIN}/#website`;
const GAME_ID = `${SITE_ORIGIN}/#game`;

const ROBOTS_INDEX = 'index, follow, max-image-preview:large, max-snippet:-1';
const ROBOTS_NOINDEX = 'noindex';

export type DocPage = keyof typeof DOC_PAGES;

export type SpaRoute =
  | { kind: 'landing'; locale: Locale }
  | { kind: 'doc'; page: DocPage }
  | { kind: 'utility'; page: UtilityPage };

/** Каноничният адрес на всяка езикова версия на лендинга. */
export function landingUrl(locale: Locale): string {
  return locale === 'en' ? `${SITE_ORIGIN}/` : `${SITE_ORIGIN}/?lang=${locale}`;
}

/** Всички канонични, индексируеми адреси — sitemap.xml е точно този списък. */
export const INDEXABLE_URLS: string[] = [
  ...LOCALES.map(landingUrl),
  ...(Object.keys(DOC_PAGES) as DocPage[]).map((p) => `${SITE_ORIGIN}/${p}`),
];

const EXACT_ROUTES: Record<string, SpaRoute> = {
  '/terms': { kind: 'doc', page: 'terms' },
  '/privacy': { kind: 'doc', page: 'privacy' },
  '/login': { kind: 'utility', page: 'login' },
  '/register': { kind: 'utility', page: 'register' },
  '/forgot': { kind: 'utility', page: 'forgot' },
  '/reset': { kind: 'utility', page: 'reset' },
  '/create': { kind: 'utility', page: 'create' },
  // QA сцената (в продукция само с ?debug=1, иначе клиентът връща към `/`).
  '/demo/combat': { kind: 'utility', page: 'app' },
};

function isUnder(p: string, prefix: string): boolean {
  return p === prefix || p.startsWith(`${prefix}/`);
}

/**
 * Огледало на маршрутите в client/src/App.tsx. `/app/*` и `/admin/*` се
 * пропускат към SPA-то изцяло (вътрешният NotFound на клиента покрива
 * непознатите подмаршрути; robots.txt ги забранява, а отговорът е noindex).
 * Връща null за непознат адрес → 404.
 */
export function matchRoute(pathname: string, lang?: unknown): SpaRoute | null {
  if (pathname === '/') {
    const locale: Locale = lang === 'it' || lang === 'bg' ? lang : 'en';
    return { kind: 'landing', locale };
  }
  const exact = EXACT_ROUTES[pathname];
  if (exact) return exact;
  if (isUnder(pathname, '/app') || isUnder(pathname, '/admin')) return { kind: 'utility', page: 'app' };
  return null;
}

export function isIndexable(route: SpaRoute): boolean {
  return route.kind === 'landing' || route.kind === 'doc';
}

export function canonicalUrl(route: SpaRoute): string | null {
  if (route.kind === 'landing') return landingUrl(route.locale);
  if (route.kind === 'doc') return `${SITE_ORIGIN}/${route.page}`;
  return null;
}

export function htmlLang(route: SpaRoute): Locale {
  return route.kind === 'landing' ? route.locale : 'en';
}

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** JSON-LD в <script> — `<` се екранира, за да не може низ да затвори тага. */
function jsonLd(graph: unknown[]): string {
  const json = JSON.stringify({ '@context': 'https://schema.org', '@graph': graph }).replace(/</g, '\\u003c');
  return `<script type="application/ld+json">${json}</script>`;
}

function pageCopy(route: SpaRoute): PageCopy {
  if (route.kind === 'landing') return LANDING[route.locale];
  if (route.kind === 'doc') return DOC_PAGES[route.page];
  return UTILITY_PAGES[route.page];
}

/** Реалният оператор (публичният импресум, client/src/lib/legal.ts). */
function organizationNode(): Record<string, unknown> {
  return {
    '@type': 'Organization',
    '@id': ORG_ID,
    name: 'Carbon Stealth',
    legalName: 'Carbon Stealth VCC',
    url: 'https://carbonstealth.eu/',
    email: 'info@carbonstealth.eu',
  };
}

function websiteNode(): Record<string, unknown> {
  return {
    '@type': 'WebSite',
    '@id': WEBSITE_ID,
    url: `${SITE_ORIGIN}/`,
    name: 'Nexus Dominion',
    inLanguage: [...LOCALES],
    publisher: { '@id': ORG_ID },
  };
}

function structuredData(route: SpaRoute, url: string, copy: PageCopy): string {
  const lang = htmlLang(route);
  const webPage: Record<string, unknown> = {
    '@type': 'WebPage',
    '@id': `${url}#webpage`,
    url,
    name: copy.title,
    description: copy.description,
    inLanguage: lang,
    isPartOf: { '@id': WEBSITE_ID },
  };
  const graph: Record<string, unknown>[] = [organizationNode(), websiteNode(), webPage];
  if (route.kind === 'landing') {
    webPage.about = { '@id': GAME_ID };
    webPage.primaryImageOfPage = { '@type': 'ImageObject', url: OG_IMAGE, width: 1200, height: 630 };
    // Само проверими факти от видимото съдържание на лендинга. Без
    // aggregateRating/review (нямаме реални оценки — не се измислят), без
    // FAQPage (няма видим FAQ на страницата).
    graph.push({
      '@type': 'VideoGame',
      '@id': GAME_ID,
      name: 'Nexus Dominion',
      url: `${SITE_ORIGIN}/`,
      description: LANDING[route.locale].lead,
      image: OG_IMAGE,
      genre: ['MMORPG', 'Fantasy', 'Role-playing game', 'Browser game'],
      gamePlatform: 'Web browser',
      applicationCategory: 'GameApplication',
      operatingSystem: 'Any (web browser)',
      playMode: ['MultiPlayer', 'SinglePlayer'],
      inLanguage: [...LOCALES],
      isAccessibleForFree: true,
      offers: {
        '@type': 'Offer',
        price: '0',
        priceCurrency: 'EUR',
        availability: 'https://schema.org/InStock',
        url: `${SITE_ORIGIN}/register`,
      },
      publisher: { '@id': ORG_ID },
      // Минималната възраст за регистрация (BG/IT: 14 — server/src/routes/auth.ts);
      // по подразбиране сървърът пуска само BG и IT (middleware/geo.ts).
      audience: {
        '@type': 'PeopleAudience',
        suggestedMinAge: 14,
        geographicArea: [
          { '@type': 'Country', name: 'Italy' },
          { '@type': 'Country', name: 'Bulgaria' },
        ],
      },
    });
  }
  return jsonLd(graph);
}

/** Съдържанието между <!--seo:head--> маркерите за дадения маршрут. */
export function renderHead(route: SpaRoute): string {
  const copy = pageCopy(route);
  const indexable = isIndexable(route);
  const canonical = canonicalUrl(route);
  const lines: string[] = [
    `<title>${esc(copy.title)}</title>`,
    `<meta name="description" content="${esc(copy.description)}" />`,
    `<meta name="keywords" content="${esc(copy.keywords.join(', '))}" />`,
    `<meta name="author" content="Carbon Stealth" />`,
    `<meta name="robots" content="${indexable ? ROBOTS_INDEX : ROBOTS_NOINDEX}" />`,
  ];
  if (canonical) lines.push(`<link rel="canonical" href="${esc(canonical)}" />`);
  if (route.kind === 'landing') {
    // Реципрочен клъстер: всяка версия изброява всички (вкл. себе си) + x-default.
    for (const loc of LOCALES) {
      lines.push(`<link rel="alternate" hreflang="${loc}" href="${esc(landingUrl(loc))}" />`);
    }
    lines.push(`<link rel="alternate" hreflang="x-default" href="${esc(landingUrl('en'))}" />`);
  }
  const shareable = indexable || (route.kind === 'utility' && (route.page === 'login' || route.page === 'register'));
  if (shareable) {
    const url = canonical ?? `${SITE_ORIGIN}/${route.kind === 'utility' ? route.page : ''}`;
    lines.push(
      `<meta property="og:type" content="website" />`,
      `<meta property="og:site_name" content="Nexus Dominion" />`,
      `<meta property="og:title" content="${esc(copy.title)}" />`,
      `<meta property="og:description" content="${esc(copy.description)}" />`,
      `<meta property="og:url" content="${esc(url)}" />`,
      `<meta property="og:image" content="${OG_IMAGE}" />`,
      `<meta property="og:image:width" content="1200" />`,
      `<meta property="og:image:height" content="630" />`,
      `<meta property="og:image:type" content="image/jpeg" />`,
    );
    if (route.kind === 'landing') {
      lines.push(`<meta property="og:locale" content="${LANDING[route.locale].ogLocale}" />`);
      for (const loc of LOCALES) {
        if (loc !== route.locale) lines.push(`<meta property="og:locale:alternate" content="${LANDING[loc].ogLocale}" />`);
      }
    } else {
      lines.push(`<meta property="og:locale" content="en_US" />`);
    }
    lines.push(
      `<meta name="twitter:card" content="summary_large_image" />`,
      `<meta name="twitter:title" content="${esc(copy.title)}" />`,
      `<meta name="twitter:description" content="${esc(copy.description)}" />`,
      `<meta name="twitter:image" content="${OG_IMAGE}" />`,
    );
  }
  if (indexable && canonical) lines.push(structuredData(route, canonical, copy));
  return lines.join('\n    ');
}

/**
 * Текстът за краулъри без JS (между <!--seo:body--> маркерите). Само на
 * индексируемите страници и само на езика на страницата; клиентът го маха
 * при монтиране (main.tsx), така че в рендирания DOM няма скрит текст.
 */
export function renderBody(route: SpaRoute): string {
  const copy = pageCopy(route);
  if (!isIndexable(route) || !copy.h1) return '';
  return (
    `<div id="seo-bootstrap" style="position:absolute;left:-9999px;top:-9999px;width:1px;height:1px;overflow:hidden">` +
    `<h1>${esc(copy.h1)}</h1>` +
    (copy.lead ? `<p>${esc(copy.lead)}</p>` : '') +
    `</div>`
  );
}

const HEAD_BLOCK = /<!--seo:head-->[\s\S]*?<!--\/seo:head-->/;
const BODY_BLOCK = /<!--seo:body-->[\s\S]*?<!--\/seo:body-->/;
const HTML_TAG = /<html\b[^>]*>/i;

/** Проверява, че шаблонът има всички маркери (иначе рендирането е no-op). */
export function hasSeoMarkers(template: string): boolean {
  return HEAD_BLOCK.test(template) && BODY_BLOCK.test(template) && HTML_TAG.test(template);
}

export function renderPage(template: string, route: SpaRoute): string {
  // Заместване с функция — `$` в текста не се тълкува като шаблон на replace.
  return template
    .replace(HTML_TAG, () => `<html lang="${htmlLang(route)}">`)
    .replace(HEAD_BLOCK, () => renderHead(route))
    .replace(BODY_BLOCK, () => renderBody(route));
}

function pickLocale(req: Request): Locale {
  const q = req.query.lang;
  if (q === 'it' || q === 'bg' || q === 'en') return q;
  const accepted = req.acceptsLanguages(...LOCALES);
  return (typeof accepted === 'string' && (LOCALES as readonly string[]).includes(accepted) ? accepted : 'en') as Locale;
}

/** Самостоятелна 404 страница (без JS, само inline стил — минава през CSP). */
export function renderNotFound(locale: Locale): string {
  const c = NOT_FOUND[locale];
  return `<!doctype html>
<html lang="${locale}">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="robots" content="noindex" />
    <meta name="color-scheme" content="dark" />
    <title>${esc(c.title)}</title>
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <style>
      body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0b0d12;color:#e8e7e1;font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
      main{max-width:560px;margin:16px;padding:40px 32px;border:1px solid #2d3548;border-radius:18px;background:linear-gradient(180deg,#11141b,#0a0c12);text-align:center}
      .code{font-family:Georgia,serif;font-size:72px;line-height:1;color:#d6a13d}
      h1{margin:16px 0 8px;font-size:24px;color:#f7d77e}
      p{margin:0 0 24px;color:#b9b8b1;line-height:1.6}
      nav{display:flex;flex-wrap:wrap;gap:12px;justify-content:center}
      a{display:inline-block;padding:10px 18px;border:1px solid #d6a13d;border-radius:10px;color:#f7d77e;text-decoration:none}
      a.primary{background:#d6a13d;color:#0b0d12;font-weight:600}
      a:focus-visible{outline:3px solid #f7d77e;outline-offset:2px}
    </style>
  </head>
  <body>
    <main>
      <div class="code" aria-hidden="true">404</div>
      <h1>${esc(c.h1)}</h1>
      <p>${esc(c.body)}</p>
      <nav>
        <a class="primary" href="${locale === 'en' ? '/' : `/?lang=${locale}`}">${esc(c.home)}</a>
        <a href="/register">${esc(c.register)}</a>
        <a href="/login">${esc(c.login)}</a>
      </nav>
    </main>
  </body>
</html>
`;
}

function sendNotFound(req: Request, res: Response): void {
  const locale = pickLocale(req);
  res
    .status(404)
    .set('X-Robots-Tag', 'noindex')
    .set('Cache-Control', 'no-cache')
    .set('Content-Language', locale)
    .vary('Accept-Language')
    .type('html')
    .send(renderNotFound(locale));
}

function queryString(req: Request): string {
  const i = req.originalUrl.indexOf('?');
  return i >= 0 ? req.originalUrl.slice(i) : '';
}

interface TemplateCache {
  mtimeMs: number;
  template: string;
  pages: Map<string, string>;
}

/**
 * Монтира статичните файлове на клиента, SPA маршрутите и финалния 404.
 * Вика се СЛЕД всички /api рутери и ПРЕДИ глобалния error handler.
 */
export function mountSpa(app: Express, opts: { clientDist: string }): void {
  const indexFile = path.join(opts.clientDist, 'index.html');
  let cache: TemplateCache | null = null;
  let warnedMarkers = false;

  function rendered(route: SpaRoute): string | null {
    let stat: fs.Stats;
    try {
      stat = fs.statSync(indexFile);
    } catch {
      return null; // няма клиентски билд (dev през vite) → 404
    }
    if (!cache || cache.mtimeMs !== stat.mtimeMs) {
      const template = fs.readFileSync(indexFile, 'utf8');
      if (!hasSeoMarkers(template) && !warnedMarkers) {
        warnedMarkers = true;
        console.error('[seo] client/dist/index.html няма <!--seo:head-->/<!--seo:body--> маркерите — SEO метаданните не се рендират.');
      }
      cache = { mtimeMs: stat.mtimeMs, template, pages: new Map() };
    }
    const key = JSON.stringify(route);
    let html = cache.pages.get(key);
    if (html === undefined) {
      html = renderPage(cache.template, route);
      cache.pages.set(key, html);
    }
    return html;
  }

  // /index.html е дубликат на `/` → постоянно пренасочване към каноничния адрес.
  app.get('/index.html', (req, res) => res.redirect(301, `/${queryString(req)}`));

  // index:false — `/` минава през рендера по-долу, не през суровия шаблон;
  // redirect:false — директория без наклонена черта не се пренасочва (→ 404).
  app.use(express.static(opts.clientDist, { index: false, redirect: false }));

  // Непознат API адрес → JSON 404 (не HTML страница).
  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'Not found' });
  });

  app.get('*', (req, res, next) => {
    const route = matchRoute(req.path, req.query.lang);
    if (!route) {
      // `/login/` → `/login` (един адрес на страница). Пренасочва се само към
      // познат маршрут, никога към произволен адрес (без open redirect).
      if (req.path.length > 1 && req.path.endsWith('/')) {
        const stripped = req.path.replace(/\/+$/, '');
        if (stripped && matchRoute(stripped)) return res.redirect(301, `${stripped}${queryString(req)}`);
      }
      return next();
    }
    const html = rendered(route);
    if (html === null) return next();
    res.set('Cache-Control', 'no-cache');
    if (!isIndexable(route)) res.set('X-Robots-Tag', 'noindex');
    if (route.kind === 'landing') res.set('Content-Language', route.locale);
    res.type('html').send(html);
  });

  // Всичко останало: истински 404 + noindex.
  app.use(sendNotFound);
}
