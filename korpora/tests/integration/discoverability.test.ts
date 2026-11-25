import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { BASE, startApp, stopApp } from './harness.js';
import { graph, ofType } from './json-ld.js';

before(startApp);
after(stopApp);

const { COMPANY } = await import('../../src/company.js');
const { translate } = await import('../../src/i18n.js');
const { formatMoney, priceTable } = await import('../../src/plans/pricing.js');

const get = (path: string) => fetch(`${BASE}${path}`);
const html = async (path: string) => (await get(path)).text();
const LANDINGS = [
  ['bg', '/'],
  ['en', '/en/'],
  ['it', '/it/'],
] as const;

/** Както `<%= %>` в EJS: видимият текст се сравнява с низовете от JSON-LD. */
const ENTITIES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&#34;',
  "'": '&#39;',
};
const esc = (text: string) => text.replace(/[&<>"']/g, (c) => ENTITIES[c] ?? c);

/** Ширина и височина от IHDR на PNG. */
function pngSize(buf: Buffer): string {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  assert.ok(buf.subarray(0, 8).equals(signature), 'PNG signature');
  assert.equal(buf.toString('latin1', 12, 16), 'IHDR');
  return `${buf.readUInt32BE(16)}x${buf.readUInt32BE(20)}`;
}

const bytes = async (path: string) => {
  const res = await get(path);
  assert.equal(res.status, 200, path);
  return { res, buf: Buffer.from(await res.arrayBuffer()) };
};

test('the raster icons are real ICO and PNG files in the sizes they declare', async () => {
  const ico = await bytes('/favicon.ico');
  assert.equal(ico.res.headers.get('content-type'), 'image/x-icon');
  assert.deepEqual([ico.buf.readUInt16LE(0), ico.buf.readUInt16LE(2)], [0, 1], 'ICO header');
  const sizes: number[] = [];
  for (let i = 0; i < ico.buf.readUInt16LE(4); i++) {
    const entry = 6 + i * 16;
    const size = ico.buf.readUInt8(entry) || 256;
    const start = ico.buf.readUInt32LE(entry + 12);
    const png = ico.buf.subarray(start, start + ico.buf.readUInt32LE(entry + 8));
    assert.equal(pngSize(png), `${size}x${size}`, `ICO entry ${size}`);
    sizes.push(size);
  }
  // браузърите взимат 16 и 32; иконата над 48×48 за Google Search е отделният PNG (192), а не запис в ICO
  assert.deepEqual(sizes, [16, 32, 48]);

  const touch = await bytes('/apple-touch-icon.png');
  assert.equal(touch.res.headers.get('content-type'), 'image/png');
  assert.equal(pngSize(touch.buf), '180x180');

  const manifest = await get('/site.webmanifest');
  assert.match(manifest.headers.get('content-type') ?? '', /^application\/manifest\+json/);
  const { name, icons } = (await manifest.json()) as {
    name: string;
    icons: Array<{ src: string; sizes: string; type: string }>;
  };
  assert.equal(name, 'Korpora');
  assert.deepEqual(
    icons.map((icon) => icon.sizes),
    ['192x192', '512x512'],
  );
  for (const icon of icons) {
    const file = await bytes(icon.src);
    assert.equal(file.res.headers.get('content-type'), icon.type, icon.src);
    assert.equal(pngSize(file.buf), icon.sizes, icon.src);
  }
});

test('every page links the icons, the manifest and its logo, and the links resolve', async () => {
  for (const path of ['/', '/en/terms', '/it/privacy', '/login']) {
    const page = await html(path);
    const head = /<head>([\s\S]*?)<\/head>/.exec(page)?.[1] ?? '';
    for (const link of [
      '<link rel="icon" href="/favicon.ico" sizes="16x16 32x32 48x48">',
      '<link rel="apple-touch-icon" href="/apple-touch-icon.png">',
      '<link rel="manifest" href="/site.webmanifest">',
    ])
      assert.ok(head.includes(link), `${path}: ${link}`);
    const png = /<link rel="icon" type="image\/png" sizes="192x192" href="([^"]+)">/.exec(
      head,
    )?.[1];
    assert.ok(png, `${path}: the 192 px icon`);
    assert.equal(pngSize((await bytes(png)).buf), '192x192', png);
    // the logo in the top bar: every width of its srcset is a real WebP
    const srcset = /<img class="logo"[^>]* srcset="([^"]+)"/.exec(page)?.[1];
    assert.ok(srcset, `${path}: logo`);
    for (const url of srcset.split(',').map((entry) => entry.trim().split(' ')[0] ?? '')) {
      const res = await get(url);
      assert.equal(res.status, 200, url);
      assert.equal(res.headers.get('content-type'), 'image/webp', url);
    }
  }
});

test('the legal pages show the breadcrumb trail that their JSON-LD describes', async () => {
  for (const [locale, home] of LANDINGS) {
    for (const page of ['terms', 'privacy'] as const) {
      const path = locale === 'bg' ? `/${page}` : `/${locale}/${page}`;
      const body = await html(path);
      const title = translate(locale, page === 'terms' ? 'legal.termsTitle' : 'legal.privacyTitle');
      const nav = /<nav class="crumbs" aria-label="([^"]+)">([\s\S]*?)<\/nav>/.exec(body);
      assert.ok(nav, `${path}: crumbs`);
      const [, label, trail = ''] = nav;
      assert.equal(label, esc(translate(locale, 'legal.crumbs')));
      assert.ok(trail.includes(`<a href="${home}">Korpora</a>`), `${path}: link to the home page`);
      assert.ok(trail.includes(`<span aria-current="page">${esc(title)}</span>`), path);
      assert.ok(body.includes(`<h1>${esc(title)}</h1>`), `${path}: the last crumb is the heading`);
      const crumbs = ofType(graph(body), 'BreadcrumbList').itemListElement as Array<{
        name: string;
        item: string;
      }>;
      assert.deepEqual(
        crumbs.map((crumb) => [crumb.name, crumb.item]),
        [
          ['Korpora', `${BASE}${home}`],
          [title, `${BASE}${path}`],
        ],
        path,
      );
    }
  }
});

test('HowTo repeats the visible steps word for word, each with its own anchor', async () => {
  for (const [locale, path] of LANDINGS) {
    const body = await html(path);
    const howTo = ofType(graph(body), 'HowTo');
    assert.equal(howTo.name, translate(locale, 'landing.how.title'));
    assert.ok(body.includes(`<h2 id="how-title">${esc(String(howTo.name))}</h2>`), path);
    assert.ok(body.includes(`<p class="band-lead">${esc(String(howTo.description))}</p>`), path);
    const steps = howTo.step as Array<{
      position: number;
      name: string;
      text: string;
      url: string;
    }>;
    assert.deepEqual(
      steps.map((step) => step.position),
      [1, 2, 3, 4],
    );
    for (const step of steps) {
      assert.equal(step.url, `${BASE}${path}#how-${step.position}`);
      const li = new RegExp(`<li id="how-${step.position}"(?: [^>]*)?>([\\s\\S]*?)</li>`).exec(
        body,
      )?.[1];
      assert.ok(li, `${path}: anchor how-${step.position}`);
      assert.ok(li.includes(`<h3>${esc(step.name)}</h3>`), `${path}: step ${step.position} name`);
      assert.ok(li.includes(`<p>${esc(step.text)}</p>`), `${path}: step ${step.position} text`);
    }
  }
});

test('LocalBusiness is the one company node, with the geo of the meta tags and the range of the price list', async () => {
  const gross = priceTable().map((row) => row.totalWithVatCents);
  for (const [locale, path] of [...LANDINGS, ['it', '/it/terms'] as const]) {
    const body = await html(path);
    const nodes = graph(body);
    const companies = nodes.filter((node) => [node['@type']].flat().includes('Organization'));
    assert.equal(companies.length, 1, `${path}: one node for the company`);
    const org = ofType(nodes, 'LocalBusiness');
    assert.equal(org, companies[0]);
    assert.equal(org['@id'], `${COMPANY.url}/#org`);
    const geo = org.geo as { '@type': string; latitude: number; longitude: number };
    assert.deepEqual(
      [geo['@type'], geo.latitude, geo.longitude],
      ['GeoCoordinates', COMPANY.geo.latitude, COMPANY.geo.longitude],
    );
    assert.ok(
      body.includes(`<meta name="geo.position" content="${geo.latitude};${geo.longitude}">`),
      `${path}: the same point as geo.position`,
    );
    assert.equal(
      org.priceRange,
      `${formatMoney(Math.min(...gross), locale)} – ${formatMoney(Math.max(...gross), locale)}`,
    );
    assert.ok(String(org.priceRange).length < 100, 'Google: priceRange under 100 characters');
    assert.deepEqual(org.areaServed, {
      '@type': 'Place',
      name: translate(locale, 'company.areaServed'),
    });
    assert.equal(org.telephone, COMPANY.phone);
    assert.equal(org.openingHoursSpecification, undefined, 'no opening hours were announced');
    const address = org.address as Record<string, string>;
    assert.deepEqual(
      [address.streetAddress, address.addressLocality, address.postalCode, address.addressCountry],
      [
        translate(locale, 'company.street'),
        translate(locale, 'company.city'),
        COMPANY.postalCode,
        COMPANY.country,
      ],
    );
  }
  // от месечния план до Lifetime, с ДДС — промяна в ценоразписа се вижда тук
  assert.match(
    String(ofType(graph(await html('/')), 'LocalBusiness').priceRange),
    /^30\s€ – 900\s€$/,
  );
});

test('the company node says what it knows about and carries the Korpora brand with its logo', async () => {
  for (const [locale, path] of [...LANDINGS, ['en', '/en/privacy'] as const]) {
    const org = ofType(graph(await html(path)), 'Organization');
    const topics = org.knowsAbout as string[];
    assert.ok(Array.isArray(topics) && topics.length >= 5, `${path}: knowsAbout`);
    assert.deepEqual(
      topics,
      translate(locale, 'company.knowsAbout')
        .split(',')
        .map((topic) => topic.trim()),
      `${path}: in the language of the page`,
    );
    const brand = org.brand as Record<string, string>;
    assert.deepEqual(
      [brand['@type'], brand.name, brand.logo],
      ['Brand', 'Korpora', `${BASE}/static/img/brand/logo.png`],
      path,
    );
    // only the profiles the owner named
    assert.deepEqual(
      org.sameAs,
      ['https://www.youtube.com/@CarbonStealth', 'https://www.tiktok.com/@zerofucksgiiven'],
      `${path}: sameAs`,
    );
  }
  const logo = await get('/static/img/brand/logo.png');
  assert.equal(logo.status, 200);
  assert.equal(logo.headers.get('content-type'), 'image/png');
});

test('Speakable points at text that is on the page', async () => {
  for (const [, path] of LANDINGS) {
    const body = await html(path);
    const speakable = ofType(graph(body), 'WebPage').speakable as { cssSelector: string[] };
    assert.ok(speakable.cssSelector.length > 0);
    for (const selector of speakable.cssSelector) {
      assert.match(selector, /^\.[a-z-]+$/, 'a class selector');
      const text = new RegExp(`<p class="${selector.slice(1)}">([^<]+)</p>`).exec(body)?.[1];
      assert.ok(text && text.trim().length > 20, `${path}: ${selector} has text`);
    }
  }
});

test('the product node points at the Korpora logo and a picture of the program, and both resolve', async () => {
  for (const [, path] of LANDINGS) {
    const app = ofType(graph(await html(path)), 'SoftwareApplication');
    for (const [key, type] of [
      ['image', 'image/png'],
      ['screenshot', 'image/webp'],
    ] as const) {
      const url = String(app[key] ?? '');
      assert.ok(url.startsWith(`${BASE}/static/img/`), `${path}: ${key} ${url}`);
      const res = await fetch(url);
      assert.equal(res.status, 200, url);
      assert.equal(res.headers.get('content-type'), type, url);
    }
  }
});
