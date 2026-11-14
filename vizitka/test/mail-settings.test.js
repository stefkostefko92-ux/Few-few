// Пощата на сайта от админ панела (/admin/poshta) — моделът на rilievi (#32, Brevo SMTP).
//
// Спецификация (приемни критерии):
//  1. Само админ: анонимен → /login, обикновен потребител → 403.
//  2. Празната страница предлага Brevo: smtp-relay.brevo.com, порт 2525.
//  3. Запис иска паролата на админа (+ код при 2FA); грешна → 422 и нищо не се записва.
//  4. Ключът е шифрован в базата, никога не се връща в страницата, нито в одита.
//  5. Валидация: име на сървър (не адрес с интервали/знаци), портове само 587/2525/465, логин без
//     интервали, име на подателя без < > ", валиден имейл на подателя, ключ задължителен първия път.
//  6. Празен ключ запазва записания — освен при друг сървър или друг логин (тогава се пише наново:
//     ключът на Brevo не бива да отиде при непознат сървър).
//  7. Всяко писмо на сайта (напр. „Забравена парола“) тръгва през записания сървър, с неговия
//     логин/ключ и подател. Пробното писмо стига до самия админ.
//  8. Грешка на сървъра → само кодът (EAUTH…), без текста на сървъра.
//  9. Изключване: настройката остава записана, писмата се връщат към средата (SMTP_*), а без нея — към
//     dev кутията. Одит на запис/изключване/проба — без ключа.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import { join } from 'node:path';

process.env.NODE_ENV = 'test';
process.env.DATA_DIR = fs.mkdtempSync(join(os.tmpdir(), 'vizitka-mail-'));
process.env.PRINT_API_SECRET = 'test-print-secret-0123456789abcdef';
process.env.AUTH_RATE_LIMIT = '500';
process.env.ADMIN_EMAILS = 'shef@vizitka.test';
delete process.env.SMTP_HOST;

// ── Мини SMTP сървър (само за теста): AUTH PLAIN/LOGIN, пази входа и писмата ──
const smtp = { auths: [], mails: [], rejectAuth: false };
const fake = net.createServer((sock) => {
  let buf = '';
  let data = null;
  let login = null;
  sock.write('220 fake ESMTP\r\n');
  sock.on('data', (chunk) => {
    buf += chunk.toString('utf8');
    let i;
    while ((i = buf.indexOf('\r\n')) !== -1) {
      const line = buf.slice(0, i);
      buf = buf.slice(i + 2);
      if (data !== null) {
        if (line === '.') {
          smtp.mails.push(data.join('\n'));
          data = null;
          sock.write('250 queued\r\n');
        } else data.push(line);
        continue;
      }
      if (login) {
        login.push(Buffer.from(line, 'base64').toString('utf8'));
        if (login.length === 1) sock.write('334 UGFzc3dvcmQ6\r\n');
        else {
          smtp.auths.push({ user: login[0], pass: login[1] });
          login = null;
          sock.write(
            smtp.rejectAuth ? '535 5.7.8 Authentication failed for x@y\r\n' : '235 ok\r\n'
          );
        }
        continue;
      }
      const cmd = line.slice(0, 4).toUpperCase();
      if (cmd === 'EHLO') sock.write('250-fake\r\n250 AUTH PLAIN LOGIN\r\n');
      else if (cmd === 'AUTH') {
        const [, mech, arg] = line.split(' ');
        if (mech.toUpperCase() === 'PLAIN') {
          const [, user, pass] = Buffer.from(arg, 'base64').toString('utf8').split('\0');
          smtp.auths.push({ user, pass });
          sock.write(
            smtp.rejectAuth ? '535 5.7.8 Authentication failed for x@y\r\n' : '235 ok\r\n'
          );
        } else {
          login = [];
          sock.write('334 VXNlcm5hbWU6\r\n');
        }
      } else if (cmd === 'MAIL' || cmd === 'RCPT' || cmd === 'RSET' || cmd === 'NOOP')
        sock.write('250 ok\r\n');
      else if (cmd === 'DATA') {
        data = [];
        sock.write('354 go\r\n');
      } else if (cmd === 'QUIT') sock.end('221 bye\r\n');
      else sock.write('502 no\r\n');
    }
  });
  sock.on('error', () => {});
});
await new Promise((r) => fake.listen(0, '127.0.0.1', r));
const SMTP_PORT = fake.address().port;

const { default: app } = await import('../src/app.js');
const { default: db } = await import('../src/db.js');
const { hashPassword } = await import('../src/auth.js');
const { mailParams, privateAddress, saveMail, MailConflictError } =
  await import('../src/mailsettings.js');
const { encryptSecret, generateSecret, hotp, currentStep } = await import('../src/totp.js');

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

function client() {
  const jar = new Map();
  const request = async (path, opts = {}) => {
    const headers = { origin: base, ...(opts.headers || {}) };
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
  return { request, post };
}
const csrfOf = (html) => html.match(/name="_csrf" value="([a-f0-9]+)"/)?.[1] || '';

// Админът се провизионира от сървъра (както `npm run admin:add`) — регистрацията го отказва.
const ADMIN = 'shef@vizitka.test';
const ADMIN_PW = 'admin-parola-1';
db.prepare('INSERT INTO users (email, password_hash, is_admin) VALUES (?, ?, 1)').run(
  ADMIN,
  await hashPassword(ADMIN_PW)
);
const admin = client();
assert.equal((await admin.post('/login', { email: ADMIN, password: ADMIN_PW })).status, 302);

const KEY = 'xsmtpsib-TAINA-0123456789abcdef';
const good = (over = {}) => ({
  host: 'localhost',
  port: '2525',
  username: '8a1b2c@smtp-brevo.com',
  password: KEY,
  from_name: 'Vizitka',
  from_email: 'no-reply@vizitka-bg.com',
  admin_password: ADMIN_PW,
  ...over,
});
async function page(c = admin) {
  const res = await c.request('/admin/poshta');
  const html = await res.text();
  return { res, html, csrf: csrfOf(html) };
}
async function save(over = {}) {
  const { csrf } = await page();
  return admin.post('/admin/poshta', { _csrf: csrf, ...good(over) });
}
// Известието е в адреса на пренасочването (?done=…) — както го вижда браузърът.
const landed = async (res) => (await admin.request(res.headers.get('location'))).text();
const row = () => db.prepare("SELECT * FROM mail_settings WHERE id = 'mail'").get();
const audits = () =>
  db.prepare("SELECT action, detail FROM admin_audit WHERE action LIKE 'mail_%' ORDER BY id").all();

// Тестовият сървър е на случаен порт — пускаме 2525 от формата към него.
process.env.VIZITKA_TEST_SMTP_PORT = String(SMTP_PORT);

await test('само админ: анонимен → /login, обикновен потребител → 403', async () => {
  assert.equal((await fetch(`${base}/admin/poshta`, { redirect: 'manual' })).status, 302);
  const u = client();
  await u.post('/register', { name: 'Обикновен', email: 'u@example.com', password: 'parola-1234' });
  assert.equal((await u.request('/admin/poshta')).status, 403);
  const csrf = csrfOf(await (await u.request('/settings')).text());
  assert.equal((await u.post('/admin/poshta', { _csrf: csrf, ...good() })).status, 403);
  assert.equal(row(), undefined);
});

await test('празната страница предлага Brevo (smtp-relay.brevo.com, 2525)', async () => {
  const { res, html } = await page();
  assert.equal(res.status, 200);
  assert.match(html, /value="smtp-relay\.brevo\.com"/);
  assert.match(html, /<option value="2525" selected>/);
  assert.match(html, /не тръгват|dev кутия|не е включена/i);
});

await test('грешна парола на админа → 422, нищо не се записва', async () => {
  const res = await save({ admin_password: 'greshna' });
  assert.equal(res.status, 422);
  assert.equal(row(), undefined);
  assert.doesNotMatch(await res.text(), new RegExp(KEY), 'ключът се върна във формата');
});

await test('валидация: сървър, порт, логин, подател, ключ', async () => {
  for (const [over, field] of [
    [{ host: 'smtp relay brevo' }, 'host'],
    [{ host: 'evil.com/x' }, 'host'],
    [{ port: '25' }, 'port'],
    [{ username: 'a b' }, 'username'],
    [{ username: 'a\r\nRCPT TO:<x@y>' }, 'username'],
    [{ from_name: 'Vizitka <x@y>' }, 'from_name'],
    [{ from_email: 'не-е-имейл' }, 'from_email'],
    [{ password: '' }, 'password'],
  ]) {
    const res = await save(over);
    assert.equal(res.status, 422, JSON.stringify(over));
    assert.match(await res.text(), new RegExp(`id="err-${field}"`), field);
  }
  assert.equal(row(), undefined);
});

await test('запис: ключът е шифрован, не се показва, одит без ключа', async () => {
  const res = await save();
  assert.equal(res.status, 303);
  const r = row();
  assert.ok(r && r.active === 1);
  assert.match(r.pass_enc, /^v1[ap]:/);
  assert.ok(!r.pass_enc.includes(KEY));
  const { html } = await page();
  assert.ok(!html.includes(KEY), 'ключът е в страницата');
  assert.match(html, /настроен тук/i);
  const a = audits();
  assert.equal(a.at(-1).action, 'mail_set');
  assert.ok(!JSON.stringify(a).includes(KEY));
  const p = mailParams();
  assert.equal(p.source, 'admin');
  assert.equal(p.pass, KEY);
});

await test('пробно писмо стига до админа през записания сървър, с неговия вход', async () => {
  const before = smtp.mails.length;
  const { csrf } = await page();
  const res = await admin.post('/admin/poshta/test', { _csrf: csrf });
  assert.equal(res.status, 303);
  assert.match(await landed(res), /Пробното писмо е изпратено/);
  assert.equal(smtp.mails.length, before + 1);
  assert.match(smtp.mails.at(-1), /To: shef@vizitka\.test/);
  assert.deepEqual(smtp.auths.at(-1), { user: '8a1b2c@smtp-brevo.com', pass: KEY });
});

await test('писмата на сайта („Забравена парола“) тръгват през записания сървър', async () => {
  const before = smtp.mails.length;
  const c = client();
  await c.post('/forgot', { email: 'u@example.com' });
  await new Promise((r) => setTimeout(r, 300));
  assert.equal(smtp.mails.length, before + 1);
  const m = smtp.mails.at(-1);
  assert.match(m, /From: Vizitka <no-reply@vizitka-bg\.com>/);
  assert.match(m, /To: u@example\.com/);
});

await test('празен ключ запазва записания; друг сървър или логин иска нов ключ', async () => {
  assert.equal((await save({ password: '', from_name: 'Vizitka BG' })).status, 303);
  assert.equal(mailParams().pass, KEY);
  assert.equal(row().from_name, 'Vizitka BG');
  const otherHost = await save({ password: '', host: 'smtp.example.com' });
  assert.equal(otherHost.status, 422);
  assert.match(await otherHost.text(), /id="err-password"/);
  const otherUser = await save({ password: '', username: 'drug@smtp-brevo.com' });
  assert.equal(otherUser.status, 422);
  assert.equal(row().host, 'localhost');
});

await test('грешка на сървъра → само кодът, без текста му', async () => {
  smtp.rejectAuth = true;
  const { csrf } = await page();
  const html = await landed(await admin.post('/admin/poshta/test', { _csrf: csrf }));
  smtp.rejectAuth = false;
  assert.match(html, /код EAUTH/);
  assert.doesNotMatch(html, /Authentication failed for x@y/);
  assert.equal(audits().at(-1).action, 'mail_test');
});

await test('изключване: настройката остава, писмата се връщат към dev кутията', async () => {
  const { csrf } = await page();
  const res = await admin.post('/admin/poshta/disable', { _csrf: csrf });
  assert.equal(res.status, 303);
  assert.equal(row().active, 0);
  assert.equal(mailParams(), null);
  const before = smtp.mails.length;
  await client().post('/forgot', { email: 'u@example.com' });
  await new Promise((r) => setTimeout(r, 200));
  assert.equal(smtp.mails.length, before, 'писмото тръгна към изключения сървър');
  assert.equal(audits().at(-1).action, 'mail_off');
  // Пробата без поща казва, че пощата не е включена.
  const p = await page();
  assert.match(
    await landed(await admin.post('/admin/poshta/test', { _csrf: p.csrf })),
    /не е включена/
  );
});

// ── Ревю на Кодаджията (14.11.2026) ─────────────────────────────────────────
await test('вътрешни адреси се разпознават (защита от SSRF през DNS в продукция)', () => {
  for (const ip of [
    '127.0.0.1',
    '10.1.2.3',
    '172.20.0.1',
    '192.168.1.1',
    '169.254.169.254',
    '100.64.0.1',
    '0.0.0.0',
    '::1',
    '::',
    'fd00::1',
    'fe80::1',
    '::ffff:127.0.0.1',
  ])
    assert.equal(privateAddress(ip), true, ip);
  for (const ip of ['1.1.1.1', '185.107.232.10', '2a01:4f8::1', '172.32.0.1'])
    assert.equal(privateAddress(ip), false, ip);
});

await test('празен ключ + сменен междувременно сървър → отказ в транзакцията', () => {
  const me = { id: 1, email: ADMIN };
  assert.throws(
    () =>
      saveMail(me, {
        host: 'drug.example.com',
        port: 2525,
        username: '8a1b2c@smtp-brevo.com',
        password: null,
        from_name: 'Vizitka',
        from_email: 'no-reply@vizitka-bg.com',
      }),
    MailConflictError
  );
  assert.equal(row().host, 'localhost');
});

await test('грешка във формата не изгаря кода за 2FA', async () => {
  const secret = generateSecret();
  db.prepare(
    'UPDATE users SET totp_secret = ?, totp_enabled = 1, totp_last_step = ? WHERE email = ?'
  ).run(encryptSecret(secret), currentStep() - 2, ADMIN);
  const code = hotp(secret, currentStep());
  const bad = await save({ host: 'лош сървър', code });
  assert.equal(bad.status, 422);
  assert.equal(
    db.prepare('SELECT totp_last_step FROM users WHERE email = ?').get(ADMIN).totp_last_step,
    currentStep() - 2,
    'кодът е изразходван'
  );
  assert.equal((await save({ code })).status, 303, 'същият код трябва да важи');
  assert.equal((await save({ code })).status, 422, 'но само веднъж');
});

server.close();
fake.close();
if (failures) {
  console.error(`\n${failures} провалени теста`);
  process.exit(1);
}
console.log('\nПоща от админ панела: всички тестове минаха');
