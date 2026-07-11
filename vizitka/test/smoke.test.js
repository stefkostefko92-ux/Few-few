// Smoke тест — пълният поток: регистрация → редакция → публична визитка → QR → vCard.
// Стартира приложението на случаен порт с временна база (DATA_DIR).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import { join } from 'node:path';

process.env.NODE_ENV = 'test';
process.env.DATA_DIR = fs.mkdtempSync(join(os.tmpdir(), 'vizitka-test-'));
process.env.ADMIN_EMAILS = 'admin@example.com';
process.env.MASTILKO_URL = 'https://mastilko-bg.com';
process.env.PRINT_API_SECRET = 'test-print-secret';
process.env.INDEXNOW_KEY = 'testindexnowkey1234567890abcdef0';

const { default: app } = await import('../src/app.js');
const { outbox } = await import('../src/mailer.js');

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

let bannerId = 0;
await test('админ отваря панела и създава банер', async () => {
  jar.clear();
  await request('/register', {
    method: 'POST',
    headers: FORM_HEADERS,
    body: form({
      name: 'Админ',
      email: 'admin@example.com',
      password: 'adminparola1',
      type: 'personal',
    }),
  });
  const panel = await request('/admin');
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

  const list = await (await request('/admin')).text();
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
  const panel = await (await request('/admin')).text();
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
    body: form({ email: 'admin@example.com', password: 'adminparola1' }),
  });
  const adminCsrf =
    (await (await request('/admin')).text()).match(/name="_csrf" value="([a-f0-9]+)"/)?.[1] || '';
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

server.close();
fs.rmSync(process.env.DATA_DIR, { recursive: true, force: true });

if (failures) {
  console.error(`\n${failures} провалени теста`);
  process.exit(1);
}
console.log('\nВсички smoke тестове минаха.');
