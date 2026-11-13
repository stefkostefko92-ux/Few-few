import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import vm from 'node:vm';
import sharp from 'sharp';
import { ROOT } from '../src/paths.js';
import { translator } from '../src/i18n.js';
import { LEGAL_DOCUMENTS, LEGAL_DOCUMENT_IDS } from '../src/legal/documents.js';
import { llmsTxt, sitemapXml } from '../src/routes/seo.js';
import { ICONS, manifestFor, START_URL } from '../src/pwa/manifest.js';
import { deviceOf, isSamsungInternet, openInChromeUrl } from '../src/pwa/device.js';

const BASE = 'https://fakturist.carbonstealth.eu';
const read = (...parts: string[]) => readFileSync(join(ROOT, ...parts), 'utf8');

// --- SPEC 35: правните документи --------------------------------------------------------------------

test('правните документи: текст на двата езика, версия-дата, различни адреси', () => {
  const paths = new Set<string>();
  for (const id of LEGAL_DOCUMENT_IDS) {
    const doc = LEGAL_DOCUMENTS[id];
    // Идентификаторът е датата + „.N“ при втора промяна в същия ден; `date` — откога важи.
    assert.match(doc.version, /^\d{4}-\d{2}-\d{2}(\.\d{1,2})?$/, `${id}: версията е дата[.N]`);
    assert.match(doc.date, /^\d{4}-\d{2}-\d{2}$/, `${id}: датата е дата`);
    assert.ok(!Number.isNaN(Date.parse(doc.date)), `${id}: истинска дата`);
    assert.ok(doc.version.startsWith(doc.date), `${id}: версията започва с датата`);
    for (const locale of ['bg', 'en'] as const) {
      const body = read('views', 'legal', id, `${locale}.ejs`);
      assert.ok((body.match(/<h2/g) ?? []).length >= 5, `${id}/${locale}: поне 5 раздела`);
      assert.ok(!body.includes('<p>…</p>'), `${id}/${locale}: не е заместител`);
      paths.add(doc.paths[locale]);
    }
  }
  assert.equal(paths.size, LEGAL_DOCUMENT_IDS.length * 2);
});

test('правните документи: заглавие < 60, описание < 160, ключови думи ≥ 5 с „Carbon Stealth“', () => {
  for (const locale of ['bg', 'en'] as const) {
    const t = translator(locale);
    const keywords = t('legal.keywords')
      .split(',')
      .map((k) => k.trim());
    assert.ok(keywords.length >= 5 && keywords.includes('Carbon Stealth'), locale);
    for (const id of LEGAL_DOCUMENT_IDS) {
      assert.ok(t(`legal.${id}.metaTitle`).length < 60, `${locale}/${id} заглавие`);
      assert.ok(t(`legal.${id}.metaDescription`).length < 160, `${locale}/${id} описание`);
    }
  }
});

test('правните документи са в sitemap, llms.txt, двата футъра и отметката на регистрацията', () => {
  const xml = sitemapXml(BASE);
  const llms = llmsTxt(BASE);
  for (const id of LEGAL_DOCUMENT_IDS) {
    for (const path of Object.values(LEGAL_DOCUMENTS[id].paths)) {
      assert.ok(xml.includes(`<loc>${BASE}${path}</loc>`), `sitemap ${path}`);
      assert.ok(llms.includes(`${BASE}${path}`), `llms ${path}`);
    }
    for (const partial of ['site-foot.ejs', 'app-foot.ejs']) {
      assert.ok(
        read('views', 'partials', partial).includes(`legalUrl('${id}')`),
        `${partial}: ${id}`,
      );
    }
    assert.ok(read('views', 'partials', 'legal-accept.ejs').includes(`legalLink('${id}'`), id);
  }
  // Отметката никога не идва отметната.
  assert.ok(!/checked/.test(read('views', 'partials', 'legal-accept.ejs')));
});

// --- SPEC 39: приложението на началния екран -------------------------------------------------------

test('манифестът: имената, standalone, start_url, обхват и иконите на двата езика', () => {
  const bg = manifestFor('bg', 'v1');
  const en = manifestFor('en', 'v1');
  assert.equal(bg.name, 'Фактурист');
  assert.equal(en.name, 'Fakturist');
  for (const manifest of [bg, en]) {
    assert.equal(manifest.display, 'standalone');
    assert.equal(manifest.scope, '/');
    assert.equal(manifest.id, START_URL);
    assert.ok(manifest.start_url.startsWith(START_URL));
    assert.ok(manifest.short_name.length <= 12);
    const purposes = manifest.icons.map((icon) => `${icon.sizes}:${icon.purpose}`).sort();
    assert.deepEqual(purposes, [
      '192x192:any',
      '192x192:maskable',
      '512x512:any',
      '512x512:maskable',
    ]);
    for (const icon of manifest.icons) assert.ok(icon.src.endsWith('?v=v1'));
  }
});

test('иконите са в размера си; maskable и apple-touch са непрозрачни', async () => {
  const dir = join(ROOT, 'public', 'img', 'brand');
  for (const icon of ICONS) {
    const file = join(dir, `${icon.file}.png`);
    const meta = await sharp(file).metadata();
    assert.equal(meta.width, icon.size, icon.file);
    assert.equal(meta.height, icon.size, icon.file);
    if (icon.purpose === 'maskable') {
      assert.ok((await sharp(file).stats()).isOpaque, `${icon.file} е непрозрачна`);
    }
  }
  const apple = join(dir, 'apple-touch-icon.png');
  assert.equal((await sharp(apple).metadata()).width, 180);
  assert.ok((await sharp(apple).stats()).isOpaque);
  // Логото: светъл и тъмен вариант с прозрачност, в пропорцията на оригинала.
  for (const name of ['logo', 'logo-dark']) {
    const meta = await sharp(join(dir, `${name}.webp`)).metadata();
    assert.equal(meta.height, 128);
    assert.ok(meta.hasAlpha);
    assert.ok(Math.abs((meta.width ?? 0) / 128 - 1713 / 397) < 0.02, name);
  }
});

type Listener = (event: FakeEvent) => void;
interface FakeEvent {
  request?: { mode: string; method: string };
  respondWith?: (value: Promise<Response>) => void;
  waitUntil?: (value: unknown) => void;
}

/** Работникът в node:vm: само слушателите му, без мрежа и без кеш. */
function loadServiceWorker(language: string, fetchImpl: () => Promise<Response>) {
  const listeners = new Map<string, Listener>();
  const self = {
    navigator: { language },
    addEventListener: (type: string, listener: Listener) => listeners.set(type, listener),
    skipWaiting: () => undefined,
    clients: { claim: () => Promise.resolve() },
  };
  const context = vm.createContext({ self, fetch: fetchImpl, Response, caches: undefined });
  vm.runInContext(read('public', 'js', 'sw.js'), context);
  return listeners;
}

test('service worker-ът: пропуска POST и ресурсите, без мрежа — страница 503 no-store', async () => {
  const offline = () => Promise.reject(new TypeError('offline'));
  const listeners = loadServiceWorker('bg-BG', offline);
  const fetchListener = listeners.get('fetch');
  assert.ok(fetchListener);
  assert.ok(listeners.has('install') && listeners.has('activate'));

  for (const request of [
    { mode: 'navigate', method: 'POST' },
    { mode: 'no-cors', method: 'GET' },
    { mode: 'cors', method: 'GET' },
  ]) {
    let answered = false;
    fetchListener({ request, respondWith: () => (answered = true) });
    assert.equal(answered, false, `${request.mode} ${request.method}`);
  }

  let response: Promise<Response> | null = null;
  fetchListener({
    request: { mode: 'navigate', method: 'GET' },
    respondWith: (value) => (response = value),
  });
  assert.ok(response);
  const page = await (response as Promise<Response>);
  assert.equal(page.status, 503);
  assert.equal(page.headers.get('cache-control'), 'no-store');
  const html = await page.text();
  assert.ok(html.includes('<html lang="bg">') && html.includes('Няма връзка'));
  assert.ok(!html.includes('<script'));

  const english = loadServiceWorker('en-GB', offline).get('fetch');
  let englishResponse: Promise<Response> | null = null;
  english!({
    request: { mode: 'navigate', method: 'GET' },
    respondWith: (value) => (englishResponse = value),
  });
  assert.ok(
    (await (await (englishResponse as unknown as Promise<Response>)).text()).includes(
      'No connection',
    ),
  );
});

test('service worker-ът: с мрежа отговорът е на сървъра, непокътнат', async () => {
  const listeners = loadServiceWorker('bg', () =>
    Promise.resolve(new Response('сървърът', { status: 200 })),
  );
  let response: Promise<Response> | null = null;
  listeners.get('fetch')!({
    request: { mode: 'navigate', method: 'GET' },
    respondWith: (value) => (response = value),
  });
  const page = await (response as unknown as Promise<Response>);
  assert.equal(page.status, 200);
  assert.equal(await page.text(), 'сървърът');
});

test('устройството по User-Agent и пътят към Chrome', () => {
  const iphone =
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
  const android =
    'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36';
  const samsung =
    'Mozilla/5.0 (Linux; Android 14; SM-S921B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/26.0 Chrome/122.0 Mobile Safari/537.36';
  const macSafari =
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_6) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15';
  const macChrome =
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';
  const windows =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36 Edg/130.0';
  assert.equal(deviceOf(iphone), 'ios');
  assert.equal(deviceOf(android), 'android');
  assert.equal(deviceOf(macSafari), 'mac');
  assert.equal(deviceOf(macChrome), 'pc');
  assert.equal(deviceOf(windows), 'pc');
  assert.equal(deviceOf(undefined), null);
  assert.equal(deviceOf('curl/8.0'), null);
  assert.equal(isSamsungInternet(samsung), true);
  assert.equal(isSamsungInternet(android), false);
  assert.equal(
    openInChromeUrl(BASE, '/prilozhenie'),
    'intent://fakturist.carbonstealth.eu/prilozhenie#Intent;scheme=https;package=com.android.chrome;end',
  );
});
