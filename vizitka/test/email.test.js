// Имейлът на акаунта: потвърждаване при регистрация, смяна на имейла (връзка до НОВИЯ адрес +
// известие до стария) и писма за сигурност при важни промени. Писмата се четат от dev кутията
// (mailer.outbox) — както ги вижда човекът.
//
// Спецификация (приемни критерии):
//  1. Регистрацията праща писмо с връзка за потвърждаване; докато не е потвърден, таблото и
//     настройките го казват; връзката важи веднъж; „Изпрати пак“ прави старата невалидна.
//  2. Смяната на имейла иска паролата (и код при 2FA). Нищо не се сменя до натискане на
//     връзката, пратена до НОВИЯ адрес; старият адрес получава известие още при заявката.
//     След потвърждаване входът е с новия имейл, а старият получава „имейлът е сменен“.
//  3. Зает адрес → същият отговор като при свободен и НИКАКВО писмо с връзка (без изброяване
//     на акаунти); ако адресът бъде зает между заявката и потвърждаването — отказ, без смяна.
//  4. Резервиран за админ имейл (ADMIN_EMAILS) не може да се вземе със смяна (seedAdmins би дал
//     админ права при следващ старт).
//  5. Писма за сигурност до текущия имейл: смяна на паролата, включено/изключено 2FA, нови
//     резервни кодове, изтрит акаунт.
//  6. Изтеглянето на данните съдържа дали имейлът е потвърден.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import { join } from 'node:path';

process.env.NODE_ENV = 'test';
process.env.DATA_DIR = fs.mkdtempSync(join(os.tmpdir(), 'vizitka-email-'));
process.env.PRINT_API_SECRET = 'test-print-secret-0123456789abcdef';
process.env.AUTH_RATE_LIMIT = '500';
process.env.ADMIN_EMAILS = 'shef@vizitka.test';

const { default: app } = await import('../src/app.js');
const { default: db } = await import('../src/db.js');
const { outbox } = await import('../src/mailer.js');
const { hotp, currentStep } = await import('../src/totp.js');

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
  return { request, post, jar };
}
const csrfOf = (html) => html.match(/name="_csrf" value="([a-f0-9]+)"/)?.[1] || '';
const mailsTo = (to) => outbox.filter((m) => m.to === to);
const lastMailTo = (to) => mailsTo(to).at(-1);
const linkIn = (mail, path) =>
  mail?.text.match(
    new RegExp(`https?://[^\\s]+${path.replace('/', '\\/')}\\?token=[a-f0-9]{64}`)
  )?.[0];
const pathOf = (url) => url.replace(/^https?:\/\/[^/]+/, '');

// Връзката от писмото: GET показва бутон (скенерите на пощата не сменят нищо), POST действа.
async function follow(url) {
  const path = pathOf(url);
  const page = await fetch(base + path);
  if (page.status !== 200) return page;
  assert.match(await page.text(), /<form method="post"/, 'GET трябва да показва бутон');
  const token = new URL(base + path).searchParams.get('token');
  return fetch(base + path.split('?')[0], {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', origin: base },
    body: new URLSearchParams({ token }).toString(),
    redirect: 'manual',
  });
}

async function register(c, email, password = 'parola-dulga-1') {
  const res = await c.post('/register', { name: 'Тест Тестов', email, password });
  assert.equal(res.status, 302);
  return password;
}
async function settings(c) {
  const html = await (await c.request('/settings')).text();
  return { html, csrf: csrfOf(html) };
}
async function login(email, password) {
  const c = client();
  const res = await c.post('/login', { email, password });
  return { c, res };
}

// ── 1. Потвърждаване ─────────────────────────────────────────────────────────
const A = 'ana@example.com';
const a = client();
const PW = await register(a, A);

await test('регистрацията праща писмо с връзка за потвърждаване', async () => {
  const mail = lastMailTo(A);
  assert.ok(mail, 'няма писмо');
  assert.match(mail.subject, /Потвърди/);
  assert.ok(linkIn(mail, '/verify-email'), 'няма връзка /verify-email?token=');
});

await test('непотвърден имейл: таблото и настройките го казват', async () => {
  const dash = await (await a.request('/dashboard')).text();
  assert.match(dash, /data-email-unverified/);
  const { html } = await settings(a);
  assert.match(html, /Непотвърден/);
});

await test('„Изпрати пак“ прави старата връзка невалидна; новата потвърждава веднъж', async () => {
  const old = linkIn(lastMailTo(A), '/verify-email');
  const { csrf } = await settings(a);
  const res = await a.post('/settings/email/verify', { _csrf: csrf });
  assert.equal(res.status, 302);
  const fresh = linkIn(lastMailTo(A), '/verify-email');
  assert.ok(fresh && fresh !== old);
  assert.equal((await follow(old)).status, 400);
  // Връзката работи и без вход (отворена от пощата на телефона).
  const ok = await follow(fresh);
  assert.equal(ok.status, 200);
  assert.match(await ok.text(), /Имейлът е потвърден/);
  assert.equal((await follow(fresh)).status, 400, 'втори път');
  const row = db.prepare('SELECT email_verified_at FROM users WHERE email = ?').get(A);
  assert.ok(row.email_verified_at);
  const dash = await (await a.request('/dashboard')).text();
  assert.doesNotMatch(dash, /data-email-unverified/);
});

await test('невалиден/подправен токен → 400', async () => {
  assert.equal((await fetch(`${base}/verify-email?token=${'a'.repeat(64)}`)).status, 400);
  assert.equal((await fetch(`${base}/verify-email?token=../../x`)).status, 400);
});

// ── 2. Смяна на имейла ───────────────────────────────────────────────────────
const A2 = 'ana.nova@example.com';

await test('смяна с грешна парола → отказ, нищо не се праща', async () => {
  const before = outbox.length;
  const { csrf } = await settings(a);
  const res = await a.post('/settings/email', { _csrf: csrf, new_email: A2, password: 'greshna' });
  assert.equal(res.status, 400);
  assert.equal(outbox.length, before);
});

await test('смяна: връзка до НОВИЯ адрес, известие до стария, имейлът още е стар', async () => {
  const { csrf } = await settings(a);
  const res = await a.post('/settings/email', { _csrf: csrf, new_email: A2, password: PW });
  assert.equal(res.status, 200);
  assert.match(await res.text(), /Изпратихме връзка/);
  assert.ok(linkIn(lastMailTo(A2), '/settings/email/confirm'), 'няма връзка до новия адрес');
  assert.match(lastMailTo(A).subject, /смяна на имейла/i);
  assert.doesNotMatch(lastMailTo(A).text, /token=/, 'старият адрес НЕ получава връзката');
  assert.equal(db.prepare('SELECT email FROM users WHERE email = ?').get(A)?.email, A);
  assert.equal((await login(A, PW)).res.headers.get('location'), '/dashboard');
});

await test('потвърждаване: входът е с новия имейл, старият получава „сменен“', async () => {
  const link = linkIn(lastMailTo(A2), '/settings/email/confirm');
  const res = await follow(link);
  assert.equal(res.status, 200);
  assert.match(await res.text(), /Имейлът е сменен/);
  assert.equal((await login(A2, PW)).res.headers.get('location'), '/dashboard');
  assert.equal((await login(A, PW)).res.status, 401);
  assert.match(lastMailTo(A).subject, /Имейлът .*е сменен/i);
  const row = db.prepare('SELECT email_verified_at FROM users WHERE email = ?').get(A2);
  assert.ok(row.email_verified_at, 'новият адрес е потвърден с натискането');
  assert.equal((await follow(link)).status, 400, 'втори път');
});

// ── 3. Зает адрес и надпревара ───────────────────────────────────────────────
const B = 'boris@example.com';
const b = client();
await register(b, B);

await test('зает адрес: същият отговор, без писмо с връзка до никого', async () => {
  const before = mailsTo(A2).length;
  const { csrf } = await settings(b);
  const res = await b.post('/settings/email', {
    _csrf: csrf,
    new_email: A2,
    password: 'parola-dulga-1',
  });
  assert.equal(res.status, 200);
  assert.match(await res.text(), /Изпратихме връзка/);
  assert.equal(mailsTo(A2).length, before, 'писмо до заетия адрес');
});

await test('адресът е зает между заявката и потвърждаването → отказ, без смяна', async () => {
  const C = 'cveti@example.com';
  const { csrf } = await settings(b);
  await b.post('/settings/email', { _csrf: csrf, new_email: C, password: 'parola-dulga-1' });
  const link = linkIn(lastMailTo(C), '/settings/email/confirm');
  await register(client(), C); // някой друг се регистрира с адреса
  const res = await follow(link);
  assert.equal(res.status, 409);
  assert.ok(db.prepare('SELECT 1 FROM users WHERE email = ?').get(B), 'Борис запазва имейла си');
});

// ── 4. Резервиран за админ ───────────────────────────────────────────────────
await test('резервиран за админ имейл не се взема със смяна', async () => {
  const before = mailsTo('shef@vizitka.test').length;
  const { csrf } = await settings(b);
  const res = await b.post('/settings/email', {
    _csrf: csrf,
    new_email: 'Shef@Vizitka.test',
    password: 'parola-dulga-1',
  });
  assert.equal(res.status, 400);
  assert.equal(mailsTo('shef@vizitka.test').length, before);
});

await test('невалиден или същият имейл → отказ', async () => {
  const { csrf } = await settings(b);
  for (const new_email of ['не-е-имейл', B, B.toUpperCase()]) {
    const res = await b.post('/settings/email', {
      _csrf: csrf,
      new_email,
      password: 'parola-dulga-1',
    });
    assert.equal(res.status, 400, new_email);
  }
});

// ── 2FA при смяна ────────────────────────────────────────────────────────────
const D = 'dimo@example.com';
const d = client();
const DPW = await register(d, D);
let secret = '';
await test('при включено 2FA смяната иска и код', async () => {
  let { csrf } = await settings(d);
  const setup = await (await d.post('/settings/2fa/setup', { _csrf: csrf })).text();
  secret = setup.match(/([A-Z2-7]{4}(?: [A-Z2-7]{4}){7})/)[1].replace(/ /g, '');
  ({ csrf } = await settings(d));
  const on = await d.post('/settings/2fa/enable', {
    _csrf: csrf,
    code: hotp(secret, currentStep()),
  });
  assert.equal(on.status, 200);
  assert.match(lastMailTo(D).subject, /Двуфакторното влизане е включено/);
  ({ csrf } = await settings(d));
  const before = outbox.length;
  const no = await d.post('/settings/email', {
    _csrf: csrf,
    new_email: 'dimo2@example.com',
    password: DPW,
  });
  assert.equal(no.status, 400);
  assert.equal(outbox.length, before);
  db.prepare('UPDATE users SET totp_last_step = ? WHERE email = ?').run(currentStep() - 2, D);
  const yes = await d.post('/settings/email', {
    _csrf: csrf,
    new_email: 'dimo2@example.com',
    password: DPW,
    code: hotp(secret, currentStep()),
  });
  assert.equal(yes.status, 200);
  assert.ok(linkIn(lastMailTo('dimo2@example.com'), '/settings/email/confirm'));
});

// ── 5. Писма за сигурност ────────────────────────────────────────────────────
await test('писма за сигурност: парола, 2FA изключено, нови резервни кодове', async () => {
  let { csrf } = await settings(d);
  db.prepare('UPDATE users SET totp_last_step = ? WHERE email = ?').run(currentStep() - 2, D);
  await d.post('/settings/2fa/recovery', {
    _csrf: csrf,
    password: DPW,
    code: hotp(secret, currentStep()),
  });
  assert.match(lastMailTo(D).subject, /Нови резервни кодове/);
  ({ csrf } = await settings(d));
  db.prepare('UPDATE users SET totp_last_step = ? WHERE email = ?').run(currentStep() - 2, D);
  await d.post('/settings/2fa/disable', {
    _csrf: csrf,
    password: DPW,
    code: hotp(secret, currentStep()),
  });
  assert.match(lastMailTo(D).subject, /Двуфакторното влизане е изключено/);
  ({ csrf } = await settings(d));
  await d.post('/settings/password', {
    _csrf: csrf,
    current_password: DPW,
    new_password: 'nova-parola-22',
  });
  assert.match(lastMailTo(D).subject, /Паролата .*е сменена/);
  // Писмата за сигурност не носят тайни: нито паролата, нито кодове.
  for (const m of mailsTo(D)) assert.doesNotMatch(m.text, /nova-parola-22|parola-dulga-1/);
});

// ── 6. Изтегляне ─────────────────────────────────────────────────────────────
await test('изтеглянето съдържа дали имейлът е потвърден', async () => {
  const res = await a.request('/settings/export');
  assert.equal(res.status, 200);
  const buf = Buffer.from(await res.arrayBuffer());
  assert.match(buf.toString('utf8'), /"email_verified_at":\s*"\d{4}-/);
});

await test('изтрит акаунт → писмо за потвърждение до имейла му', async () => {
  const E = 'emil@example.com';
  const e = client();
  const EPW = await register(e, E);
  const slug = db
    .prepare('SELECT slug FROM profiles p JOIN users u ON u.id = p.user_id WHERE u.email = ?')
    .get(E).slug;
  const { csrf } = await settings(e);
  const res = await e.post('/settings/delete', { _csrf: csrf, confirm: slug, password: EPW });
  assert.equal(res.status, 200);
  assert.match(lastMailTo(E).subject, /Акаунтът .*е изтрит/);
});

// ── 7. Ревю (Кодаджията, 14.11.2026): висяща смяна и скенери на връзки ─────
async function pendingChange(c, from, to, pw = 'parola-dulga-1') {
  const { csrf } = await settings(c);
  await c.post('/settings/email', { _csrf: csrf, new_email: to, password: pw });
  const link = linkIn(lastMailTo(to), '/settings/email/confirm');
  assert.ok(link, `няма връзка до ${to}`);
  return link;
}

await test('GET на връзката (скенер на пощата) не сменя нищо', async () => {
  const G = 'gosho@example.com';
  const g = client();
  await register(g, G);
  const link = await pendingChange(g, G, 'gosho2@example.com');
  const page = await fetch(base + pathOf(link));
  assert.equal(page.status, 200);
  assert.ok(db.prepare('SELECT 1 FROM users WHERE email = ?').get(G), 'имейлът се смени от GET');
  assert.equal((await follow(link)).status, 200, 'връзката още важи за човека');
  const v = linkIn(
    mailsTo(G).find((m) => /verify-email/.test(m.text)),
    '/verify-email'
  );
  await fetch(base + pathOf(v));
  // Потвърждаването на стария адрес вече не важи — имейлът е сменен.
  assert.equal((await follow(v)).status, 400);
});

await test('нулиране на паролата анулира висящата смяна на имейла', async () => {
  const H = 'hristo@example.com';
  const h = client();
  await register(h, H);
  const link = await pendingChange(h, H, 'napadatel1@example.com');
  await client().post('/forgot', { email: H });
  const reset = lastMailTo(H).text.match(/\/reset\?token=([a-f0-9]{64})/)[1];
  const r = await client().post('/reset', { token: reset, password: 'nova-parola-33' });
  assert.equal(r.status, 200);
  assert.equal((await follow(link)).status, 400);
  assert.ok(db.prepare('SELECT 1 FROM users WHERE email = ?').get(H));
});

await test('смяна на паролата и „излез от всички“ анулират висящата смяна', async () => {
  const I = 'iva@example.com';
  const i = client();
  await register(i, I);
  let link = await pendingChange(i, I, 'napadatel2@example.com');
  let { csrf } = await settings(i);
  await i.post('/settings/password', {
    _csrf: csrf,
    current_password: 'parola-dulga-1',
    new_password: 'nova-parola-44',
  });
  assert.equal((await follow(link)).status, 400, 'след смяна на паролата');
  link = await pendingChange(i, I, 'napadatel3@example.com', 'nova-parola-44');
  ({ csrf } = await settings(i));
  await i.post('/settings/sessions/revoke-others', { _csrf: csrf });
  assert.equal((await follow(link)).status, 400, 'след „излез от всички“');
});

await test('„Откажи смяната“ анулира връзката; настройките показват висящата смяна', async () => {
  const J = 'joro@example.com';
  const j = client();
  await register(j, J);
  const link = await pendingChange(j, J, 'joro2@example.com');
  const { html, csrf } = await settings(j);
  assert.match(html, /joro2@example\.com/, 'висящата смяна не се вижда');
  const res = await j.post('/settings/email/cancel', { _csrf: csrf });
  assert.equal(res.status, 302);
  assert.equal((await follow(link)).status, 400);
});

server.close();
if (failures) {
  console.error(`\n${failures} провалени теста`);
  process.exit(1);
}
console.log('\nИмейл: всички тестове минаха');
