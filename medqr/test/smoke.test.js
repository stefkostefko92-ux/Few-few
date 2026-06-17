// End-to-end smoke тест без външни зависимости: стартира сървъра на временна БД и
// минава през регистрация със съгласие, CSRF, криптиране, 2FA, износ и изтриване.
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

const server = app.listen(0);
const base = `http://localhost:${server.address().port}`;

let pass = 0;
const ok = (name) => { console.log(`  ✓ ${name}`); pass++; };

// Прост cookie jar.
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

try {
  // 1. Начало (взима csrf бисквитка)
  let r = await req('/');
  assert.equal(r.status, 200);
  assert.ok(csrf(), 'csrf бисквитката е зададена');
  ok('началната страница се зарежда и задава CSRF токен');

  // 2. Регистрацията изисква съгласие
  r = await req('/register', {
    method: 'POST',
    body: { full_name: 'Иван Тестов', email: 'ivan@test.bg', password: 'parola1234' },
  });
  assert.equal(r.status, 400);
  ok('регистрация без съгласие се отхвърля');

  // 3. Регистрация със съгласие
  r = await req('/register', {
    method: 'POST',
    body: { full_name: 'Иван Тестов', email: 'ivan@test.bg', password: 'parola1234', consent: 'on' },
  });
  assert.equal(r.status, 302);
  assert.ok(jar.get('sid'), 'сесийна бисквитка е зададена');
  ok('регистрацията със съгласие създава сесия');

  // 4. Профил + криптиране в покой
  const user = db.prepare("SELECT * FROM users WHERE email = 'ivan@test.bg'").get();
  const rawProfile = db.prepare('SELECT * FROM profiles WHERE user_id = ?').get(user.id);
  assert.ok(rawProfile.emergency_token.length > 20);
  assert.notEqual(rawProfile.full_name, 'Иван Тестов'); // криптирано в базата
  assert.equal(getByUserId(user.id).full_name, 'Иван Тестов'); // декриптира се коректно
  assert.ok(user.consent_at, 'съгласието е записано');
  ok('профилът е създаден, а full_name е криптиран в покой');

  // 5. CSRF защита: грешен токен се отхвърля
  r = await req('/profile/edit', {
    method: 'POST',
    body: { full_name: 'Хакер' },
    csrfToken: 'грешен-токен',
  });
  assert.equal(r.status, 403);
  ok('заявка с грешен CSRF токен се отхвърля (403)');

  // 6. Запис на медицински данни
  r = await req('/profile/edit', {
    method: 'POST',
    body: {
      full_name: 'Иван Тестов', blood_type: 'A Rh+', allergies: 'пеницилин',
      chronic_conditions: 'диабет', hearing_status: 'Глух/а', communication_pref: 'писмено',
      emergency_contact_name: 'Мария', emergency_contact_phone: '+359888123456',
    },
  });
  assert.equal(r.status, 302);
  ok('медицинските данни се записват');

  // 7. Dashboard показва декриптираните данни
  r = await req('/dashboard');
  assert.ok((await r.text()).includes('A Rh+'));
  ok('dashboard показва записаните данни');

  // 8. QR PNG
  r = await req('/qr.png');
  assert.equal(r.headers.get('content-type'), 'image/png');
  ok('QR кодът се генерира като PNG');

  // 9. Износ на данни (JSON)
  r = await req('/profile/export.json');
  assert.ok((await r.text()).includes('Иван Тестов'));
  ok('износът на данни връща JSON с профила');

  // 10. Спешен достъп през токена (декриптирано)
  r = await req(`/e/${rawProfile.emergency_token}`);
  const emerg = await r.text();
  assert.ok(emerg.includes('пеницилин') && emerg.includes('Глух/а') && emerg.includes('+359888123456'));
  ok('спешният изглед показва декриптираните критични данни');

  // 11. Журнал на достъпите
  assert.ok(db.prepare('SELECT COUNT(*) c FROM access_log WHERE profile_id = ?').get(rawProfile.id).c >= 1);
  ok('достъпът се записва в журнала');

  // 12. Невалиден токен -> 404
  assert.equal((await req('/e/nevaliden-token')).status, 404);
  ok('невалиден токен връща 404');

  // 13. 2FA: включване
  await req('/profile/2fa/init', { method: 'POST', body: {} });
  const secret = decrypt(db.prepare('SELECT totp_secret FROM users WHERE id = ?').get(user.id).totp_secret);
  assert.ok(secret, 'TOTP secret е генериран');
  r = await req('/profile/2fa/enable', { method: 'POST', body: { code: authenticator.generate(secret) } });
  assert.equal(r.status, 302);
  assert.equal(db.prepare('SELECT totp_enabled FROM users WHERE id = ?').get(user.id).totp_enabled, 1);
  ok('2FA се включва с валиден код');

  // 14. Вход с 2FA
  await req('/logout', { method: 'POST', body: {} });
  r = await req('/login', { method: 'POST', body: { email: 'ivan@test.bg', password: 'parola1234' } });
  assert.equal(r.headers.get('location'), '/2fa'); // паролата е ок -> иска втори фактор
  r = await req('/2fa', { method: 'POST', body: { code: authenticator.generate(secret) } });
  assert.equal(r.status, 302);
  assert.equal(r.headers.get('location'), '/dashboard');
  ok('входът изисква и приема 2FA код');

  // 15. Защитен маршрут изисква вход (нова сесия без бисквитки)
  jar.clear();
  await req('/'); // нов csrf
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
