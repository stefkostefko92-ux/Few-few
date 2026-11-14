// Инсталируемото приложение: манифест, service worker, иконите, страницата /app и връзките в <head>.
// Поведението на работника в браузъра (офлайн визитки, изчистване при изход) е проверено с
// Chromium при създаването му; тук се пази договорът по HTTP, който Chrome/Safari четат.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import { join } from 'node:path';

process.env.NODE_ENV = 'test';
process.env.DATA_DIR = fs.mkdtempSync(join(os.tmpdir(), 'vizitka-pwa-'));
process.env.PRINT_API_SECRET = 'test-print-secret-0123456789abcdef';

const { default: app } = await import('../src/app.js');
const { deviceOf, isSamsungInternet, openInChrome } = await import('../src/pwa.js');

const server = app.listen(0);
const base = `http://127.0.0.1:${server.address().port}`;

let failures = 0;
async function test(name, fn) {
  try {
    await fn();
    console.log(`✔ ${name}`);
  } catch (err) {
    failures++;
    console.error(`✘ ${name}\n  ${err.message}`);
  }
}

const UA = {
  iphone:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
  android:
    'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36',
  samsung:
    'Mozilla/5.0 (Linux; Android 14; SM-S921B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/26.0 Chrome/122.0.0.0 Mobile Safari/537.36',
  macSafari:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15',
  macChrome:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  windows:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0',
};

await test('манифест: инсталируем (име, start_url, standalone, икони 192/512 + maskable)', async () => {
  const res = await fetch(`${base}/manifest.webmanifest`);
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type'), /application\/manifest\+json/);
  assert.equal(res.headers.get('cache-control'), 'no-cache');
  const m = await res.json();
  assert.equal(m.short_name, 'Vizitka');
  assert.equal(m.lang, 'bg');
  assert.equal(m.start_url, '/dashboard');
  assert.equal(m.scope, '/');
  assert.equal(m.display, 'standalone');
  assert.match(m.theme_color, /^#[0-9a-f]{6}$/i);
  const sizes = (purpose) => m.icons.filter((i) => i.purpose === purpose).map((i) => i.sizes);
  assert.deepEqual(sizes('any'), ['192x192', '512x512']);
  assert.deepEqual(sizes('maskable'), ['192x192', '512x512']);
  assert.ok(m.shortcuts.length >= 1);
});

await test('всяка икона от манифеста е истински PNG с обявения размер', async () => {
  const m = await (await fetch(`${base}/manifest.webmanifest`)).json();
  const files = [
    ...m.icons.map((i) => [i.src, i.sizes]),
    ['/icons/apple-touch-icon.png', '180x180'],
  ];
  for (const [src, sizes] of files) {
    const res = await fetch(base + src);
    assert.equal(res.status, 200, src);
    const buf = Buffer.from(await res.arrayBuffer());
    assert.equal(buf.subarray(1, 4).toString('latin1'), 'PNG', src);
    const w = buf.readUInt32BE(16);
    const h = buf.readUInt32BE(20);
    assert.equal(`${w}x${h}`, sizes, src);
  }
});

await test('/sw.js: от корена, JavaScript, винаги наново (не 7-дневният кеш на статиката)', async () => {
  const res = await fetch(`${base}/sw.js`);
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type'), /javascript/);
  assert.equal(res.headers.get('cache-control'), 'no-cache');
  const src = await res.text();
  assert.match(src, /addEventListener\('fetch'/);
});

await test('работникът не кешира лични страници — само визитки, снимки и статика', async () => {
  const src = await (await fetch(`${base}/sw.js`)).text();
  for (const p of ['dashboard', 'settings', 'login', 'admin', 'profile'])
    assert.doesNotMatch(src, new RegExp(`CARD_PATH = .*${p}`), p);
  // Пази само в инсталираното приложение (ePrivacy): кешовете минават през isInstalled.
  assert.match(src, /isInstalled\(\)\.then\(\(yes\) => \(yes \? card\(request\)/);
  assert.match(src, /whenInstalled\(request, \(r\) => cacheFirst\(r, STATIC/);
  assert.match(src, /whenInstalled\(request, \(r\) => cacheFirst\(r, CARDS, PHOTO_PATH/);
  // Изходът и изтриването на акаунта изпразват запазеното.
  assert.match(src, /logout\|settings\\\/delete/);
});

await test('посетител на визитка: работникът не се регистрира (public/app.js)', async () => {
  const js = await (await fetch(`${base}/app.js`)).text();
  assert.match(js, /installed \|\| !\/\^\\\/p\\\/\/\.test\(location\.pathname\)/);
});

await test('<head> носи манифеста, цвета и иконата за iPhone на всяка страница', async () => {
  for (const path of ['/', '/login', '/privacy', '/app']) {
    const html = await (await fetch(base + path)).text();
    assert.match(html, /<link rel="manifest" href="\/manifest\.webmanifest">/, path);
    assert.match(html, /<meta name="theme-color" content="#2563eb">/, path);
    assert.match(html, /<link rel="apple-touch-icon" href="\/icons\/apple-touch-icon\.png">/, path);
  }
});

await test('/app: стъпките на устройството са отворени от сървъра, другите затворени', async () => {
  const open = async (ua) => {
    const html = await (await fetch(`${base}/app`, { headers: { 'user-agent': ua } })).text();
    return [...html.matchAll(/<details class="install-os" data-os="(\w+)"( open)?>/g)]
      .filter((m) => m[2])
      .map((m) => m[1]);
  };
  assert.deepEqual(await open(UA.iphone), ['ios']);
  assert.deepEqual(await open(UA.android), ['android']);
  assert.deepEqual(await open(UA.windows), ['pc']);
  assert.deepEqual(await open(UA.macSafari), ['mac']);
  assert.deepEqual(await open('curl/8'), ['ios', 'android', 'pc', 'mac']);
});

await test('/app: Samsung Internet → към Chrome; страницата е noindex и Vary: User-Agent', async () => {
  const res = await fetch(`${base}/app`, { headers: { 'user-agent': UA.samsung } });
  assert.match(res.headers.get('vary') || '', /User-Agent/i);
  const html = await res.text();
  assert.match(
    html,
    /href="intent:\/\/[^"]+\/app#Intent;scheme=http;package=com\.android\.chrome;end"/
  );
  assert.match(html, /<meta name="robots" content="noindex,nofollow">/);
  const other = await (
    await fetch(`${base}/app`, { headers: { 'user-agent': UA.android } })
  ).text();
  assert.doesNotMatch(other, /intent:\/\//);
});

await test('deviceOf/isSamsungInternet/openInChrome', () => {
  assert.equal(deviceOf(UA.iphone), 'ios');
  assert.equal(deviceOf(UA.android), 'android');
  assert.equal(deviceOf(UA.macSafari), 'mac');
  assert.equal(deviceOf(UA.macChrome), 'pc');
  assert.equal(deviceOf(UA.windows), 'pc');
  assert.equal(deviceOf(undefined), null);
  assert.equal(isSamsungInternet(UA.samsung), true);
  assert.equal(isSamsungInternet(UA.android), false);
  assert.equal(
    openInChrome('https://vizitka-bg.com', '/app'),
    'intent://vizitka-bg.com/app#Intent;scheme=https;package=com.android.chrome;end'
  );
});

server.close();
if (failures) {
  console.error(`\n${failures} провалени теста`);
  process.exit(1);
}
console.log('\nPWA: всички тестове минаха');
