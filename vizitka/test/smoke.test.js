// Smoke тест — пълният поток: регистрация → редакция → публична визитка → QR → vCard.
// Стартира приложението на случаен порт с временна база (DATA_DIR).
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

process.env.NODE_ENV = 'test';
process.env.DATA_DIR = fs.mkdtempSync(join(os.tmpdir(), 'vizitka-test-'));
process.env.ADMIN_EMAILS = 'admin@example.com';
process.env.MASTILKO_URL = 'https://mastilko-bg.com';
process.env.PRINT_API_SECRET = 'test-print-secret';
process.env.INDEXNOW_KEY = 'testindexnowkey1234567890abcdef0';
// Целият пакет удря от 127.0.0.1 — вдигаме тавана, за да не се самоограничи.
// Самият лимит се проверява отделно, с нарочно IP (виж теста по-долу).
process.env.AUTH_RATE_LIMIT = '60';

const { default: app } = await import('../src/app.js');
const { outbox } = await import('../src/mailer.js');
const { default: db } = await import('../src/db.js');

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

await test('чужд сайт не може да ни вкара в акаунт (принудителен вход)', async () => {
  const foreign = await fetch(`${base}/login`, {
    method: 'POST',
    headers: { ...FORM_HEADERS, origin: 'https://evil.example' },
    redirect: 'manual',
    body: form({ email: 'ivan@example.com', password: 'tainaparola1' }),
  });
  assert.equal(foreign.status, 403, 'POST от чужд Origin трябва да се отхвърли');
  assert.ok(
    !(foreign.headers.getSetCookie?.() || []).some((c) => /vz_sid=/.test(c)),
    'не бива да се издава сесия'
  );
  // Същата форма от нашия сайт продължава да работи.
  const own = await fetch(`${base}/login`, {
    method: 'POST',
    headers: { ...FORM_HEADERS, origin: base },
    redirect: 'manual',
    body: form({ email: 'ivan@example.com', password: 'tainaparola1' }),
  });
  assert.equal(own.status, 302);
});

await test('твърде голямо тяло дава 413, без тялото да влиза в лога', async () => {
  const many = {};
  for (let i = 0; i < 200; i += 1) many[`pad${i}`] = '1';
  const res = await fetch(`${base}/login`, {
    method: 'POST',
    headers: { ...FORM_HEADERS, origin: base },
    redirect: 'manual',
    body: form({ email: 'ivan@example.com', password: 'tainaparola1', ...many }),
  });
  assert.equal(res.status, 413, 'очаква се 413, не 500');
});

await test('невалидна връзка не изтрива останалите редакции по бутоните', async () => {
  // Потребителят преименува съществуваща връзка И бърка втора — формата трябва да
  // върне НАПИСАНОТО, а не старите стойности от базата.
  const res = await request('/profile', {
    method: 'POST',
    headers: FORM_HEADERS,
    body: form({
      _csrf: csrf,
      display_name: 'Иван Тестов',
      slug: 'ivan-testov',
      type: 'personal',
      is_public: '1',
      theme: 'sunset',
      link_label_0: 'НОВО-ИМЕ',
      link_url_0: 'https://novo.example.com',
      link_label_1: 'Лошо',
      link_url_1: 'javascript:alert(1)',
    }),
  });
  assert.equal(res.status, 400);
  const html = await res.text();
  assert.match(html, /http:\/\/ или https:\/\//, 'трябва да обясни какво е сбъркано');
  assert.match(html, /НОВО-ИМЕ/, 'написаното от потребителя трябва да остане във формата');
});

await test('качване (unit): форматът се познава по байтове, не по Content-Type', async () => {
  const { sniffImage, prepareUpload } = await import('../src/images.js');
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
  const jpg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(8)]);
  const webp = Buffer.concat([
    Buffer.from('RIFF'),
    Buffer.alloc(4),
    Buffer.from('WEBP'),
    Buffer.alloc(4),
  ]);
  assert.equal(sniffImage(png), 'png');
  assert.equal(sniffImage(jpg), 'jpg');
  assert.equal(sniffImage(webp), 'webp');
  // HTML, представен като снимка — точно това минаваше преди.
  const evil = Buffer.from('<html><script>alert(1)</script></html>');
  assert.equal(sniffImage(evil), null);
  assert.equal(prepareUpload(evil), null);
});

await test('качване (unit): EXIF/GPS се премахва от JPEG', async () => {
  const { stripMetadata } = await import('../src/images.js');
  // Минимален JPEG: SOI + APP1 (EXIF с „GPS“) + SOS + данни + EOI.
  const exifPayload = Buffer.from('Exif\0\0GPSLatitude 42.123 GPSLongitude 23.456');
  const app1 = Buffer.concat([
    Buffer.from([0xff, 0xe1]),
    (() => {
      const b = Buffer.alloc(2);
      b.writeUInt16BE(exifPayload.length + 2);
      return b;
    })(),
    exifPayload,
  ]);
  const jpeg = Buffer.concat([
    Buffer.from([0xff, 0xd8]),
    app1,
    Buffer.from([0xff, 0xda, 0x00, 0x02]),
    Buffer.from([0x11, 0x22, 0x33]),
    Buffer.from([0xff, 0xd9]),
  ]);
  assert.ok(jpeg.includes('GPSLatitude'), 'подготвеният файл трябва да носи GPS');
  const clean = stripMetadata(jpeg, 'jpg');
  assert.ok(!clean.includes('GPSLatitude'), 'GPS координатите трябва да са премахнати');
  assert.equal(clean[0], 0xff);
  assert.equal(clean[1], 0xd8, 'файлът трябва да остане валиден JPEG');
  assert.ok(clean.includes(Buffer.from([0x11, 0x22, 0x33])), 'самото изображение остава');
});

await test('rate limit-ът спира заливане с опити', async () => {
  // Нарочно IP (app-ът е с trust proxy 1), за да не изчерпим тавана на пакета.
  const ip = '203.0.113.7';
  let blocked = 0;
  for (let i = 0; i < 70; i += 1) {
    const res = await fetch(`${base}/forgot`, {
      method: 'POST',
      headers: { ...FORM_HEADERS, origin: base, 'x-forwarded-for': ip },
      redirect: 'manual',
      body: form({ email: `nikoi${i}@example.com` }),
    });
    if (res.status === 429) blocked += 1;
  }
  assert.ok(blocked > 0, `след тавана трябва да има 429, а нямаше нито един`);
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

await test('launch SEO: GEO схема, robots disallows, IndexNow ключ', async () => {
  const home = await (await request('/')).text();
  assert.match(home, /LocalBusiness/); // Organization+LocalBusiness за Бобов дол
  assert.match(home, /Бобов дол/);
  assert.match(home, /GeoCoordinates/);
  assert.match(home, /WebApplication/);
  assert.match(home, /max-image-preview:large/);
  const robots = await (await request('/robots.txt')).text();
  assert.match(robots, /Disallow: \/api\//);
  assert.match(robots, /Disallow: \/p\/\*\/print/);
  // IndexNow ключов файл се сервира
  const key = await request('/testindexnowkey1234567890abcdef0.txt');
  assert.equal(key.status, 200);
  assert.equal((await key.text()).trim(), 'testindexnowkey1234567890abcdef0');
});

await test('launch правно: политиката разкрива mastilko и IndexNow', async () => {
  const priv = await (await request('/privacy')).text();
  assert.match(priv, /mastilko-bg\.com/);
  assert.match(priv, /IndexNow/);
  assert.match(priv, /коричен образ/);
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

await test('персонализация: собствен цвят, форма, шрифт и бутони', async () => {
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
      accent: '#ff8800',
      avatar_shape: 'square',
      font: 'serif',
      link_icon_0: '💬',
      link_label_0: 'WhatsApp',
      link_url_0: 'https://wa.me/359888123456',
      link_icon_1: '',
      link_label_1: 'Меню',
      link_url_1: 'https://example.com/menu',
    }),
  });
  assert.equal(res.status, 302);
  const card = await (await request('/p/ivan-testov')).text();
  assert.match(card, /custom-accent/);
  assert.match(card, /#ff8800/); // нонсиран стил с цвета
  assert.match(card, /shape-square/);
  assert.match(card, /font-serif/);
  assert.match(card, /WhatsApp/);
  assert.match(card, /wa\.me\/359888123456/);
  assert.match(card, /Меню/);
});

await test('невалиден собствен цвят се игнорира (пада на темата)', async () => {
  const res = await request('/profile', {
    method: 'POST',
    headers: FORM_HEADERS,
    body: form({
      _csrf: csrf,
      display_name: 'Иван Тестов',
      phone: '+359 888 123 456',
      contact_email: 'ivan@example.com',
      website: 'https://example.com',
      slug: 'ivan-testov',
      type: 'personal',
      is_public: '1',
      accent: 'не-е-цвят',
      theme: 'ocean',
    }),
  });
  assert.equal(res.status, 302);
  const card = await (await request('/p/ivan-testov')).text();
  assert.doesNotMatch(card, /custom-accent/);
  assert.match(card, /theme-ocean/);
});

await test('връзка без http се отхвърля', async () => {
  const res = await request('/profile', {
    method: 'POST',
    headers: FORM_HEADERS,
    body: form({
      _csrf: csrf,
      display_name: 'Иван Тестов',
      slug: 'ivan-testov',
      type: 'personal',
      link_url_0: 'javascript:alert(1)',
    }),
  });
  assert.equal(res.status, 400);
});

await test('печатната страница препраща към mastilko-bg.com', async () => {
  const res = await request('/p/ivan-testov/print');
  assert.equal(res.status, 200);
  const html = await res.text();
  assert.match(html, /mastilko-bg\.com/);
  const handoff = html.match(
    /https:\/\/mastilko-bg\.com\/import\?source=vizitka&amp;token=([^"]+)/
  );
  assert.ok(handoff, 'липсва handoff линк с токен');
});

await test('печатното API връща данните по валиден токен', async () => {
  // Взимаме токена от печатната страница (както mastilko би го получил).
  const html = await (await request('/p/ivan-testov/print')).text();
  const token = decodeURIComponent(html.match(/import\?source=vizitka&amp;token=([^"]+)/)[1]);
  const res = await request(`/api/print/${token}`);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('access-control-allow-origin'), 'https://mastilko-bg.com');
  const data = await res.json();
  assert.equal(data.source, 'vizitka');
  assert.equal(data.slug, 'ivan-testov');
  assert.equal(data.display_name, 'Иван Тестов');
  assert.equal(data.phone, '+359 888 123 456');
  assert.ok(data.qr_url.endsWith('/p/ivan-testov/qr.png'));
});

await test('печатното API отхвърля невалиден токен', async () => {
  const res = await request('/api/print/невалиден.123.xxx');
  assert.equal(res.status, 401);
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

await test('vCard: гол CR не може да инжектира втори контакт', async () => {
  // Полето се подава с директен POST (браузърът би пратил CRLF) — точно така
  // се получаваше втори, чужд контакт в указателя на посетителя.
  const res = await request('/profile', {
    method: 'POST',
    headers: FORM_HEADERS,
    body: form({
      _csrf: csrf,
      display_name: 'Иван Тестов',
      slug: 'ivan-testov',
      type: 'personal',
      is_public: '1',
      theme: 'sunset',
      bio: 'Био\rEND:VCARD\rBEGIN:VCARD\rFN:Банка ОББ\rTEL:0888999888',
    }),
  });
  assert.equal(res.status, 302);
  const vcf = await (await request('/p/ivan-testov/vizitka.vcf')).text();
  // Броим РЕАЛНИ редове (CRLF), не подниза: екранираното „BEGIN:VCARD" остава
  // безобидно вътре в стойността на NOTE и парсерът вижда един контакт.
  const lines = vcf.split('\r\n');
  assert.equal(
    lines.filter((l) => l === 'BEGIN:VCARD').length,
    1,
    'трябва да има точно един контакт'
  );
  assert.equal(lines.filter((l) => /^TEL:0888999888/.test(l)).length, 0, 'нула инжектирани полета');
  assert.doesNotMatch(vcf, /\r(?!\n)/, 'не бива да остава гол CR в стойност');
});

await test('печатният токен не надживява скриването на визитката', async () => {
  const tokenUrl = (await (await request('/p/ivan-testov/print')).text()).match(
    /token=([A-Za-z0-9_\-.]+)/
  )?.[1];
  assert.ok(tokenUrl, 'трябва да получим печатен токен');
  assert.equal(
    (await request(`/api/print/${tokenUrl}`)).status,
    200,
    'токенът работи, докато е публична'
  );

  // Собственикът скрива визитката — вече издаденият токен спира да връща данни.
  await request('/profile', {
    method: 'POST',
    headers: FORM_HEADERS,
    body: form({
      _csrf: csrf,
      display_name: 'Иван Тестов',
      slug: 'ivan-testov',
      type: 'personal',
      theme: 'sunset',
    }), // без is_public → скрита
  });
  assert.equal(
    (await request(`/api/print/${tokenUrl}`)).status,
    404,
    'скрита → 404 въпреки токена'
  );

  // Връщаме я публична за следващите тестове.
  await request('/profile', {
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

// 1x1 PNG (валиден образ за качване на банер).
const PNG_1x1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64'
);

await test('нормален потребител няма достъп до /admin', async () => {
  jar.clear();
  await request('/login', {
    method: 'POST',
    headers: FORM_HEADERS,
    body: form({ email: 'ivan@example.com', password: 'novaparola22' }),
  });
  const res = await request('/admin');
  assert.equal(res.status, 403);
});

await test('регистрация с резервиран админ имейл се отказва', async () => {
  jar.clear();
  const res = await request('/register', {
    method: 'POST',
    headers: FORM_HEADERS,
    body: form({
      name: 'Самозванец',
      email: 'admin@example.com', // = ADMIN_EMAILS
      password: 'parolata123',
      type: 'personal',
    }),
  });
  assert.equal(res.status, 400, 'админският имейл не бива да се регистрира от сайта');
  assert.equal(
    db.prepare('SELECT COUNT(*) AS n FROM users WHERE email = ?').get('admin@example.com').n,
    0,
    'не трябва да е създаден акаунт'
  );
});

let bannerId = 0;
await test('админ отваря панела и създава банер', async () => {
  jar.clear();
  // Админът се провизионира от сървъра (`npm run admin:add`), не от сайта.
  await request('/register', {
    method: 'POST',
    headers: FORM_HEADERS,
    body: form({
      name: 'Шеф Админов',
      email: 'shef@example.com',
      password: 'adminparola1',
      type: 'personal',
    }),
  });
  db.prepare('UPDATE users SET is_admin = 1 WHERE email = ?').run('shef@example.com');
  const panel = await request('/admin/reklami');
  assert.equal(panel.status, 200, 'админът трябва да вижда панела');
  const adminCsrf = (await panel.text()).match(/name="_csrf" value="([a-f0-9]+)"/)?.[1] || '';

  const fd = new FormData();
  fd.set('_csrf', adminCsrf);
  fd.set('title', 'Тестова реклама');
  fd.set('link_url', 'https://example.com/promo');
  fd.set('alt', 'Промоция');
  fd.set('image', new Blob([PNG_1x1], { type: 'image/png' }), 'ad.png');
  const create = await request('/admin/banners', { method: 'POST', body: fd });
  assert.equal(create.status, 302);

  const list = await (await request('/admin/reklami')).text();
  assert.match(list, /Тестова реклама/);
  bannerId = Number(list.match(/\/admin\/banners\/(\d+)\/toggle/)?.[1]);
  assert.ok(bannerId > 0, 'банерът трябва да има id');
});

await test('банерът се показва на началната и кликът пренасочва', async () => {
  const home = await (await request('/')).text();
  assert.match(home, /class="ad"/);
  assert.match(home, new RegExp(`/b/${bannerId}/click`));
  const click = await request(`/b/${bannerId}/click`, { headers: {} });
  assert.equal(click.status, 302);
  assert.equal(click.headers.get('location'), 'https://example.com/promo');
});

await test('спрян банер не се показва', async () => {
  const panel = await (await request('/admin/reklami')).text();
  const adminCsrf = panel.match(/name="_csrf" value="([a-f0-9]+)"/)?.[1] || '';
  const toggle = await request(`/admin/banners/${bannerId}/toggle`, {
    method: 'POST',
    headers: FORM_HEADERS,
    body: form({ _csrf: adminCsrf }),
  });
  assert.equal(toggle.status, 302);
  jar.clear();
  const home = await (await request('/')).text();
  // Конкретният банер вече не се вижда; на негово място — банерът по подразбиране.
  assert.doesNotMatch(home, new RegExp(`/b/${bannerId}/click`));
  assert.match(home, /ad-carbonstealth\.png/);
});

await test('банерът по подразбиране се показва на двете места', async () => {
  jar.clear();
  const home = await (await request('/')).text();
  const shown = (home.match(/ad-carbonstealth\.png/g) || []).length;
  assert.equal(shown, 2, `подразбиращият се банер трябва да е на 2 места, а не ${shown}`);
  assert.match(home, /href="https:\/\/carbonstealth\.eu"/);
});

await test('началната показва максимум 2 банера', async () => {
  jar.clear();
  await request('/login', {
    method: 'POST',
    headers: FORM_HEADERS,
    body: form({ email: 'shef@example.com', password: 'adminparola1' }),
  });
  const adminCsrf =
    (await (await request('/admin/reklami')).text()).match(
      /name="_csrf" value="([a-f0-9]+)"/
    )?.[1] || '';
  // Създаваме общо 3 активни банера (един вече е спрян отгоре).
  for (const n of [1, 2, 3]) {
    const fd = new FormData();
    fd.set('_csrf', adminCsrf);
    fd.set('title', `Банер ${n}`);
    fd.set('link_url', `https://example.com/${n}`);
    fd.set('image', new Blob([PNG_1x1], { type: 'image/png' }), 'ad.png');
    await request('/admin/banners', { method: 'POST', body: fd });
  }
  jar.clear();
  const home = await (await request('/')).text();
  const shown = (home.match(/class="ad"/g) || []).length;
  assert.equal(shown, 2, `трябва да се показват точно 2 банера, а не ${shown}`);
});

await test('админ вижда всички визитки, скрива и редактира чужда', async () => {
  jar.clear();
  await request('/login', {
    method: 'POST',
    headers: FORM_HEADERS,
    body: form({ email: 'shef@example.com', password: 'adminparola1' }),
  });
  const listRes = await request('/admin');
  assert.equal(listRes.status, 200, 'админът трябва да вижда списъка с визитки');
  const list = await listRes.text();
  assert.match(list, /Визитки/);
  assert.match(list, /ivan@example\.com/, 'списъкът трябва да показва и чужди визитки');

  const found = await (await request('/admin?q=' + encodeURIComponent('ivan@example.com'))).text();
  const pid = Number(found.match(/\/admin\/profiles\/(\d+)\/edit/)?.[1]);
  assert.ok(pid > 0, 'трябва да намерим id на чужда визитка');
  const adminCsrf = found.match(/name="_csrf" value="([a-f0-9]+)"/)?.[1] || '';

  // Визитката е скрита ПО ИЗБОР НА ПОТРЕБИТЕЛЯ от по-ранен тест → админът НЕ може
  // да я публикува (модерацията е еднопосочна, чл. 25(2) ОРЗД).
  const isPublicNow = db.prepare('SELECT is_public FROM profiles WHERE id = ?').get(pid).is_public;
  assert.equal(isPublicNow, 0, 'подготовка: визитката е скрита от собственика');
  const denied = await request(`/admin/profiles/${pid}/visibility`, {
    method: 'POST',
    headers: FORM_HEADERS,
    body: form({ _csrf: adminCsrf }),
  });
  assert.equal(denied.status, 302);
  assert.equal(
    db.prepare('SELECT is_public FROM profiles WHERE id = ?').get(pid).is_public,
    0,
    'скритата от потребителя визитка НЕ бива да се публикува от админа'
  );

  // Същото правило и през формата за редакция.
  const editForm = await (await request(`/admin/profiles/${pid}/edit`)).text();
  const editCsrf = editForm.match(/name="_csrf" value="([a-f0-9]+)"/)?.[1] || '';
  const slug = editForm.match(/name="slug"[^>]*value="([^"]+)"/)?.[1] || '';
  const name = editForm.match(/name="display_name"[^>]*value="([^"]+)"/)?.[1] || 'Иван';
  const tryPublish = await request(`/admin/profiles/${pid}`, {
    method: 'POST',
    headers: FORM_HEADERS,
    body: form({
      _csrf: editCsrf,
      display_name: name,
      slug,
      type: 'personal',
      is_public: '1',
      theme: 'blue',
    }),
  });
  assert.equal(tryPublish.status, 400, 'публикуване на чужда скрита визитка се отказва');

  // Редакция БЕЗ публикуване работи и се записва в одитната следа.
  const save = await request(`/admin/profiles/${pid}`, {
    method: 'POST',
    headers: FORM_HEADERS,
    body: form({
      _csrf: editCsrf,
      display_name: name,
      slug,
      headline: 'Редактирано от админ',
      type: 'personal',
      theme: 'blue',
    }),
  });
  assert.equal(save.status, 302, 'записът от админа трябва да пренасочи');
  const after = await (await request(`/admin/profiles/${pid}/edit`)).text();
  assert.match(after, /Редактирано от админ/, 'промяната на админа трябва да е записана');

  const audit = db
    .prepare('SELECT * FROM admin_audit WHERE profile_id = ? ORDER BY id DESC')
    .all(pid);
  assert.ok(audit.length > 0, 'админското действие трябва да е в одитната следа');
  assert.equal(audit[0].action, 'edit');
  assert.equal(audit[0].admin_email, 'shef@example.com');
});

await test('админ скрива публична визитка и може да върне СВОЕТО скриване', async () => {
  // Отделен потребител с ПУБЛИЧНА визитка, за да не зависим от реда на тестовете.
  const own = new Map();
  const asOwner = async (path, options = {}) => {
    const headers = { ...(options.headers || {}) };
    if (own.size) headers.cookie = [...own.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
    const res = await fetch(base + path, { ...options, headers, redirect: 'manual' });
    for (const raw of res.headers.getSetCookie?.() || []) {
      const [pair] = raw.split(';');
      const [n, v] = pair.split('=');
      if (v) own.set(n.trim(), v.trim());
    }
    return res;
  };
  await asOwner('/register', {
    method: 'POST',
    headers: { ...FORM_HEADERS, origin: base },
    body: form({
      name: 'Модер Тестов',
      email: 'moder@example.com',
      password: 'parola12345',
      type: 'personal',
    }),
  });
  const ownCsrf = (await (await asOwner('/dashboard')).text()).match(
    /name="_csrf" value="([a-f0-9]+)"/
  )?.[1];
  await asOwner('/profile', {
    method: 'POST',
    headers: FORM_HEADERS,
    body: form({
      _csrf: ownCsrf,
      display_name: 'Модер Тестов',
      slug: 'moder-testov',
      type: 'personal',
      is_public: '1',
      theme: 'blue',
    }),
  });
  const pid = db.prepare("SELECT id FROM profiles WHERE slug = 'moder-testov'").get().id;

  const found = await (await request('/admin?q=' + encodeURIComponent('moder@example.com'))).text();
  const adminCsrf = found.match(/name="_csrf" value="([a-f0-9]+)"/)?.[1] || '';
  const toggle = () =>
    request(`/admin/profiles/${pid}/visibility`, {
      method: 'POST',
      headers: FORM_HEADERS,
      body: form({ _csrf: adminCsrf }),
    });

  assert.equal((await toggle()).status, 302);
  let row = db.prepare('SELECT * FROM profiles WHERE id = ?').get(pid);
  assert.equal(row.is_public, 0, 'админът може да скрие публична визитка');
  assert.equal(row.hidden_by_admin, 1, 'скриването е отбелязано като админско');

  // Собственикът НЕ може да я върне сам.
  const selfPublish = await asOwner('/profile', {
    method: 'POST',
    headers: FORM_HEADERS,
    body: form({
      _csrf: ownCsrf,
      display_name: 'Модер Тестов',
      slug: 'moder-testov',
      type: 'personal',
      is_public: '1',
      theme: 'blue',
    }),
  });
  assert.equal(selfPublish.status, 400);
  assert.equal(
    db.prepare('SELECT is_public FROM profiles WHERE id = ?').get(pid).is_public,
    0,
    'потребителят не бива да заобикаля админското скриване'
  );

  // Админът връща своето скриване.
  assert.equal((await toggle()).status, 302);
  row = db.prepare('SELECT * FROM profiles WHERE id = ?').get(pid);
  assert.equal(row.is_public, 1);
  assert.equal(row.hidden_by_admin, 0);

  const actions = db
    .prepare('SELECT action FROM admin_audit WHERE profile_id = ? ORDER BY id')
    .all(pid)
    .map((r) => r.action);
  assert.deepEqual(actions, ['hide', 'unhide'], 'и двете действия са в одитната следа');
});

await test('забравена парола: имейл → нулиране → вход с новата', async () => {
  jar.clear();
  await request('/register', {
    method: 'POST',
    headers: FORM_HEADERS,
    body: form({
      name: 'Забравко',
      email: 'forgot@example.com',
      password: 'stara-parola1',
      type: 'personal',
    }),
  });
  jar.clear();
  // Заявка за нулиране — генеричен отговор, писмо в dev outbox-а.
  const before = outbox.length;
  const res = await request('/forgot', {
    method: 'POST',
    headers: FORM_HEADERS,
    body: form({ email: 'forgot@example.com' }),
  });
  assert.equal(res.status, 200);
  assert.match(await res.text(), /изпратихме връзка/);
  assert.equal(outbox.length, before + 1, 'трябва да има ново писмо');
  const token = outbox[outbox.length - 1].text.match(/\/reset\?token=([a-f0-9]{64})/)[1];

  // Страницата за нова парола се отваря с валиден токен.
  const page = await request(`/reset?token=${token}`);
  assert.equal(page.status, 200);
  assert.match(await page.text(), /Нова парола/);

  // Задаваме нова парола.
  const set = await request('/reset', {
    method: 'POST',
    headers: FORM_HEADERS,
    body: form({ token, password: 'chisto-nova-9' }),
  });
  assert.equal(set.status, 200);

  // Токенът е еднократен — повторно ползване се отхвърля.
  const reuse = await request('/reset', {
    method: 'POST',
    headers: FORM_HEADERS,
    body: form({ token, password: 'oshte-edna-9' }),
  });
  assert.equal(reuse.status, 400);

  // Старата парола не работи, новата — да.
  const oldPw = await request('/login', {
    method: 'POST',
    headers: FORM_HEADERS,
    body: form({ email: 'forgot@example.com', password: 'stara-parola1' }),
  });
  assert.equal(oldPw.status, 401);
  const newPw = await request('/login', {
    method: 'POST',
    headers: FORM_HEADERS,
    body: form({ email: 'forgot@example.com', password: 'chisto-nova-9' }),
  });
  assert.equal(newPw.status, 302);
});

await test('забравена парола: непознат имейл не издава нищо и не праща писмо', async () => {
  jar.clear();
  const before = outbox.length;
  const res = await request('/forgot', {
    method: 'POST',
    headers: FORM_HEADERS,
    body: form({ email: 'nqma-takyv@example.com' }),
  });
  assert.equal(res.status, 200);
  assert.match(await res.text(), /изпратихме връзка/); // същият генеричен отговор
  assert.equal(outbox.length, before, 'не трябва да се праща писмо за несъществуващ акаунт');
});

await test('SEO: JSON-LD екранира </script> (без HTML-инжекция)', async () => {
  const { cardJsonLd, siteJsonLd } = await import('../src/seo.js');
  const evil = {
    display_name: '</script><meta http-equiv="refresh" content="0;url=//evil">',
    slug: 'x',
    headline: '',
    is_public: 1,
  };
  const out = cardJsonLd(evil, 'https://vizitka-bg.com/p/x', 'https://vizitka-bg.com');
  assert.doesNotMatch(out, /<\/script>/i, 'не бива да има суров </script> breakout');
  assert.match(out, /\\u003c/, 'опасните знаци са екранирани като \\u003c');
  assert.doesNotMatch(siteJsonLd('https://vizitka-bg.com'), /<\/script>/i);
});

await test('SEO: визитката е ProfilePage със свързан граф, без висящи препратки', async () => {
  const { cardJsonLd } = await import('../src/seo.js');
  const url = 'https://vizitka-bg.com/p/ivan';
  const graph = JSON.parse(
    cardJsonLd(
      { display_name: 'Иван', slug: 'ivan', type: 'personal', updated_at: '2026-09-25 10:00:00' },
      url,
      'https://vizitka-bg.com'
    )
  )['@graph'];
  const byId = new Map(graph.filter((n) => n['@id']).map((n) => [n['@id'], n]));
  const page = graph.find((n) => n['@type'] === 'ProfilePage');
  assert.ok(page, 'липсва ProfilePage');
  assert.equal(page.mainEntity['@id'], `${url}#person`);
  assert.equal(page.dateModified, '2026-09-25T10:00:00Z', 'ISO 8601 с изрична зона');
  // Всяка препратка трябва да сочи към възел, ОПРЕДЕЛЕН на същата страница.
  for (const ref of [page.mainEntity, page.isPartOf, page.breadcrumb])
    assert.ok(byId.has(ref['@id']), `висяща препратка: ${ref['@id']}`);
});

await test('IndexNow: publicUrls съдържа статичните + публичните визитки', async () => {
  const { publicUrls } = await import('../src/indexnow.js');
  const urls = publicUrls('https://vizitka-bg.com');
  assert.ok(urls.includes('https://vizitka-bg.com/'), 'началната');
  assert.ok(urls.includes('https://vizitka-bg.com/privacy'), 'правните страници');
  assert.ok(
    urls.every((u) => u.startsWith('https://vizitka-bg.com/')),
    'всички URL са с публичния домейн'
  );
});

await test('Мастилко → Визитка: prefill попълва профила (без имейл)', async () => {
  jar.clear();
  const res = await request('/register', {
    method: 'POST',
    headers: FORM_HEADERS,
    body: form({
      name: 'Петър Живков',
      email: 'jiv@example.com',
      password: 'parola12345',
      type: 'personal',
      from: 'mastilko',
      role: 'Дизайнер',
      company: 'Ателие Живков',
      phone: '+359 111',
      website: 'jivkov.bg', // без протокол — Визитка добавя https://
    }),
  });
  assert.equal(res.status, 302);
  const dash = await (await request('/dashboard')).text();
  assert.match(dash, /Дизайнер/);
  assert.match(dash, /Ателие Живков/);
  assert.match(dash, /https:\/\/jivkov\.bg/);
  // Контактният имейл НЕ се попълва (privacy-by-default) — полето остава празно.
  assert.match(dash, /name="contact_email"[^>]*value=""/);
});

// ─── Портфейли (Apple Wallet / Google Wallet) ────────────────────────────────

await test('портфейл: изключен без сертификати — 404 + „Скоро" тийзър', async () => {
  const apple = await request('/p/ivan-testov/wallet/apple.pkpass');
  const google = await request('/p/ivan-testov/wallet/google');
  assert.equal(apple.status, 404);
  assert.equal(google.status, 404);
  // Функцията е изключена → показваме тийзър „Скоро", но БЕЗ активни линкове.
  // Влизаме като собственика (визитката е скрита от по-ранен тест).
  jar.clear();
  await request('/login', {
    method: 'POST',
    headers: FORM_HEADERS,
    body: form({ email: 'ivan@example.com', password: 'novaparola22' }),
  });
  const card = await (await request('/p/ivan-testov')).text();
  assert.match(card, /Скоро/);
  assert.match(card, /is-soon/);
  assert.doesNotMatch(card, /href="[^"]*\/wallet\/(apple\.pkpass|google)"/);
});

await test('портфейл: Apple update web service иска токен (401 без него)', async () => {
  const res = await request('/v1/passes/pass.eu.carbonstealth.vizitka/ivan-testov');
  assert.equal(res.status, 401);
  const reg = await request(
    '/v1/devices/dev123/registrations/pass.eu.carbonstealth.vizitka/ivan-testov',
    { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"pushToken":"x"}' }
  );
  assert.equal(reg.status, 401);
});

await test('портфейл (unit): ZIP и PNG енкодерите дават валидни контейнери', async () => {
  const { zipStore, solidPng } = await import('../src/wallet/binary.js');
  const png = solidPng(29, [79, 70, 229]);
  assert.equal(png.subarray(1, 4).toString(), 'PNG', 'валиден PNG подпис');
  const zip = zipStore([{ name: 'a.txt', data: Buffer.from('hi') }]);
  assert.equal(zip.readUInt32LE(0), 0x04034b50, 'local file header');
  assert.equal(zip.readUInt32LE(zip.length - 22), 0x06054b50, 'end of central directory');
});

await test('портфейл (unit): Apple pass.json носи QR към живия профил', async () => {
  process.env.APPLE_TEAM_ID = 'TEAM123456';
  process.env.APPLE_PASS_TYPE_ID = 'pass.eu.carbonstealth.vizitka';
  const { buildPassJson } = await import('../src/wallet/apple.js');
  const profile = {
    slug: 'ivan-testov',
    display_name: 'Иван Тестов',
    headline: 'Инженер',
    company: 'Карбон',
    phone: '+359888',
    theme: 'blue',
    accent: '',
    id: 999999,
  };
  const pass = buildPassJson(profile, base);
  assert.equal(pass.passTypeIdentifier, 'pass.eu.carbonstealth.vizitka');
  assert.equal(pass.serialNumber, '999999'); // стабилен id, не слъг
  assert.equal(pass.barcodes[0].message, `${base}/p/ivan-testov`);
  assert.equal(pass.generic.primaryFields[0].value, 'Иван Тестов');
});

await test('портфейл (unit): Google save URL е подписан JWT с обект към профила', async () => {
  const crypto = await import('node:crypto');
  const { privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  const pem = privateKey.export({ type: 'pkcs8', format: 'pem' });
  const saPath = join(process.env.DATA_DIR, 'sa.json');
  fs.writeFileSync(
    saPath,
    JSON.stringify({ client_email: 'sa@test.iam.gserviceaccount.com', private_key: pem })
  );
  process.env.GOOGLE_WALLET_ISSUER_ID = '3388000000000000000';
  process.env.GOOGLE_WALLET_SA_KEY = saPath;
  const { googleSaveUrl } = await import('../src/wallet/google.js');
  const profile = { slug: 'ivan-testov', display_name: 'Иван Тестов', theme: 'blue', id: 999999 };
  const url = googleSaveUrl(profile, base);
  assert.match(url, /^https:\/\/pay\.google\.com\/gp\/v\/save\//);
  const jwt = url.split('/save/')[1];
  const payload = JSON.parse(Buffer.from(jwt.split('.')[1], 'base64url').toString());
  assert.equal(payload.typ, 'savetowallet');
  const obj = payload.payload.genericObjects[0];
  assert.equal(obj.id, '3388000000000000000.999999'); // стабилен id, не слъг
  assert.equal(obj.barcode.value, `${base}/p/ivan-testov`);
  // Един обект на визитка, много посетители го запазват → класът ТРЯБВА да
  // позволява много притежатели. Полето е само на класа, не на обекта.
  const cls = payload.payload.genericClasses[0];
  assert.equal(cls.multipleDevicesAndHoldersAllowedStatus, 'MULTIPLE_HOLDERS');
  assert.equal(obj.multipleDevicesAndHoldersAllowedStatus, undefined);
  // Google изрязва логото в кръг — затова квадратното, не широкото.
  assert.equal(obj.logo.sourceUri.uri, `${base}/wallet-logo.png`);
  const png = fs.readFileSync(new URL('../public/wallet-logo.png', import.meta.url));
  assert.equal(
    png.readUInt32BE(16),
    png.readUInt32BE(20),
    'логото за портфейла трябва да е квадратно'
  );
  // Нула лични снимки на картата: Google Wallet не ги поддържа (правото на отказ
  // от обработка на чувствителни данни). Снимката на профила не бива да стига дотук.
  assert.ok(!JSON.stringify(obj).includes('/photo/'), 'личната снимка не бива да влиза в картата');
});

await test('портфейл (unit): класът на Google се създава предварително и идемпотентно', async () => {
  // Подменяме fetch: тестът проверява РЕДА на заявките към Google, без мрежа.
  const { ensureGoogleClass } = await import('../src/wallet/google.js');
  const realFetch = globalThis.fetch;
  const calls = [];
  let classExists = false;
  globalThis.fetch = async (url, opts = {}) => {
    const method = opts.method || 'GET';
    calls.push(`${method} ${String(url).replace(/^https:\/\/[^/]+/, '')}`);
    const json = (status, body) =>
      new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json' },
      });
    if (String(url).includes('oauth2.googleapis.com')) return json(200, { access_token: 'tok' });
    if (method === 'GET') return classExists ? json(200, {}) : json(404, {});
    if (method === 'POST') {
      assert.equal(
        JSON.parse(opts.body).multipleDevicesAndHoldersAllowedStatus,
        'MULTIPLE_HOLDERS'
      );
      classExists = true;
      return json(200, {});
    }
    if (method === 'PATCH') return json(200, {});
    return json(500, {});
  };
  try {
    assert.equal(await ensureGoogleClass(), 'created');
    assert.equal(await ensureGoogleClass(), 'updated');
  } finally {
    globalThis.fetch = realFetch;
  }
  const api = calls.filter((c) => !c.includes('/token'));
  assert.deepEqual(api, [
    'GET /walletobjects/v1/genericClass/3388000000000000000.vizitka_generic',
    'POST /walletobjects/v1/genericClass',
    'GET /walletobjects/v1/genericClass/3388000000000000000.vizitka_generic',
    'PATCH /walletobjects/v1/genericClass/3388000000000000000.vizitka_generic',
  ]);
});

await test('портфейл: с включен Google бутонът се показва и води към save линк', async () => {
  // GOOGLE_WALLET_* са зададени в предходния тест → функцията вече е активна.
  // Влизаме като собственика (визитката е скрита от по-ранен тест — собственикът я вижда).
  jar.clear();
  await request('/login', {
    method: 'POST',
    headers: FORM_HEADERS,
    body: form({ email: 'ivan@example.com', password: 'novaparola22' }),
  });
  const card = await request('/p/ivan-testov');
  assert.match(await card.text(), /badge-google-wallet/);
  const res = await request('/p/ivan-testov/wallet/google');
  assert.equal(res.status, 302);
  assert.match(res.headers.get('location'), /^https:\/\/pay\.google\.com\/gp\/v\/save\//);
});

await test('визитката носи ≥5 ключови думи, една от които „Carbon Stealth"', async () => {
  const html = await (await request('/p/ivan-testov')).text();
  const meta = html.match(/<meta name="keywords" content="([^"]+)"/);
  assert.ok(meta, 'липсва meta keywords');
  const kw = meta[1].split(',').map((s) => s.trim());
  assert.ok(kw.length >= 5, `само ${kw.length} ключови думи`);
  assert.ok(kw.includes('Carbon Stealth'), 'липсва бранд атрибуцията „Carbon Stealth"');
  assert.match(html, /<meta name="description" content="[^"]{20,}"/);
});

await test('началната показва MCP конектора с адрес, който може да се копира', async () => {
  const html = await (await request('/')).text();
  assert.match(html, /id="ai-konektor"/, 'секцията за конектора липсва');
  assert.ok(html.includes(`value="${base}/mcp"`), 'адресът на конектора трябва да е пълен URL');
  assert.match(html, /data-copy="#mcp-url"/, 'бутонът за копиране липсва');
  assert.match(html, /href="\/konektor-chatgpt-claude"/);
  // AI асистентите четат llms.txt — там също трябва да разберат, че могат да ни свържат.
  const llms = await (await request('/llms.txt')).text();
  assert.ok(llms.includes(`${base}/mcp`), 'llms.txt не казва къде е конекторът');
  // featureList обещава само работещото без настройка — портфейлите са зад ключове.
  const ld = JSON.parse(
    html.match(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/)[1]
  );
  const app = ld['@graph'].find((n) => n['@type'] === 'WebApplication');
  assert.ok(app.featureList.some((f) => /MCP/.test(f)));
  assert.ok(!app.featureList.some((f) => /Wallet|портфейл/i.test(f)));
});

// Регресия за РЕАЛНА грешка: наръчникът (и оттам llms.txt и корпусът на конектора)
// твърдеше „не поддържаме NFC“, а таблото има блок за запис в NFC чип. Съдържание,
// което лъже за продукта, е по-лошо от липсващо — особено когато го цитират AI асистенти.
const GUIDES_FOR_CLAIMS = (await import('../src/guides.js')).GUIDES.map((g) => g.slug);
await test('съдържанието не отрича NFC, щом таблото го предлага', async () => {
  const dash = fs.readFileSync(new URL('../src/views/dashboard.ejs', import.meta.url), 'utf8');
  assert.match(dash, /NFC карта/, 'предпоставката на теста: таблото предлага NFC');
  const denial = /не поддържа(ме)? NFC|не, засега не/i;
  const llms = await (await request('/llms.txt')).text();
  assert.ok(!denial.test(llms), 'llms.txt отрича NFC');
  for (const g of GUIDES_FOR_CLAIMS) {
    const html = await (await request(`/${g}`)).text();
    assert.ok(!denial.test(html), `/${g} отрича NFC`);
  }
  const { buildCorpus } = await import('../src/mcp/corpus.js');
  for (const doc of buildCorpus(base))
    assert.ok(!denial.test(doc.text), `корпусът на конектора (${doc.id}) отрича NFC`);
});

// ── Наръчник (SEO/GEO/AEO) ───────────────────────────────────────────────────
// Съдържателните страници са отделен пазар за всяко намерение („дигитална визитка",
// „визитка с QR код", „vCard"). Тестът пази това, което ги прави намираеми, и е
// нарочно строг: страница без уникално заглавие/описание, без канонична връзка, с
// по-малко от 5 ключови думи или без „Carbon Stealth" е нарушение на правило на
// репото, не въпрос на вкус. Пази и от сираци — страница без връзка отникъде.
const { GUIDES } = await import('../src/guides.js');

await test('наръчник: всяка страница се отваря с уникално заглавие, описание и canonical', async () => {
  assert.ok(GUIDES.length >= 5, 'наръчникът е под 5 страници');
  const titles = new Set();
  const descriptions = new Set();
  for (const g of GUIDES) {
    const res = await request(`/${g.slug}`);
    assert.equal(res.status, 200, `/${g.slug} върна ${res.status}`);
    const html = await res.text();
    // Сравнение по низ, не по регулярен израз: заглавията носят скоби и точки
    // („vCard (.vcf) …“), тоест като шаблон биха значели друго.
    assert.ok(html.includes(`<h1>${g.h1}</h1>`), `/${g.slug}: липсва H1`);
    assert.ok(
      html.includes(`<link rel="canonical" href="${base}/${g.slug}">`),
      `/${g.slug}: липсва/грешен canonical`
    );
    assert.match(html, /<meta name="robots" content="index,follow/, `/${g.slug}: не се индексира`);
    // Отговор отпред (GEO/AEO): първият абзац е самият отговор, 40–60 думи.
    const words = g.answer.split(/\s+/).length;
    assert.ok(words >= 30 && words <= 70, `/${g.slug}: отговорът отпред е ${words} думи`);
    assert.ok(html.includes(g.answer.slice(0, 60)), `/${g.slug}: отговорът не е в страницата`);
    assert.ok(!titles.has(g.title), `/${g.slug}: повтарящо се заглавие`);
    assert.ok(!descriptions.has(g.description), `/${g.slug}: повтарящо се описание`);
    titles.add(g.title);
    descriptions.add(g.description);
    assert.ok(
      g.description.length <= 200,
      `/${g.slug}: описанието е ${g.description.length} знака`
    );
  }
});

await test('наръчник: ключови думи ≥5 и „Carbon Stealth" на всяка страница', async () => {
  for (const g of GUIDES) {
    assert.ok(g.keywords.length >= 5, `/${g.slug}: само ${g.keywords.length} ключови думи`);
    assert.ok(g.keywords.includes('Carbon Stealth'), `/${g.slug}: липсва „Carbon Stealth"`);
    const html = await (await request(`/${g.slug}`)).text();
    const meta = html.match(/<meta name="keywords" content="([^"]+)"/);
    assert.ok(meta, `/${g.slug}: липсва meta keywords`);
    for (const kw of g.keywords) assert.ok(meta[1].includes(kw), `/${g.slug}: липсва „${kw}"`);
  }
});

await test('наръчник: JSON-LD е валиден и свързан в графа (без висящи възли)', async () => {
  for (const g of GUIDES) {
    const html = await (await request(`/${g.slug}`)).text();
    const block = html.match(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/);
    assert.ok(block, `/${g.slug}: липсва JSON-LD`);
    const data = JSON.parse(block[1]); // хвърля при счупен JSON — това е тестът
    const types = data['@graph'].map((n) => [].concat(n['@type']).join('+'));
    assert.ok(
      types.some((t) => t.includes('WebPage')),
      `/${g.slug}: липсва WebPage`
    );
    assert.ok(types.includes('BreadcrumbList'), `/${g.slug}: липсва троха`);
    const page = data['@graph'][0];
    assert.equal(page.isPartOf['@id'], `${base}/#website`); // свързан, не висящ
    assert.equal(page.publisher['@id'], `${base}/#organization`);
    // Издателят трябва да е ОПРЕДЕЛЕН на самата страница, не само посочен —
    // иначе при четене на отделната страница препратката виси.
    const org = data['@graph'].find((n) => n['@id'] === `${base}/#organization`);
    assert.ok(org?.name, `/${g.slug}: висяща препратка към организацията`);
    if (g.faq?.length) assert.ok(types.includes('FAQPage'), `/${g.slug}: липсва FAQPage`);
    if (g.steps?.length) {
      const howTo = data['@graph'].find((n) => n['@type'] === 'HowTo');
      assert.ok(howTo, `/${g.slug}: липсва HowTo`);
      assert.equal(howTo.step.length, g.steps.length);
    }
    // Нула измислена схема: рейтинг/ревю без реални отзиви е спам, не SEO.
    assert.ok(!/aggregateRating|"Review"/.test(block[1]), `/${g.slug}: измислена схема`);
  }
});

await test('наръчник: страниците са в sitemap, llms.txt, IndexNow и имат вътрешни връзки', async () => {
  const sitemap = await (await request('/sitemap.xml')).text();
  const llms = await (await request('/llms.txt')).text();
  const home = await (await request('/')).text();
  const { publicUrls } = await import('../src/indexnow.js');
  const submitted = publicUrls(base);
  for (const g of GUIDES) {
    assert.ok(sitemap.includes(`<loc>${base}/${g.slug}</loc>`), `/${g.slug}: липсва в sitemap`);
    assert.ok(sitemap.includes(`<lastmod>${g.updated}</lastmod>`), `/${g.slug}: липсва lastmod`);
    assert.ok(llms.includes(`${base}/${g.slug}`), `/${g.slug}: липсва в llms.txt`);
    assert.ok(submitted.includes(`${base}/${g.slug}`), `/${g.slug}: не се подава към IndexNow`);
    assert.ok(home.includes(`href="/${g.slug}"`), `/${g.slug}: сирак — няма връзка от началната`);
  }
  // robots.txt не бива да ги спира.
  const robots = await (await request('/robots.txt')).text();
  for (const g of GUIDES) assert.ok(!robots.includes(`Disallow: /${g.slug}`));
});

// Регресия за реален провален деплой: в продукция принудителният редирект към
// https стоеше ПРЕДИ /healthz, затова сондата на деплоя (http по loopback, без
// X-Forwarded-Proto) получаваше 308 с тяло „Moved Permanently…“. Маркерът за
// идентичност го няма, а curl без -L брои 3xx за успех → health гейтът обявяваше
// живото приложение за чуждо и откатваше успешен деплой. Тестът дърпа сондата
// точно като деплоя: чист HTTP, без следване на редирект.
await test('здравната сонда работи и в продукция (200 с маркер, не 308 към https)', async () => {
  const dataDir = fs.mkdtempSync(join(os.tmpdir(), 'vizitka-prod-'));
  // `new URL` вместо import.meta.dirname — то е от Node 20.11, а CI върви и на 20.x.
  const fixture = fileURLToPath(new URL('fixtures/prod-server.mjs', import.meta.url));
  const child = spawn(process.execPath, [fixture], {
    env: {
      ...process.env,
      NODE_ENV: 'production',
      DATA_DIR: dataDir,
      PUBLIC_BASE_URL: 'https://vizitka-bg.com',
      PRINT_API_SECRET: 'test-print-secret',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  try {
    const prodPort = await new Promise((resolve, reject) => {
      let out = '';
      const timer = setTimeout(() => reject(new Error(`prod сървърът не вдигна: ${out}`)), 15000);
      child.stdout.on('data', (chunk) => {
        out += chunk;
        const m = out.match(/PORT=(\d+)/);
        if (m) {
          clearTimeout(timer);
          resolve(Number(m[1]));
        }
      });
      child.stderr.on('data', (chunk) => (out += chunk));
      child.on('exit', (code) => {
        clearTimeout(timer);
        reject(new Error(`prod сървърът излезе с код ${code}: ${out}`));
      });
    });
    const res = await fetch(`http://127.0.0.1:${prodPort}/healthz`, { redirect: 'manual' });
    assert.equal(res.status, 200); // 308 значи, че редиректът пак е пред сондата
    const body = await res.text();
    assert.match(body, /"app":"vizitka"/); // точният маркер, който autodeploy търси
    assert.match(body, /"db":"up"/);
    // Останалите маршрути ПАК се качват на https — изключението е само за сондата.
    const home = await fetch(`http://127.0.0.1:${prodPort}/`, { redirect: 'manual' });
    assert.equal(home.status, 308);
  } finally {
    child.kill('SIGKILL');
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});

server.close();
fs.rmSync(process.env.DATA_DIR, { recursive: true, force: true });

if (failures) {
  console.error(`\n${failures} провалени теста`);
  process.exit(1);
}
console.log('\nВсички smoke тестове минаха.');
