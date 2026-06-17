// Минимален smoke тест без външни зависимости: стартира сървъра на временна БД,
// минава през регистрация -> редакция -> спешен достъп през токена.
import assert from 'node:assert';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.NODE_ENV = 'test';
process.env.DB_PATH = join(mkdtempSync(join(tmpdir(), 'medqr-')), 'test.sqlite');

const { default: app } = await import('../src/server.js');
const { db } = await import('../src/db.js');

const server = app.listen(0);
const base = `http://localhost:${server.address().port}`;

let pass = 0;
function ok(name) { console.log(`  ✓ ${name}`); pass++; }

// Помощник, който пази бисквитката от сесията.
async function req(path, { method = 'GET', body, cookie, redirect = 'manual' } = {}) {
  const headers = {};
  if (body) headers['content-type'] = 'application/x-www-form-urlencoded';
  if (cookie) headers['cookie'] = cookie;
  return fetch(base + path, {
    method,
    headers,
    body: body ? new URLSearchParams(body).toString() : undefined,
    redirect,
  });
}

try {
  // 1. Начало
  let r = await req('/');
  assert.equal(r.status, 200);
  ok('началната страница се зарежда');

  // 2. Регистрация
  r = await req('/register', {
    method: 'POST',
    body: { full_name: 'Иван Тестов', email: 'ivan@test.bg', password: 'parola1234' },
  });
  assert.equal(r.status, 302);
  const cookie = r.headers.get('set-cookie').split(';')[0];
  assert.ok(cookie.startsWith('sid='));
  ok('регистрацията създава сесия');

  // 3. Профилът съществува с токен
  const profile = db.prepare("SELECT * FROM profiles WHERE full_name = 'Иван Тестов'").get();
  assert.ok(profile.emergency_token.length > 20);
  ok('създаден е профил със спешен токен');

  // 4. Редакция на медицинските данни
  r = await req('/profile/edit', {
    method: 'POST',
    cookie,
    body: {
      full_name: 'Иван Тестов',
      blood_type: 'A Rh+',
      allergies: 'пеницилин',
      chronic_conditions: 'диабет',
      hearing_status: 'Глух/а',
      communication_pref: 'писмено',
      emergency_contact_name: 'Мария',
      emergency_contact_phone: '+359888123456',
    },
  });
  assert.equal(r.status, 302);
  ok('медицинските данни се записват');

  // 5. Достъп до dashboard
  r = await req('/dashboard', { cookie });
  assert.equal(r.status, 200);
  const dash = await r.text();
  assert.ok(dash.includes('A Rh+'));
  ok('dashboard показва записаните данни');

  // 6. QR PNG се генерира
  r = await req('/qr.png', { cookie });
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('content-type'), 'image/png');
  ok('QR кодът се генерира като PNG');

  // 7. Спешен достъп през токена (без вход)
  r = await req(`/e/${profile.emergency_token}`);
  assert.equal(r.status, 200);
  const emerg = await r.text();
  assert.ok(emerg.includes('пеницилин'));
  assert.ok(emerg.includes('Глух/а'));
  assert.ok(emerg.includes('+359888123456'));
  ok('спешният изглед показва критичните данни');

  // 8. Достъпът е регистриран в журнала
  const logCount = db.prepare('SELECT COUNT(*) c FROM access_log WHERE profile_id = ?').get(profile.id).c;
  assert.ok(logCount >= 1);
  ok('достъпът се записва в журнала');

  // 9. Невалиден токен -> 404
  r = await req('/e/nesynesto-nevaliden-token');
  assert.equal(r.status, 404);
  ok('невалиден токен връща 404');

  // 10. Защитен маршрут изисква вход
  r = await req('/dashboard');
  assert.equal(r.status, 302);
  ok('dashboard пренасочва неавтентикиран потребител');

  console.log(`\n${pass} проверки минаха успешно.`);
  server.close();
  process.exit(0);
} catch (err) {
  console.error('\n✗ Тестът се провали:', err.message);
  server.close();
  process.exit(1);
}
