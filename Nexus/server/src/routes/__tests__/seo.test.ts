import test from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import os from 'os';
import path from 'path';
import express from 'express';
import request from 'supertest';
import {
  INDEXABLE_URLS,
  SITE_ORIGIN,
  hasSeoMarkers,
  landingUrl,
  mountSpa,
} from '../../seo/pages';
import { DOC_PAGES, LANDING, LOCALES, NOT_FOUND, UTILITY_PAGES } from '../../seo/copy';

/**
 * Google Search Essentials за nexus.carbonstealth.eu (одит с Googlebot UA):
 *  - непознат адрес връщаше 200 + началната страница (soft 404) → сега 404 + noindex;
 *  - sitemap-ът изброяваше /?lang=it, /?lang=bg, /login, /register, всичките
 *    с canonical към `/` → сега само канонични, индексируеми адреси;
 *  - hreflang сочеше към адреси, канонизирани към `/` → сега истински
 *    езикови версии със самореферентен canonical и реципрочен клъстер;
 *  - /login и /register бяха индексируеми с canonical към `/` → сега noindex.
 * Шаблонът е истинският client/index.html (същите маркери като в билда).
 */

const NEXUS_ROOT = path.resolve(__dirname, '../../../..');
const CLIENT = path.join(NEXUS_ROOT, 'client');

function makeDist(): string {
  const dist = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-seo-'));
  fs.copyFileSync(path.join(CLIENT, 'index.html'), path.join(dist, 'index.html'));
  for (const f of ['robots.txt', 'sitemap.xml', 'llms.txt', 'favicon.svg']) {
    fs.copyFileSync(path.join(CLIENT, 'public', f), path.join(dist, f));
  }
  fs.mkdirSync(path.join(dist, 'assets'));
  fs.writeFileSync(path.join(dist, 'assets', 'index-test.js'), 'console.log(1);');
  return dist;
}

function buildApp() {
  const app = express();
  app.get('/api/health', (_req, res) => res.json({ ok: true }));
  mountSpa(app, { clientDist: makeDist() });
  return app;
}

const app = buildApp();

function canonicalOf(html: string): string[] {
  return [...html.matchAll(/<link rel="canonical" href="([^"]+)"/g)].map((m) => m[1]);
}
function hreflangOf(html: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of html.matchAll(/<link rel="alternate" hreflang="([^"]+)" href="([^"]+)"/g)) out[m[1]] = m[2];
  return out;
}
function metaOf(html: string, name: string): string | null {
  const m = html.match(new RegExp(`<meta name="${name}" content="([^"]*)"`));
  return m ? m[1] : null;
}
function titleOf(html: string): string | null {
  const m = html.match(/<title>([^<]*)<\/title>/);
  return m ? m[1] : null;
}
function langOf(html: string): string | null {
  const m = html.match(/<html lang="([^"]+)">/);
  return m ? m[1] : null;
}
function jsonLdOf(html: string): any[] {
  return [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]));
}
function unescapeHtml(s: string): string {
  return s.replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
}
function pathOf(url: string): string {
  return url.slice(SITE_ORIGIN.length);
}

test('шаблонът client/index.html има SEO маркерите, които сървърът заменя', () => {
  const tpl = fs.readFileSync(path.join(CLIENT, 'index.html'), 'utf8');
  assert.ok(hasSeoMarkers(tpl));
});

test('soft 404: непознати адреси → истински 404 + noindex, без canonical', async () => {
  for (const p of ['/cs-audit-no-such-page-7781', '/cs-audit/no/such/7781.html', '/assets/missing-chunk.js', '/assets', '/loginx', '/app-store']) {
    const res = await request(app).get(p);
    assert.equal(res.status, 404, `${p} → ${res.status}`);
    assert.match(res.headers['content-type'], /text\/html/);
    assert.equal(res.headers['x-robots-tag'], 'noindex', p);
    assert.equal(metaOf(res.text, 'robots'), 'noindex', p);
    assert.deepEqual(canonicalOf(res.text), [], p);
    assert.ok(res.text.includes('href="/"'), `${p}: 404 страницата води към началото`);
  }
});

test('404 страницата следва Accept-Language / ?lang', async () => {
  const it = await request(app).get('/no-such').set('Accept-Language', 'it-IT,it;q=0.9');
  assert.equal(it.status, 404);
  assert.equal(langOf(it.text), 'it');
  assert.ok(it.text.includes(NOT_FOUND.it.h1));
  const bg = await request(app).get('/no-such?lang=bg');
  assert.equal(langOf(bg.text), 'bg');
  assert.ok(bg.text.includes(NOT_FOUND.bg.h1));
  const en = await request(app).get('/no-such');
  assert.equal(langOf(en.text), 'en');
});

test('непознат /api адрес → JSON 404; реалните API маршрути работят', async () => {
  const miss = await request(app).get('/api/no-such-endpoint');
  assert.equal(miss.status, 404);
  assert.deepEqual(miss.body, { error: 'Not found' });
  const ok = await request(app).get('/api/health');
  assert.equal(ok.status, 200);
});

test('статичните файлове (robots, sitemap, llms, assets) се сервират', async () => {
  const robots = await request(app).get('/robots.txt');
  assert.equal(robots.status, 200);
  assert.match(robots.headers['content-type'], /text\/plain/);
  const sm = await request(app).get('/sitemap.xml');
  assert.equal(sm.status, 200);
  assert.match(sm.headers['content-type'], /xml/);
  assert.equal((await request(app).get('/llms.txt')).status, 200);
  assert.equal((await request(app).get('/assets/index-test.js')).status, 200);
});

test('езикови версии: собствен <html lang>, title, description, canonical и текст', async () => {
  for (const loc of LOCALES) {
    const url = landingUrl(loc);
    const res = await request(app).get(pathOf(url));
    assert.equal(res.status, 200, url);
    const html = res.text;
    assert.equal(langOf(html), loc);
    assert.equal(unescapeHtml(titleOf(html) ?? ''), LANDING[loc].title);
    assert.equal(unescapeHtml(metaOf(html, 'description') ?? ''), LANDING[loc].description);
    assert.deepEqual(canonicalOf(html), [url], `${loc}: самореферентен canonical`);
    assert.equal(metaOf(html, 'robots'), 'index, follow, max-image-preview:large, max-snippet:-1');
    assert.equal(res.headers['x-robots-tag'], undefined);
    assert.ok(unescapeHtml(html).includes(`<h1>${LANDING[loc].h1}</h1>`), `${loc}: H1 на езика`);
    assert.ok(unescapeHtml(html).includes(LANDING[loc].lead), `${loc}: текст на езика`);
    // В езиковата версия няма абзаци на другите езици.
    assert.ok(!/<p lang=/.test(html), `${loc}: без смесени езици`);
    for (const other of LOCALES) {
      if (other !== loc) assert.ok(!unescapeHtml(html).includes(LANDING[other].lead), `${loc} съдържа текст на ${other}`);
    }
  }
});

test('hreflang: реципрочен клъстер (en/it/bg + x-default) към самоканоничните версии', async () => {
  const expected: Record<string, string> = {
    en: landingUrl('en'),
    it: landingUrl('it'),
    bg: landingUrl('bg'),
    'x-default': landingUrl('en'),
  };
  for (const loc of LOCALES) {
    const res = await request(app).get(pathOf(landingUrl(loc)));
    const cluster = hreflangOf(res.text);
    assert.deepEqual(cluster, expected, loc);
    // Всяка цел на hreflang е 200, индексируема и канонична сама на себе си.
    for (const target of Object.values(cluster)) {
      const t = await request(app).get(pathOf(target));
      assert.equal(t.status, 200);
      assert.deepEqual(canonicalOf(t.text), [target]);
      assert.deepEqual(hreflangOf(t.text), expected);
    }
  }
});

test('?lang=en, непознат ?lang и utm параметри → canonical към чистия адрес', async () => {
  assert.deepEqual(canonicalOf((await request(app).get('/?lang=en')).text), [landingUrl('en')]);
  assert.deepEqual(canonicalOf((await request(app).get('/?lang=xx')).text), [landingUrl('en')]);
  assert.deepEqual(canonicalOf((await request(app).get('/?lang=it&utm_source=x')).text), [landingUrl('it')]);
  assert.deepEqual(canonicalOf((await request(app).get('/?lang=it&lang=bg')).text), [landingUrl('en')]);
});

test('/login и /register: noindex, без canonical към `/`, без hreflang и JSON-LD', async () => {
  for (const p of ['/login', '/register']) {
    const res = await request(app).get(p);
    assert.equal(res.status, 200, p);
    assert.equal(metaOf(res.text, 'robots'), 'noindex', p);
    assert.equal(res.headers['x-robots-tag'], 'noindex', p);
    assert.deepEqual(canonicalOf(res.text), [], p);
    assert.deepEqual(hreflangOf(res.text), {}, p);
    assert.deepEqual(jsonLdOf(res.text), [], p);
    assert.ok(!res.text.includes('seo-bootstrap'), p);
  }
});

test('title и description са уникални за /, /?lang=it, /?lang=bg, /login, /register, /terms, /privacy', async () => {
  const paths = ['/', '/?lang=it', '/?lang=bg', '/login', '/register', '/terms', '/privacy'];
  const titles = new Set<string>();
  const descs = new Set<string>();
  for (const p of paths) {
    const html = (await request(app).get(p)).text;
    titles.add(titleOf(html) ?? '');
    descs.add(metaOf(html, 'description') ?? '');
  }
  assert.equal(titles.size, paths.length);
  assert.equal(descs.size, paths.length);
});

test('/terms и /privacy: индексируеми, самореферентен canonical', async () => {
  for (const p of ['/terms', '/privacy'] as const) {
    const res = await request(app).get(p);
    assert.equal(res.status, 200);
    assert.deepEqual(canonicalOf(res.text), [`${SITE_ORIGIN}${p}`]);
    assert.equal(metaOf(res.text, 'robots'), 'index, follow, max-image-preview:large, max-snippet:-1');
    assert.equal(unescapeHtml(titleOf(res.text) ?? ''), DOC_PAGES[p.slice(1) as 'terms' | 'privacy'].title);
  }
});

test('реалните игрови маршрути се сервират (noindex), включително дълбоки /app и /admin', async () => {
  for (const p of ['/app', '/app/', '/app/hunting', '/app/player/SomeHero', '/admin', '/admin/users', '/create', '/forgot', '/reset?token=abc', '/demo/combat?debug=1']) {
    const res = await request(app).get(p);
    assert.equal(res.status, 200, `${p} → ${res.status}`);
    assert.ok(res.text.includes('<div id="root"></div>'), p);
    assert.equal(metaOf(res.text, 'robots'), 'noindex', p);
    assert.equal(res.headers['x-robots-tag'], 'noindex', p);
    assert.deepEqual(canonicalOf(res.text), [], p);
  }
});

test('дубликати: /index.html и наклонена черта накрая → 301 към каноничния адрес', async () => {
  const idx = await request(app).get('/index.html?lang=it');
  assert.equal(idx.status, 301);
  assert.equal(idx.headers.location, '/?lang=it');
  const login = await request(app).get('/login/');
  assert.equal(login.status, 301);
  assert.equal(login.headers.location, '/login');
  const terms = await request(app).get('/terms/?x=1');
  assert.equal(terms.status, 301);
  assert.equal(terms.headers.location, '/terms?x=1');
  // Не е open redirect: непознат адрес с наклонена черта → 404.
  assert.equal((await request(app).get('//evil.example/')).status, 404);
  assert.equal((await request(app).get('/nope/')).status, 404);
});

test('sitemap.xml: точно каноничните индексируеми адреси, hreflang = този в <head>', async () => {
  const xml = fs.readFileSync(path.join(CLIENT, 'public', 'sitemap.xml'), 'utf8');
  const blocks = [...xml.matchAll(/<url>([\s\S]*?)<\/url>/g)].map((m) => m[1]);
  const locs = blocks.map((b) => (b.match(/<loc>([^<]+)<\/loc>/) as RegExpMatchArray)[1]);
  assert.deepEqual(locs, INDEXABLE_URLS);
  for (const [i, loc] of locs.entries()) {
    const res = await request(app).get(pathOf(loc));
    assert.equal(res.status, 200, loc);
    assert.deepEqual(canonicalOf(res.text), [loc], `${loc} трябва да е самоканоничен`);
    assert.ok(!/noindex/.test(metaOf(res.text, 'robots') ?? ''), `${loc} не трябва да е noindex`);
    const alt: Record<string, string> = {};
    for (const m of blocks[i].matchAll(/<xhtml:link rel="alternate" hreflang="([^"]+)" href="([^"]+)"/g)) alt[m[1]] = m[2];
    assert.deepEqual(alt, hreflangOf(res.text), `${loc}: hreflang в sitemap ≠ <head>`);
  }
});

test('robots.txt не блокира noindex страниците (иначе Google не вижда noindex)', () => {
  const robots = fs.readFileSync(path.join(CLIENT, 'public', 'robots.txt'), 'utf8');
  const disallows = [...robots.matchAll(/^Disallow:\s*(\S+)/gm)].map((m) => m[1]);
  for (const p of ['/login', '/register', '/', '/terms', '/privacy']) {
    assert.ok(!disallows.some((d) => p.startsWith(d) && d !== '/'), `${p} е блокиран от robots.txt`);
  }
});

test('JSON-LD: свързан граф с реални факти, без FAQPage (няма видим FAQ) и без измислени оценки', async () => {
  for (const loc of LOCALES) {
    const blocks = jsonLdOf((await request(app).get(pathOf(landingUrl(loc)))).text);
    assert.equal(blocks.length, 1);
    const graph: any[] = blocks[0]['@graph'];
    const types = graph.map((n) => n['@type']);
    assert.deepEqual(types.sort(), ['Organization', 'VideoGame', 'WebPage', 'WebSite']);
    const ids = new Set(graph.map((n) => n['@id']));
    const refs = JSON.stringify(graph).match(/"@id":"[^"]+"/g) ?? [];
    for (const r of refs) assert.ok(ids.has(r.slice(7, -1)), `висяща референция ${r}`);
    const game = graph.find((n) => n['@type'] === 'VideoGame');
    assert.equal(game.offers.price, '0');
    assert.equal(game.isAccessibleForFree, true);
    assert.equal(game.audience.suggestedMinAge, 14);
    assert.equal(game.description, LANDING[loc].lead);
    assert.equal(game.aggregateRating, undefined);
    assert.equal(game.review, undefined);
    const page = graph.find((n) => n['@type'] === 'WebPage');
    assert.equal(page.url, landingUrl(loc));
    assert.equal(page.inLanguage, loc);
    const org = graph.find((n) => n['@type'] === 'Organization');
    assert.equal(org.legalName, 'Carbon Stealth VCC');
  }
});

test('ключови думи: ≥5 на всяка страница, винаги „Carbon Stealth“', () => {
  const all = [...Object.values(LANDING), ...Object.values(DOC_PAGES), ...Object.values(UTILITY_PAGES)];
  for (const c of all) {
    assert.ok(c.keywords.length >= 5, c.title);
    assert.ok(c.keywords.includes('Carbon Stealth'), c.title);
  }
});

test('сървърните текстове съвпадат с клиентските локали (seo.* и notFound.*)', () => {
  for (const loc of LOCALES) {
    const messages = JSON.parse(fs.readFileSync(path.join(CLIENT, 'src', 'i18n', 'locales', `${loc}.json`), 'utf8'));
    assert.equal(messages.seo.landingTitle, LANDING[loc].title, `${loc}: seo.landingTitle`);
    assert.equal(messages.seo.landingDescription, LANDING[loc].description, `${loc}: seo.landingDescription`);
    assert.equal(messages.notFound.title, NOT_FOUND[loc].h1, `${loc}: notFound.title`);
    assert.equal(messages.notFound.body, NOT_FOUND[loc].body, `${loc}: notFound.body`);
    assert.equal(messages.landing.playFree, NOT_FOUND[loc].register, `${loc}: landing.playFree`);
    assert.equal(messages.nav.login, NOT_FOUND[loc].login, `${loc}: nav.login`);
  }
});
