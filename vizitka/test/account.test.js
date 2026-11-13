// Настройки на акаунта: 2FA (TOTP + резервни кодове), активни сесии, изтегляне на
// данните, изтриване на акаунта и дневна статистика — всичко през HTTP, както браузър.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import { join } from 'node:path';

process.env.NODE_ENV = 'test';
process.env.DATA_DIR = fs.mkdtempSync(join(os.tmpdir(), 'vizitka-account-'));
process.env.PRINT_API_SECRET = 'test-print-secret-0123456789abcdef';
process.env.AUTH_RATE_LIMIT = '500';

const { default: app } = await import('../src/app.js');
const { default: db, UPLOADS_DIR } = await import('../src/db.js');
const { hotp, currentStep, base32Decode } = await import('../src/totp.js');

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

// Отделен „браузър“ с бисквитки за всеки клиент.
function client(defaults = {}) {
  const jar = new Map();
  const request = async (path, opts = {}) => {
    const headers = { origin: base, ...defaults, ...(opts.headers || {}) };
    if (jar.size) headers.cookie = [...jar].map(([k, v]) => `${k}=${v}`).join('; ');
    const res = await fetch(base + path, { ...opts, headers, redirect: 'manual' });
    for (const raw of res.headers.getSetCookie()) {
      const [pair] = raw.split(';');
      const i = pair.indexOf('=');
      const k = pair.slice(0, i).trim();
      const v = pair.slice(i + 1).trim();
      if (v) jar.set(k, v);
      else jar.delete(k);
    }
    return res;
  };
  const post = (path, data) =>
    request(path, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(data).toString(),
    });
  return { request, post, jar };
}
const csrfOf = (html) => html.match(/name="_csrf" value="([a-f0-9]+)"/)?.[1] || '';

const EMAIL = 'gergana@example.com';
const PASSWORD = 'mnogo-taina-1';
const main = client();
let secret = '';
let recovery = [];

// Нов код за потребителя. Стъпките само растат (защитата от повторение), а TOTP
// приема ±1 стъпка — за да не чакаме по 30 s между входовете, „превъртаме времето“:
// връщаме последната ползвана стъпка две назад и даваме кода на текущата. Самата
// защита не се пипа — тестът за повторение ползва ЕДИН код два пъти без превъртане.
function freshCode(email = EMAIL) {
  db.prepare('UPDATE users SET totp_last_step = ? WHERE email = ?').run(currentStep() - 2, email);
  return hotp(secret, currentStep());
}

async function settingsPage(c = main) {
  const res = await c.request('/settings');
  return { res, html: await res.text() };
}

await test('регистрация и страницата с настройките', async () => {
  const r = await main.post('/register', {
    name: 'Гергана Тестова',
    email: EMAIL,
    password: PASSWORD,
  });
  assert.equal(r.status, 302);
  const { res, html } = await settingsPage();
  assert.equal(res.status, 200);
  for (const s of [
    'Парола',
    'Двуфакторно влизане',
    'Активни сесии',
    'Твоите данни',
    'Изтриване на акаунта',
  ])
    assert.ok(html.includes(s), `липсва „${s}“`);
  assert.equal(res.headers.get('cache-control'), 'no-store');
  assert.match(res.headers.get('x-robots-tag') || '', /noindex/);
});

await test('грешна текуща парола → страница с ясна грешка, не гол текст', async () => {
  const { html } = await settingsPage();
  const r = await main.post('/settings/password', {
    _csrf: csrfOf(html),
    current_password: 'greshna',
    new_password: 'nova-parola-123',
  });
  assert.equal(r.status, 400);
  const body = await r.text();
  assert.match(body, /Грешна текуща парола/);
  assert.match(body, /<h1>Настройки на акаунта<\/h1>/);
});

await test('2FA: настройка — QR и ключ; грешен код не включва', async () => {
  const { html } = await settingsPage();
  const r = await main.post('/settings/2fa/setup', { _csrf: csrfOf(html) });
  const page = await r.text();
  assert.match(page, /src="data:image\/png;base64,/, 'липсва QR кодът');
  secret = page.match(/class="totp-secret">([A-Z2-7 ]+)</)?.[1].replace(/ /g, '') || '';
  assert.equal(base32Decode(secret).length, 20, '160-битова тайна (RFC 4226)');
  const stored = db
    .prepare('SELECT totp_pending, totp_enabled FROM users WHERE email = ?')
    .get(EMAIL);
  assert.ok(stored.totp_pending.startsWith('v1p:'), 'тайната трябва да е шифрована');
  assert.ok(!stored.totp_pending.includes(secret));
  assert.equal(stored.totp_enabled, 0);

  const bad = await main.post('/settings/2fa/enable', { _csrf: csrfOf(page), code: '000000' });
  assert.equal(bad.status, 400);
  assert.equal(
    db.prepare('SELECT totp_enabled FROM users WHERE email = ?').get(EMAIL).totp_enabled,
    0
  );
});

await test('2FA: верен код включва; 10 резервни кода; другите сесии излизат', async () => {
  const other = client();
  await other.post('/login', { email: EMAIL, password: PASSWORD });
  assert.equal((await other.request('/dashboard')).status, 200, 'подготовка: втора сесия');

  const { html } = await settingsPage();
  const r = await main.post('/settings/2fa/enable', { _csrf: csrfOf(html), code: freshCode() });
  assert.equal(r.status, 200);
  const page = await r.text();
  recovery = [...page.matchAll(/<li><code>([a-z0-9]{5}-[a-z0-9]{5})<\/code><\/li>/g)].map(
    (m) => m[1]
  );
  assert.equal(recovery.length, 10);
  assert.equal(new Set(recovery).size, 10);
  const row = db.prepare('SELECT * FROM users WHERE email = ?').get(EMAIL);
  assert.equal(row.totp_enabled, 1);
  assert.equal(row.totp_pending, null);
  const hashes = db.prepare('SELECT code_hash FROM recovery_codes WHERE user_id = ?').all(row.id);
  assert.equal(hashes.length, 10);
  assert.ok(!JSON.stringify(hashes).includes(recovery[0]), 'кодовете се пазят само като хеш');
  assert.equal((await other.request('/dashboard')).status, 302, 'старата сесия трябваше да излезе');
  // Кодовете се показват ЕДИН път.
  const again = (await settingsPage()).html;
  assert.ok(!again.includes(recovery[0]));
  assert.match(again, /Включено/);
});

await test('вход с 2FA: паролата сама не дава сесия', async () => {
  const c = client();
  const r = await c.post('/login', { email: EMAIL, password: PASSWORD });
  assert.equal(r.status, 302);
  assert.equal(r.headers.get('location'), '/login/2fa');
  assert.ok(!c.jar.has('vz_sid'), 'сесия преди втория фактор!');
  assert.equal((await c.request('/dashboard')).status, 302);
  assert.equal((await c.request('/login/2fa')).status, 200);

  const wrong = await c.post('/login/2fa', { code: '123456' });
  assert.equal(wrong.status, 401);
  assert.ok(!c.jar.has('vz_sid'));

  const code = freshCode();
  const ok = await c.post('/login/2fa', { code });
  assert.equal(ok.status, 302);
  assert.equal(ok.headers.get('location'), '/dashboard');
  assert.ok(c.jar.has('vz_sid'));
  assert.equal((await c.request('/dashboard')).status, 200);

  // Същият код втори път (прихванат код) — отказ.
  const replay = client();
  await replay.post('/login', { email: EMAIL, password: PASSWORD });
  const r2 = await replay.post('/login/2fa', { code });
  assert.equal(r2.status, 401, 'един TOTP код не бива да важи два пъти');
});

await test('подправена/липсваща първа стъпка → обратно към паролата', async () => {
  const user = db.prepare('SELECT id FROM users WHERE email = ?').get(EMAIL);
  const forged = client();
  forged.jar.set(
    'vz_2fa',
    `${user.id}.${Date.now() + 60000}.podpisAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA`
  );
  const r = await forged.post('/login/2fa', { code: freshCode() });
  assert.equal(r.status, 302);
  assert.equal(r.headers.get('location'), '/login');
  assert.ok(!forged.jar.has('vz_sid'));
  const none = await client().post('/login/2fa', { code: '000000' });
  assert.equal(none.headers.get('location'), '/login');
});

await test('резервен код влиза веднъж и води към настройките', async () => {
  const c = client();
  await c.post('/login', { email: EMAIL, password: PASSWORD });
  const r = await c.post('/login/2fa', { code: recovery[0].toUpperCase().replace('-', ' ') });
  assert.equal(r.status, 302);
  assert.equal(r.headers.get('location'), '/settings?recovery_used=9');
  const page = await (await c.request('/settings?recovery_used=9')).text();
  assert.match(page, /Остават ти <strong>9<\/strong>/);

  const again = client();
  await again.post('/login', { email: EMAIL, password: PASSWORD });
  assert.equal((await again.post('/login/2fa', { code: recovery[0] })).status, 401);
});

await test('активни сесии: етикет на устройството и изход от чуждо устройство', async () => {
  const phone = client({
    'user-agent':
      'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36',
  });
  await phone.post('/login', { email: EMAIL, password: PASSWORD });
  await phone.post('/login/2fa', { code: freshCode() });
  assert.equal((await phone.request('/dashboard')).status, 200);

  const { html } = await settingsPage();
  assert.match(html, /Chrome · Android/);
  assert.match(html, /Това устройство/);
  assert.ok(
    !/name="session" value="[a-f0-9]{64}"/.test(html),
    'ключът на сесията не бива да излиза'
  );
  const handles = [...html.matchAll(/name="session" value="([a-f0-9]{16})"/g)].map((m) => m[1]);
  assert.ok(handles.length >= 1);
  for (const h of handles)
    await main.post('/settings/sessions/revoke', { _csrf: csrfOf(html), session: h });
  assert.equal((await phone.request('/dashboard')).status, 302, 'телефонът трябваше да излезе');
  assert.equal((await main.request('/dashboard')).status, 200, 'текущата сесия остава');
});

await test('изтегляне на данните: ZIP с JSON, vCard и снимка — без парола и тайни', async () => {
  const user = db.prepare('SELECT id FROM users WHERE email = ?').get(EMAIL);
  const photo = 'a'.repeat(32) + '.png';
  fs.writeFileSync(join(UPLOADS_DIR, photo), Buffer.from('89504e470d0a1a0a', 'hex'));
  db.prepare(
    "UPDATE profiles SET photo = ?, headline = 'Архитект', is_public = 1 WHERE user_id = ?"
  ).run(photo, user.id);
  db.prepare(
    "INSERT INTO links (profile_id, label, url) SELECT id, 'Портфолио', 'https://example.com/p' FROM profiles WHERE user_id = ?"
  ).run(user.id);

  const r = await main.request('/settings/export');
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('content-type'), 'application/zip');
  assert.match(
    r.headers.get('content-disposition'),
    /attachment; filename="vizitka-gergana-testova-\d{4}-\d{2}-\d{2}\.zip"/
  );
  const zip = Buffer.from(await r.arrayBuffer());
  assert.equal(zip.readUInt32LE(0), 0x04034b50, 'не е ZIP');
  const text = zip.toString('latin1');
  for (const name of ['danni.json', 'gergana-testova.vcf', 'PROCHETI.txt', `snimki/${photo}`])
    assert.ok(text.includes(name), `липсва ${name}`);
  // Файловете са „stored“ (без компресия) — JSON-ът се чете директно от байтовете.
  const json = zip.toString('utf8');
  const start = json.indexOf('{\n  "format": "vizitka-export/1"');
  const data = JSON.parse(json.slice(start, json.indexOf('\n}', start) + 2));
  assert.equal(data.account.email, EMAIL);
  assert.equal(data.account.two_factor_enabled, true);
  assert.equal(data.profile.headline, 'Архитект');
  assert.equal(data.links[0].label, 'Портфолио');
  assert.ok(data.sessions.length >= 1);
  for (const leak of [
    'password_hash',
    'totp_secret',
    'totp_pending',
    'code_hash',
    'csrf_token',
    '$2a$',
    '$2b$',
  ])
    assert.ok(!json.includes(leak), `архивът издава „${leak}“`);
});

await test('дневна статистика: посещенията влизат в графиката', async () => {
  const user = db.prepare('SELECT id FROM users WHERE email = ?').get(EMAIL);
  const slug = db.prepare('SELECT slug FROM profiles WHERE user_id = ?').get(user.id).slug;
  for (const ua of ['Firefox/1', 'Firefox/2', 'Firefox/3'])
    await fetch(`${base}/p/${slug}`, { headers: { 'user-agent': ua } });
  const row = db
    .prepare(
      "SELECT views FROM profile_views_daily WHERE profile_id = (SELECT id FROM profiles WHERE user_id = ?) AND day = date('now')"
    )
    .get(user.id);
  assert.equal(row.views, 3);
  const dash = await (await main.request('/dashboard')).text();
  assert.match(dash, /<svg class="views-chart"/);
  assert.match(dash, /<strong>3<\/strong> за 7 дни/);
  assert.match(dash, /aria-label="Преглеждания за последните 30 дни: 3"/);
  assert.match(dash, /href="\/settings"/);
});

await test('2FA се изключва само с парола И код', async () => {
  const { html } = await settingsPage();
  const noCode = await main.post('/settings/2fa/disable', {
    _csrf: csrfOf(html),
    password: PASSWORD,
    code: '',
  });
  assert.equal(noCode.status, 400);
  const badPw = await main.post('/settings/2fa/disable', {
    _csrf: csrfOf(html),
    password: 'x',
    code: freshCode(),
  });
  assert.equal(badPw.status, 400);
  assert.equal(
    db.prepare('SELECT totp_enabled FROM users WHERE email = ?').get(EMAIL).totp_enabled,
    1
  );
  const ok = await main.post('/settings/2fa/disable', {
    _csrf: csrfOf(html),
    password: PASSWORD,
    code: freshCode(),
  });
  assert.equal(ok.status, 302);
  const row = db.prepare('SELECT * FROM users WHERE email = ?').get(EMAIL);
  assert.equal(row.totp_enabled, 0);
  assert.equal(row.totp_secret, null);
  assert.equal(
    db.prepare('SELECT COUNT(*) n FROM recovery_codes WHERE user_id = ?').get(row.id).n,
    0
  );
});

await test('развалена тайна → кодът се ОТКАЗВА (fail closed), резервният остава изход', async () => {
  const c = client();
  await c.post('/register', {
    name: 'Петър Пробен',
    email: 'petar@example.com',
    password: PASSWORD,
  });
  const html = (await settingsPage(c)).html;
  const page = await (await c.post('/settings/2fa/setup', { _csrf: csrfOf(html) })).text();
  const s2 = page.match(/class="totp-secret">([A-Z2-7 ]+)</)[1].replace(/ /g, '');
  const enabled = await (
    await c.post('/settings/2fa/enable', { _csrf: csrfOf(page), code: hotp(s2, currentStep()) })
  ).text();
  const codes = [...enabled.matchAll(/<li><code>([a-z0-9]{5}-[a-z0-9]{5})<\/code><\/li>/g)].map(
    (m) => m[1]
  );
  db.prepare(
    "UPDATE users SET totp_secret = 'v1p:развалено' WHERE email = 'petar@example.com'"
  ).run();
  const d = client();
  await d.post('/login', { email: 'petar@example.com', password: PASSWORD });
  assert.equal((await d.post('/login/2fa', { code: hotp(s2, currentStep() + 1) })).status, 401);
  assert.equal((await d.post('/login/2fa', { code: codes[0] })).status, 302);
});

await test('изтриване: потвърждение, 410, снимките изчезват, адресът не се дава на друг', async () => {
  const user = db.prepare('SELECT id FROM users WHERE email = ?').get(EMAIL);
  const profile = db.prepare('SELECT * FROM profiles WHERE user_id = ?').get(user.id);
  let { html } = await settingsPage();

  const wrongConfirm = await main.post('/settings/delete', {
    _csrf: csrfOf(html),
    confirm: 'drug',
    password: PASSWORD,
  });
  assert.equal(wrongConfirm.status, 400);
  const wrongPw = await main.post('/settings/delete', {
    _csrf: csrfOf(html),
    confirm: profile.slug,
    password: 'x',
  });
  assert.equal(wrongPw.status, 400);
  assert.ok(db.prepare('SELECT 1 FROM users WHERE id = ?').get(user.id), 'не биваше да се изтрие');

  const r = await main.post('/settings/delete', {
    _csrf: csrfOf(html),
    confirm: profile.slug,
    password: PASSWORD,
  });
  assert.equal(r.status, 200);
  const page = await r.text();
  assert.match(page, /Акаунтът е изтрит/);
  assert.ok(!/Изход<\/button>/.test(page), 'заглавката още показва влязъл потребител');
  assert.ok(!main.jar.has('vz_sid'));

  for (const [table, col] of [
    ['users', 'id'],
    ['profiles', 'user_id'],
    ['sessions', 'user_id'],
    ['recovery_codes', 'user_id'],
  ])
    assert.equal(
      db.prepare(`SELECT COUNT(*) n FROM ${table} WHERE ${col} = ?`).get(user.id).n,
      0,
      table
    );
  assert.equal(
    db.prepare('SELECT COUNT(*) n FROM links WHERE profile_id = ?').get(profile.id).n,
    0
  );
  assert.equal(
    db.prepare('SELECT COUNT(*) n FROM profile_views_daily WHERE profile_id = ?').get(profile.id).n,
    0
  );
  assert.ok(!fs.existsSync(join(UPLOADS_DIR, profile.photo)), 'снимката остана на диска');

  const gone = await fetch(`${base}/p/${profile.slug}`);
  assert.equal(gone.status, 410);
  assert.match(await gone.text(), /Визитката е изтрита/);

  // Нов човек със същото име НЕ получава стария адрес.
  const imposter = client();
  await imposter.post('/register', {
    name: 'Гергана Тестова',
    email: 'drugata@example.com',
    password: PASSWORD,
  });
  const newSlug = db
    .prepare(
      "SELECT slug FROM profiles WHERE user_id = (SELECT id FROM users WHERE email = 'drugata@example.com')"
    )
    .get().slug;
  assert.notEqual(newSlug, profile.slug);
  // И не може да си го избере ръчно.
  html = await (await imposter.request('/dashboard')).text();
  const take = await imposter.post('/profile', {
    _csrf: csrfOf(html),
    display_name: 'Гергана',
    slug: profile.slug,
    type: 'personal',
    theme: 'blue',
  });
  assert.equal(take.status, 400);
  assert.match(await take.text(), /Този адрес вече е зает/);
});

server.close();
fs.rmSync(process.env.DATA_DIR, { recursive: true, force: true });
if (failures) {
  console.error(`\n${failures} провалени теста`);
  process.exit(1);
}
console.log('\nВсички тестове на акаунта минаха.');
