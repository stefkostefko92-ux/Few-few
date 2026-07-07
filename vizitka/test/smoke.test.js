// Smoke тест — пълният поток: регистрация → редакция → публична визитка → QR → vCard.
// Стартира приложението на случаен порт с временна база (DATA_DIR).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import { join } from 'node:path';

process.env.NODE_ENV = 'test';
process.env.DATA_DIR = fs.mkdtempSync(join(os.tmpdir(), 'vizitka-test-'));

const { default: app } = await import('../src/app.js');

const server = app.listen(0);
const port = server.address().port;
const base = `http://127.0.0.1:${port}`;

// Мини клиент с бисквитки (fetch не пази cookies сам).
const jar = new Map();
async function request(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (jar.size) headers.cookie = [...jar.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
  const res = await fetch(base + path, { ...options, headers, redirect: 'manual' });
  for (const raw of res.headers.getSetCookie?.() || []) {
    const [pair] = raw.split(';');
    const [name, value] = pair.split('=');
    if (value) jar.set(name.trim(), value.trim());
    else jar.delete(name.trim());
  }
  return res;
}

const form = (data) => new URLSearchParams(data).toString();
const FORM_HEADERS = { 'content-type': 'application/x-www-form-urlencoded' };

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

await test('началната страница се зарежда', async () => {
  const res = await request('/');
  assert.equal(res.status, 200);
  assert.match(await res.text(), /Винаги актуална/);
});

await test('регистрацията създава акаунт и профил', async () => {
  const res = await request('/register', {
    method: 'POST',
    headers: FORM_HEADERS,
    body: form({
      name: 'Иван Тестов',
      email: 'ivan@example.com',
      password: 'tainaparola1',
      type: 'personal',
    }),
  });
  assert.equal(res.status, 302);
  assert.equal(res.headers.get('location'), '/dashboard');
});

let csrf = '';
let slug = '';
await test('таблото се отваря след вход', async () => {
  const res = await request('/dashboard');
  assert.equal(res.status, 200);
  const html = await res.text();
  csrf = html.match(/name="_csrf" value="([a-f0-9]+)"/)?.[1] || '';
  slug = html.match(/name="slug"[^>]*value="([^"]+)"/)?.[1] || '';
  assert.ok(csrf, 'липсва CSRF токен');
  assert.equal(slug, 'ivan-testov');
});

await test('новият профил е скрит по подразбиране (privacy-by-default)', async () => {
  const ownerJar = new Map(jar);
  jar.clear();
  const anonView = await request('/p/ivan-testov');
  assert.equal(anonView.status, 404, 'нов профил не трябва да е публичен без избор');
  for (const [k, v] of ownerJar) jar.set(k, v);
});

await test('редакцията на профила записва данните', async () => {
  const res = await request('/profile', {
    method: 'POST',
    headers: FORM_HEADERS,
    body: form({
      _csrf: csrf,
      display_name: 'Иван Тестов',
      headline: 'Електротехник',
      phone: '+359 888 123 456',
      contact_email: 'ivan@example.com',
      website: 'https://example.com',
      slug: 'ivan-testov',
      type: 'personal',
      is_public: '1',
      bio: 'Тестово описание.',
    }),
  });
  assert.equal(res.status, 302);
});

await test('POST без CSRF токен се отхвърля', async () => {
  const res = await request('/profile', {
    method: 'POST',
    headers: FORM_HEADERS,
    body: form({ display_name: 'Хакер', slug: 'ivan-testov', type: 'personal' }),
  });
  assert.equal(res.status, 403);
});

await test('публичната визитка се вижда', async () => {
  const res = await request('/p/ivan-testov');
  assert.equal(res.status, 200);
  const html = await res.text();
  assert.match(html, /Иван Тестов/);
  assert.match(html, /Електротехник/);
  assert.match(html, /Запази контакта/);
});

await test('смяната на тема се отразява на визитката', async () => {
  const res = await request('/profile', {
    method: 'POST',
    headers: FORM_HEADERS,
    body: form({
      _csrf: csrf,
      display_name: 'Иван Тестов',
      headline: 'Електротехник',
      phone: '+359 888 123 456',
      contact_email: 'ivan@example.com',
      website: 'https://example.com',
      slug: 'ivan-testov',
      type: 'personal',
      is_public: '1',
      theme: 'sunset',
      bio: 'Тестово описание.',
    }),
  });
  assert.equal(res.status, 302);
  const card = await request('/p/ivan-testov');
  assert.match(await card.text(), /theme-sunset/);
});

await test('преглежданията се броят само за чужди посещения', async () => {
  const before = Number(
    (await (await request('/dashboard')).text()).match(/class="stat-number">(\d+)</)?.[1]
  );
  await request('/p/ivan-testov'); // собственикът — не се брои
  const ownerJar = new Map(jar);
  jar.clear();
  await request('/p/ivan-testov'); // анонимен — брои се
  jar.clear();
  for (const [k, v] of ownerJar) jar.set(k, v);
  const after = Number(
    (await (await request('/dashboard')).text()).match(/class="stat-number">(\d+)</)?.[1]
  );
  assert.equal(after, before + 1);
});

await test('правни страници, robots и sitemap отговарят', async () => {
  for (const path of ['/privacy', '/terms']) {
    const res = await request(path);
    assert.equal(res.status, 200, path);
  }
  const robots = await request('/robots.txt');
  assert.equal(robots.status, 200);
  assert.match(await robots.text(), /Disallow: \/dashboard/);
  const sitemap = await request('/sitemap.xml');
  assert.equal(sitemap.status, 200);
  assert.match(await sitemap.text(), /ivan-testov/);
  const llms = await request('/llms.txt');
  assert.equal(llms.status, 200);
  assert.match(await llms.text(), /Vizitka/);
});

await test('canonical и OG тагове присъстват', async () => {
  const home = await (await request('/')).text();
  assert.match(home, /<link rel="canonical"/);
  assert.match(home, /property="og:site_name" content="Vizitka"/);
  assert.match(home, /Често задавани въпроси/);
  const card = await (await request('/p/ivan-testov')).text();
  assert.match(card, /BreadcrumbList/);
  assert.match(card, /Подай сигнал/);
});

await test('QR кодът е валиден PNG', async () => {
  const res = await request('/p/ivan-testov/qr.png');
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('content-type'), 'image/png');
  const buf = Buffer.from(await res.arrayBuffer());
  assert.equal(buf.subarray(1, 4).toString(), 'PNG');
});

await test('vCard файлът съдържа контактите', async () => {
  const res = await request('/p/ivan-testov/vizitka.vcf');
  assert.equal(res.status, 200);
  const vcf = await res.text();
  assert.match(vcf, /BEGIN:VCARD/);
  assert.match(vcf, /FN:Иван Тестов/);
  assert.match(vcf, /TEL;TYPE=CELL:\+359 888 123 456/);
  assert.match(vcf, /END:VCARD/);
});

await test('скритата визитка връща 404 за чужди', async () => {
  await request('/profile', {
    method: 'POST',
    headers: FORM_HEADERS,
    body: form({
      _csrf: csrf,
      display_name: 'Иван Тестов',
      slug: 'ivan-testov',
      type: 'personal',
      // is_public не се подава → скрита
    }),
  });
  const ownerView = await request('/p/ivan-testov');
  assert.equal(ownerView.status, 200, 'собственикът трябва да вижда скритата визитка');
  const anonJar = new Map(jar);
  jar.clear();
  const anonView = await request('/p/ivan-testov');
  assert.equal(anonView.status, 404);
  for (const [k, v] of anonJar) jar.set(k, v);
});

await test('грешна парола не влиза', async () => {
  jar.clear();
  const res = await request('/login', {
    method: 'POST',
    headers: FORM_HEADERS,
    body: form({ email: 'ivan@example.com', password: 'greshna-parola' }),
  });
  assert.equal(res.status, 401);
});

await test('вход с вярна парола работи', async () => {
  const res = await request('/login', {
    method: 'POST',
    headers: FORM_HEADERS,
    body: form({ email: 'ivan@example.com', password: 'tainaparola1' }),
  });
  assert.equal(res.status, 302);
  assert.equal(res.headers.get('location'), '/dashboard');
});

await test('смяна на парола + вход с новата', async () => {
  const html = await (await request('/dashboard')).text();
  const freshCsrf = html.match(/name="_csrf" value="([a-f0-9]+)"/)?.[1] || '';
  const change = await request('/settings/password', {
    method: 'POST',
    headers: FORM_HEADERS,
    body: form({
      _csrf: freshCsrf,
      current_password: 'tainaparola1',
      new_password: 'novaparola22',
    }),
  });
  assert.equal(change.status, 302);
  jar.clear();
  const oldPw = await request('/login', {
    method: 'POST',
    headers: FORM_HEADERS,
    body: form({ email: 'ivan@example.com', password: 'tainaparola1' }),
  });
  assert.equal(oldPw.status, 401, 'старата парола не трябва да работи');
  const newPw = await request('/login', {
    method: 'POST',
    headers: FORM_HEADERS,
    body: form({ email: 'ivan@example.com', password: 'novaparola22' }),
  });
  assert.equal(newPw.status, 302);
});

server.close();
fs.rmSync(process.env.DATA_DIR, { recursive: true, force: true });

if (failures) {
  console.error(`\n${failures} провалени теста`);
  process.exit(1);
}
console.log('\nВсички smoke тестове минаха.');
