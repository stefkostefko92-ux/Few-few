'use strict';
// Техническият SEO чеклист върху генерираните страници — това, което един външен одит проверява на
// живо (индексируемост, canonical, hreflang, заглавия, описания, H1, ключови думи, JSON-LD, снимки,
// sitemap), тук пада още преди комита. Страниците са тези от sitemap.xml: нова страница влиза сама.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const ORIGIN = 'https://panevascensori.it';
const sitemap = fs.readFileSync(path.join(ROOT, 'sitemap.xml'), 'utf8');
const locs = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
const htmlUrls = locs.filter((u) => !u.endsWith('.pdf'));

// Чист адрес → файлът, който сървърът сервира за него (server.js: /page → page.html, /dir/ → index.html).
function fileOf(url) {
  const p = url.slice(ORIGIN.length);
  return path.join(ROOT, p.endsWith('/') ? `${p}index.html` : `${p}.html`);
}
const unescape = (s) => s.replaceAll('&amp;', '&').replaceAll('&quot;', '"').replaceAll('&lt;', '<').replaceAll('&gt;', '>');
const pages = new Map(htmlUrls.map((url) => {
  const doc = fs.readFileSync(fileOf(url), 'utf8');
  const meta = (name) => unescape((doc.match(new RegExp(`<meta name="${name}" content="([^"]*)"`)) || [])[1] || '');
  return [url, {
    doc,
    lang: (doc.match(/<html lang="([^"]+)"/) || [])[1],
    title: unescape((doc.match(/<title>([^<]*)<\/title>/) || [])[1] || ''),
    description: meta('description'),
    keywords: meta('keywords').split(',').map((k) => k.trim()).filter(Boolean),
    robots: meta('robots'),
    canonical: (doc.match(/<link rel="canonical" href="([^"]+)"/) || [])[1],
    hreflang: Object.fromEntries([...doc.matchAll(/<link rel="alternate" hreflang="([^"]+)" href="([^"]+)"/g)].map((m) => [m[1], m[2]])),
    h1: [...doc.matchAll(/<h1[\s>]/g)].length,
    ld: [...doc.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => m[1]),
    imgs: [...doc.matchAll(/<img\b[^>]*>/g)].map((m) => m[0]),
  }];
}));

test('sitemap: всяка страница съществува, веднъж, и никоя не е noindex', () => {
  assert.ok(htmlUrls.length >= 39, `само ${htmlUrls.length} страници в sitemap.xml`);
  assert.equal(new Set(locs).size, locs.length, 'повторен адрес в sitemap.xml');
  for (const [url, p] of pages) {
    assert.match(p.robots, /^index, follow/, `${url}: robots = ${p.robots}`);
  }
});

test('canonical сочи самата страница, а hreflang е it/en/bg/x-default и е взаимен', () => {
  for (const [url, p] of pages) {
    assert.equal(p.canonical, url, `${url}: canonical`);
    assert.deepEqual(Object.keys(p.hreflang).sort(), ['bg', 'en', 'it', 'x-default'], `${url}: hreflang`);
    assert.equal(p.hreflang[p.lang], url, `${url}: hreflang за собствения език`);
    assert.equal(p.hreflang['x-default'], p.hreflang.it, `${url}: x-default е италианската`);
    for (const target of Object.values(p.hreflang)) {
      assert.ok(pages.has(target), `${url}: hreflang към страница извън sitemap-а: ${target}`);
      assert.deepEqual(pages.get(target).hreflang, p.hreflang, `${url} ↔ ${target}: hreflang не е взаимен`);
    }
  }
});

test('заглавие до 60 знака и описание 70–160, и двете уникални; точно един H1', () => {
  const titles = new Map();
  const descriptions = new Map();
  for (const [url, p] of pages) {
    assert.ok(p.title.length > 0 && p.title.length <= 60, `${url}: заглавие ${p.title.length} знака`);
    assert.ok(p.description.length >= 70 && p.description.length <= 160, `${url}: описание ${p.description.length} знака`);
    assert.equal(p.h1, 1, `${url}: ${p.h1} H1`);
    assert.ok(!titles.has(p.title), `${url}: заглавието се повтаря с ${titles.get(p.title)}`);
    assert.ok(!descriptions.has(p.description), `${url}: описанието се повтаря с ${descriptions.get(p.description)}`);
    titles.set(p.title, url);
    descriptions.set(p.description, url);
  }
});

test('ключови думи: поне 5, една от тях „Carbon Stealth“', () => {
  for (const [url, p] of pages) {
    assert.ok(p.keywords.length >= 5, `${url}: ${p.keywords.length} ключови думи`);
    assert.ok(p.keywords.includes('Carbon Stealth'), `${url}: липсва „Carbon Stealth“`);
  }
});

test('JSON-LD се разчита и носи Organization, WebSite и WebPage; без началната — и BreadcrumbList', () => {
  for (const [url, p] of pages) {
    assert.ok(p.ld.length >= 1, `${url}: няма JSON-LD`);
    const types = new Set();
    for (const block of p.ld) {
      const walk = (o) => {
        if (Array.isArray(o)) return o.forEach(walk);
        if (o && typeof o === 'object') {
          for (const t of [].concat(o['@type'] || [])) types.add(t);
          Object.values(o).forEach(walk);
        }
      };
      walk(JSON.parse(block));
    }
    for (const need of ['Organization', 'WebSite', 'WebPage']) assert.ok(types.has(need), `${url}: липсва ${need}`);
    if (new URL(url).pathname.replace(/^\/(en|bg)\//, '/') !== '/') assert.ok(types.has('BreadcrumbList'), `${url}: липсва BreadcrumbList`);
  }
});

test('всяка снимка има alt, ширина и височина', () => {
  for (const [url, p] of pages) {
    for (const img of p.imgs) {
      assert.match(img, /\balt="[^"]+"/, `${url}: снимка без alt: ${img.slice(0, 90)}`);
      assert.match(img, /\bwidth="\d+"/, `${url}: снимка без width: ${img.slice(0, 90)}`);
      assert.match(img, /\bheight="\d+"/, `${url}: снимка без height: ${img.slice(0, 90)}`);
    }
  }
});

test('задълбочените страници: FAQ на патента, FAQ и шестте стъпки (HowTo) на „неравни зидарии“', () => {
  const graph = (url) => JSON.parse(pages.get(url).ld[0])['@graph'];
  const byLang = { it: ['/brevetto', '/staffe-murature-irregolari'], en: ['/en/patent', '/en/brackets-for-uneven-walls'], bg: ['/bg/patent', '/bg/planki-za-neravni-steni'] };
  for (const [patent, walls] of Object.values(byLang)) {
    const faq = graph(ORIGIN + patent).find((n) => n['@type'] === 'FAQPage');
    assert.equal(faq.mainEntity.length, 4, `${patent}: въпросите за патента`);
    assert.ok(pages.get(ORIGIN + patent).doc.includes('202023000002112'), `${patent}: номерът на патента`);
    const howTo = graph(ORIGIN + walls).find((n) => n['@type'] === 'HowTo');
    assert.equal(howTo.step.length, 6, `${walls}: стъпките на монтажа`);
    assert.equal(howTo.tool.length, 3, `${walls}: инструментите`);
    assert.deepEqual(howTo.step.map((s) => s.position), [1, 2, 3, 4, 5, 6]);
  }
});
