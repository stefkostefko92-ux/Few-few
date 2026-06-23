// End-to-end smoke тест без външни зависимости: регистрация със съгласие, CSRF,
// криптиране, потвърждение на имейл, нулиране на парола, 2FA, износ и изтриване.
import assert from 'node:assert';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { authenticator } from 'otplib';

process.env.NODE_ENV = 'test';
process.env.DB_PATH = join(mkdtempSync(join(tmpdir(), 'medqr-')), 'test.sqlite');

const { default: app } = await import('../src/server.js');
const { db } = await import('../src/db.js');
const { decrypt } = await import('../src/crypto.js');
const { getByUserId } = await import('../src/profiles.js');
const { outbox } = await import('../src/mailer.js');
const { verifyAuditChain } = await import('../src/audit.js');

const server = app.listen(0);
const base = `http://localhost:${server.address().port}`;

let pass = 0;
const ok = (name) => {
  console.log(`  ✓ ${name}`);
  pass++;
};

const jar = new Map();
function storeCookies(res) {
  for (const c of res.headers.getSetCookie()) {
    const [pair] = c.split(';');
    const idx = pair.indexOf('=');
    const k = pair.slice(0, idx).trim();
    const v = pair.slice(idx + 1).trim();
    if (v === '') jar.delete(k);
    else jar.set(k, v);
  }
}
const cookieHeader = () => [...jar].map(([k, v]) => `${k}=${v}`).join('; ');
const csrf = () => jar.get('csrf');

async function req(path, { method = 'GET', body, csrfToken } = {}) {
  const headers = {};
  if (jar.size) headers.cookie = cookieHeader();
  let payload;
  if (body) {
    headers['content-type'] = 'application/x-www-form-urlencoded';
    const params = new URLSearchParams(body);
    if (csrfToken !== null) params.set('_csrf', csrfToken ?? csrf());
    payload = params.toString();
  }
  const res = await fetch(base + path, { method, headers, body: payload, redirect: 'manual' });
  storeCookies(res);
  return res;
}

// Извлича токена от последния имейл с дадена тема (verify-email или reset).
function tokenFromMail(subjectIncludes) {
  const mail = [...outbox].reverse().find((m) => m.subject.includes(subjectIncludes));
  const m = mail && mail.text.match(/\/(?:verify-email|reset)\/(\S+)/);
  return m ? m[1] : null;
}

let password = 'parola1234';

try {
  // 1. Начало (csrf бисквитка)
  let r = await req('/');
  assert.equal(r.status, 200);
  assert.ok(csrf());
  ok('началната страница се зарежда и задава CSRF токен');

  // 2. Регистрация без съгласие -> отказ
  r = await req('/register', {
    method: 'POST',
    body: { full_name: 'Иван Тестов', email: 'ivan@test.bg', password },
  });
  assert.equal(r.status, 400);
  ok('регистрация без съгласие се отхвърля');

  // 3. Регистрация със съгласие
  r = await req('/register', {
    method: 'POST',
    body: { full_name: 'Иван Тестов', email: 'ivan@test.bg', password, consent: 'on' },
  });
  assert.equal(r.status, 302);
  assert.ok(jar.get('sid'));
  ok('регистрацията със съгласие създава сесия');

  const user = db.prepare("SELECT * FROM users WHERE email = 'ivan@test.bg'").get();
  const rawProfile = db.prepare('SELECT * FROM profiles WHERE user_id = ?').get(user.id);

  // 4. Криптиране в покой
  assert.notEqual(rawProfile.full_name, 'Иван Тестов');
  assert.equal(getByUserId(user.id).full_name, 'Иван Тестов');
  ok('full_name е криптиран в покой и се декриптира коректно');

  // 5. Потвърждение на имейл
  assert.equal(user.email_verified, 0);
  const verifyToken = tokenFromMail('Потвърдете имейла');
  assert.ok(verifyToken, 'имейл за потвърждение е изпратен');
  r = await req(`/verify-email/${verifyToken}`);
  assert.equal(r.status, 200);
  assert.equal(
    db.prepare('SELECT email_verified FROM users WHERE id = ?').get(user.id).email_verified,
    1
  );
  ok('имейлът се потвърждава през линка');

  // 6. CSRF: грешен токен -> 403
  r = await req('/profile/edit', {
    method: 'POST',
    body: { full_name: 'Хакер' },
    csrfToken: 'грешен',
  });
  assert.equal(r.status, 403);
  ok('заявка с грешен CSRF токен се отхвърля (403)');

  // 7. Запис на медицински данни
  r = await req('/profile/edit', {
    method: 'POST',
    body: {
      full_name: 'Иван Тестов',
      blood_type: 'A Rh+',
      allergies: 'пеницилин',
      chronic_conditions: 'диабет',
      hearing_status: 'Глух/а',
      communication_pref: 'писмено',
      can_speak: 'Не мога да говоря',
      sign_language: 'Български жестов език',
      emergency_contact_name: 'Мария',
      emergency_contact_phone: '+359888123456',
      emergency_contact_email: 'maria@test.bg',
      notify_on_scan: 'on',
    },
  });
  assert.equal(r.status, 302);
  ok('медицинските данни се записват');

  // 8. Dashboard
  assert.ok((await (await req('/dashboard')).text()).includes('A Rh+'));
  ok('dashboard показва записаните данни');

  // 8б. SOS страница и сигнал до близък (задействан от потребителя)
  assert.ok((await (await req('/sos')).text()).includes('Обадете се на 112'));
  const sosRes = await fetch(`${base}/sos/alert`, {
    method: 'POST',
    headers: { cookie: cookieHeader(), 'content-type': 'application/json', 'x-csrf-token': csrf() },
    body: JSON.stringify({ lat: 42.7, lng: 23.32 }),
  });
  assert.equal(sosRes.status, 200);
  await new Promise((r) => setTimeout(r, 100)); // имейлът се праща неблокиращо
  const sosMail = [...outbox].reverse().find((m) => m.subject.startsWith('SOS'));
  assert.ok(sosMail && sosMail.to === 'maria@test.bg', 'SOS имейл до близкия е изпратен');
  ok('SOS страницата работи и уведомява близкия с местоположение');

  // 9. QR PNG
  assert.equal((await req('/qr.png')).headers.get('content-type'), 'image/png');
  ok('QR кодът се генерира като PNG');

  // 10. Износ на данни
  assert.ok((await (await req('/profile/export.json')).text()).includes('Иван Тестов'));
  ok('износът на данни връща JSON с профила');

  // 11. Спешен достъп
  const emerg = await (await req(`/e/${rawProfile.emergency_token}`)).text();
  assert.ok(
    emerg.includes('пеницилин') && emerg.includes('Глух/а') && emerg.includes('+359888123456')
  );
  ok('спешният изглед показва декриптираните критични данни');

  // 11б. Близкият е автоматично уведомен (без дублиране в рамките на прозореца)
  const settle = () => new Promise((r) => setTimeout(r, 100)); // известието се праща неблокиращо
  const notif = () =>
    outbox.filter((m) => m.subject.includes('профилът на') && m.to === 'maria@test.bg').length;
  await settle();
  assert.equal(notif(), 1, 'изпратено е едно известие до близкия');
  await req(`/e/${rawProfile.emergency_token}`); // повторно отваряне
  await settle();
  assert.equal(notif(), 1, 'повторното отваряне не дублира известието');
  ok('близкият се уведомява при отваряне (с анти-спам прозорец)');

  // 11в. Споделяне на местоположение (JSON + CSRF заглавие), с радиус на точност
  const locRes = await fetch(`${base}/e/${rawProfile.emergency_token}/locate`, {
    method: 'POST',
    headers: {
      cookie: cookieHeader(),
      'content-type': 'application/json',
      'x-csrf-token': csrf(),
    },
    body: JSON.stringify({ lat: 42.6977, lng: 23.3219, accuracy: 12.4 }),
  });
  assert.equal(locRes.status, 200);
  await settle();
  const locMail = [...outbox].reverse().find((m) => m.subject.startsWith('Местоположение'));
  assert.ok(locMail && locMail.to === 'maria@test.bg', 'имейл с локация е изпратен');
  assert.ok(locMail.text.includes('42.69770') && locMail.text.includes('23.32190'));
  assert.ok(locMail.text.includes('±12 м'), 'точността е включена в имейла');
  // невалидни координати се отхвърлят
  const badLoc = await fetch(`${base}/e/${rawProfile.emergency_token}/locate`, {
    method: 'POST',
    headers: { cookie: cookieHeader(), 'content-type': 'application/json', 'x-csrf-token': csrf() },
    body: JSON.stringify({ lat: 999, lng: 0 }),
  });
  assert.equal(badLoc.status, 400);
  ok('споделянето на местоположение праща координати + точност и валидира входа');

  // 12. Журнал
  assert.ok(
    db.prepare('SELECT COUNT(*) c FROM access_log WHERE profile_id = ?').get(rawProfile.id).c >= 1
  );
  ok('достъпът се записва в журнала');

  // 13. Невалиден токен -> 404
  assert.equal((await req('/e/nevaliden')).status, 404);
  ok('невалиден токен връща 404');

  // 14. Нулиране на парола
  await req('/forgot', { method: 'POST', body: { email: 'ivan@test.bg' } });
  const resetToken = tokenFromMail('Нулиране на парола');
  assert.ok(resetToken, 'имейл за нулиране е изпратен');
  assert.equal((await req(`/reset/${resetToken}`)).status, 200);
  password = 'novaParola2026';
  r = await req(`/reset/${resetToken}`, { method: 'POST', body: { password, confirm: password } });
  assert.equal(r.status, 200);
  // старите сесии са обезсилени; влизаме с новата парола
  jar.delete('sid');
  r = await req('/login', { method: 'POST', body: { email: 'ivan@test.bg', password } });
  assert.equal(r.headers.get('location'), '/dashboard');
  ok('паролата се нулира и входът с новата парола работи');

  // 15. Argon2id: паролата вече е с argon2 хеш след регистрация/нулиране
  assert.ok(
    db
      .prepare('SELECT password_hash p FROM users WHERE id = ?')
      .get(user.id)
      .p.startsWith('$argon2')
  );
  ok('паролите се хешират с Argon2id');

  // 16. 2FA включване -> показва резервни кодове
  await req('/profile/2fa/init', { method: 'POST', body: {} });
  const secret = decrypt(
    db.prepare('SELECT totp_secret FROM users WHERE id = ?').get(user.id).totp_secret
  );
  r = await req('/profile/2fa/enable', {
    method: 'POST',
    body: { code: authenticator.generate(secret) },
  });
  assert.equal(r.status, 200);
  const html16 = await r.text();
  const codes = [...html16.matchAll(/<code>([0-9a-f]{5}-[0-9a-f]{5})<\/code>/g)].map((m) => m[1]);
  assert.ok(codes.length === 10, 'показани са 10 резервни кода');
  ok('2FA се включва и генерира резервни кодове');

  // 17. Вход с 2FA (TOTP)
  await req('/logout', { method: 'POST', body: {} });
  r = await req('/login', { method: 'POST', body: { email: 'ivan@test.bg', password } });
  assert.equal(r.headers.get('location'), '/2fa');
  r = await req('/2fa', { method: 'POST', body: { code: authenticator.generate(secret) } });
  assert.equal(r.headers.get('location'), '/dashboard');
  ok('входът изисква и приема TOTP код');

  // 18. Вход с резервен код (еднократен)
  await req('/logout', { method: 'POST', body: {} });
  await req('/login', { method: 'POST', body: { email: 'ivan@test.bg', password } });
  r = await req('/2fa', { method: 'POST', body: { code: codes[0] } });
  assert.equal(r.headers.get('location'), '/dashboard');
  // същият код втори път не работи
  await req('/logout', { method: 'POST', body: {} });
  await req('/login', { method: 'POST', body: { email: 'ivan@test.bg', password } });
  r = await req('/2fa', { method: 'POST', body: { code: codes[0] } });
  assert.equal(r.status, 401);
  ok('резервен код работи еднократно');

  // 19. Целостта на одит веригата
  assert.equal(verifyAuditChain().ok, true);
  ok('одит веригата е с ненарушена цялост');

  // 20. Защитен маршрут изисква вход
  jar.clear();
  await req('/');
  assert.equal((await req('/dashboard')).status, 302);
  ok('dashboard пренасочва неавтентикиран потребител');

  console.log(`\n${pass} проверки минаха успешно.`);
  server.close();
  process.exit(0);
} catch (err) {
  console.error('\n✗ Тестът се провали:', err);
  server.close();
  process.exit(1);
}
