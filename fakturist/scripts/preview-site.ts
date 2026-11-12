// Dev-скрипт: рендерира всяка страница на витрината (4 страници × 2 езика + 404/500) с DEFAULT_PLANS и
// примерни locals и прави снимки 390 и 1440 px, светла и тъмна тема. Не е част от билда.
//   npx tsx scripts/preview-site.ts [изходна-папка] [--no-shots]
// Сървърът тук слага същия CSP като src/server.ts, за да се хванат нарушения в конзолата.
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { mkdirSync, readFileSync, existsSync, writeFileSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import ejs from 'ejs';
import { BRAND } from '../src/brand.js';
import { COMPANY, CONTENT_UPDATED } from '../src/company.js';
import { FEATURES, FEATURE_GROUPS } from '../src/features.js';
import { DEFAULT_PLANS } from '../src/billing/plans.js';
import { formatEuro } from '../src/routes/site.js';
import { safeJson } from '../src/http/json-ld.js';
import { pageUrl, SITE_PAGES, type SitePageId } from '../src/seo/pages.js';
import { faqItems, structuredData } from '../src/seo/structured-data.js';
import { translator, type Locale } from '../src/i18n.js';
import { ROOT } from '../src/paths.js';

const args = process.argv.slice(2);
const noShots = args.includes('--no-shots');
const outDir =
  args.find((a) => !a.startsWith('--')) ??
  '/tmp/claude-0/-home-user-Few-few/ef76da45-6d33-5d45-8cf0-a31f2bca752d/scratchpad/preview';
mkdirSync(outDir, { recursive: true });

const BASE = 'https://fakturist.example';
const NONCE = 'preview-nonce';
const plans = DEFAULT_PLANS.filter((p) => p.isPublic).map((p) => ({ ...p }));
const noPrices = args.includes('--no-prices');

function commonLocals(locale: Locale): Record<string, unknown> {
  const t = translator(locale);
  return {
    lang: locale,
    htmlLang: locale,
    t,
    brand: BRAND,
    company: COMPANY,
    urls: Object.fromEntries(SITE_PAGES.map((p) => [p.id, p.paths[locale]])),
    registrationOpen: true,
    cspNonce: NONCE,
    v: 'preview',
  };
}

async function renderPage(id: SitePageId, locale: Locale): Promise<string> {
  const t = translator(locale);
  const pagePlans = noPrices ? null : plans;
  const keywords = t(`site.${id}.meta.keywords`)
    .split(',')
    .map((w) => w.trim());
  const locals = {
    ...commonLocals(locale),
    contentUpdated: CONTENT_UPDATED,
    page: id,
    plans: pagePlans,
    features: FEATURES,
    featureGroups: FEATURE_GROUPS,
    formatEuro: (cents: number) => formatEuro(cents, locale),
    faq: faqItems(locale, t, id),
    seo: {
      title: t(`site.${id}.meta.title`),
      description: t(`site.${id}.meta.description`),
      keywords,
      canonical: pageUrl(BASE, id, locale),
      alternates: { bg: pageUrl(BASE, id, 'bg'), en: pageUrl(BASE, id, 'en') },
      xDefault: pageUrl(BASE, id, 'bg'),
      ogLocale: locale === 'bg' ? 'bg_BG' : 'en_GB',
      ogImage: `${BASE}/img/og-${locale}.png`,
      jsonLd: safeJson(structuredData({ base: BASE, locale, t, page: id, plans: pagePlans ?? [] })),
    },
  };
  return ejs.renderFile(join(ROOT, 'views', 'site', `${id}.ejs`), locals);
}

async function renderError(code: 404 | 500, locale: Locale): Promise<string> {
  const locals = { ...commonLocals(locale), t: translator(locale, false) };
  return ejs.renderFile(join(ROOT, 'views', 'errors', `${code}.ejs`), locals);
}

const pages = new Map<string, string>(); // адрес → HTML
const jobs: Array<{ name: string; url: string }> = [];
for (const locale of ['bg', 'en'] as const) {
  for (const page of SITE_PAGES) {
    const html = await renderPage(page.id, locale);
    pages.set(page.paths[locale], html);
    jobs.push({ name: `${locale}-${page.id}`, url: page.paths[locale] });
    writeFileSync(join(outDir, `${locale}-${page.id}.html`), html);
  }
  for (const code of [404, 500] as const) {
    const url = locale === 'bg' ? `/__${code}` : `/en/__${code}`;
    pages.set(url, await renderError(code, locale));
    jobs.push({ name: `${locale}-${code}`, url });
  }
}
console.log(`render: ${jobs.length} страници без грешки`);
if (noShots) process.exit(0);

const MIME: Record<string, string> = {
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
};
const CSP = `default-src 'self'; script-src 'self' 'nonce-${NONCE}'; script-src-attr 'none'; style-src 'self'; style-src-attr 'none'; img-src 'self' data:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'`;
const server = createServer((req, res) => {
  const path = (req.url ?? '/').split('?')[0] ?? '/';
  const html = pages.get(path);
  if (html) {
    res.writeHead(200, {
      'content-type': 'text/html; charset=utf-8',
      'content-security-policy': CSP,
    });
    res.end(html);
    return;
  }
  const file = normalize(join(ROOT, 'public', path));
  if (file.startsWith(join(ROOT, 'public')) && existsSync(file)) {
    res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' });
    res.end(readFileSync(file));
    return;
  }
  res.writeHead(404).end();
});
await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
const address = server.address();
const port = typeof address === 'object' && address ? address.port : 0;

const require = createRequire('/usr/local/lib/node_modules_global/');
const { chromium } = require('playwright') as typeof import('playwright');
const browser = await chromium.launch();
let problems = 0;
for (const job of jobs) {
  for (const width of [390, 1440]) {
    for (const scheme of ['light', 'dark'] as const) {
      const context = await browser.newContext({
        viewport: { width, height: 900 },
        colorScheme: scheme,
        reducedMotion: 'reduce',
      });
      const page = await context.newPage();
      page.on('console', (m) => {
        if (m.type() === 'error' || m.type() === 'warning') {
          problems += 1;
          console.log(`  [${job.name} ${width} ${scheme}] ${m.type()}: ${m.text()}`);
        }
      });
      await page.goto(`http://127.0.0.1:${port}${job.url}`, { waitUntil: 'load' });
      await page.evaluate(() => document.fonts.ready);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      if (overflow > 0) {
        problems += 1;
        console.log(`  [${job.name} ${width} ${scheme}] хоризонтален скрол: +${overflow}px`);
      }
      await page.screenshot({
        path: join(outDir, `${job.name}-${width}-${scheme}.png`),
        fullPage: true,
      });
      await context.close();
    }
  }
}
await browser.close();
server.close();
console.log(`снимки: ${jobs.length * 4} в ${outDir}; проблеми: ${problems}`);
