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
const { createToken, peekToken } = await import('../src/auth.js');
const { mailName } = await import('../src/notify.js');
const { looksLikeRealVisit } = await import('../src/routes/emergency.js');
import { readFileSync } from 'node:fs';

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
  // Реален браузър (не link-preview бот) — иначе /e/:token не известява близкия.
  const headers = { 'user-agent': 'Mozilla/5.0 (test-browser)' };
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
      allergy_keys: 'penicillin,peanuts',
      chronic_conditions: 'диабет',
      condition_keys: 'diabetes_t1',
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

  // 8a. Здравна проверка (за оркестратора) — публична, без кеширане
  const health = await req('/health');
  assert.equal(health.status, 200);
  assert.equal(health.headers.get('cache-control'), 'no-store');
  const hb = await health.json();
  assert.equal(hb.app, 'medqr', 'маркер за идентичност за deploy гейта');
  assert.equal(hb.ok, true);
  ok('/health връща 200 без кеширане, с идентичност и проверка на базата');

  // 8б. Невалиден имейл за спешен контакт се отхвърля (защита от header injection)
  const badEmail = await req('/profile/edit', {
    method: 'POST',
    body: {
      full_name: 'Иван Тестов',
      emergency_contact_email: 'loš@\nbcc: spam@evil.bg',
    },
  });
  assert.equal(badEmail.status, 400);
  ok('невалиден имейл за спешен контакт се отхвърля');

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

  // 11a. Английски спешен изглед: структурираните клинични данни са преведени
  const emergEn = await (await req(`/e/${rawProfile.emergency_token}?lang=en`)).text();
  assert.ok(
    emergEn.includes('Penicillin') &&
      emergEn.includes('Peanuts') && // няколко алергии се показват
      emergEn.includes('Type 1 diabetes') &&
      emergEn.includes('Deaf') &&
      emergEn.includes('Ivan Testov') && // транслитерирано име (Иван Тестов)
      emergEn.includes('EMERGENCY MEDICAL INFORMATION')
  );
  ok('английският изглед превежда клиничните данни и транслитерира името');

  // 11b. Canonical/hreflang са само-референтни по език (SEO кластер)
  const homeEn = await (await req('/?lang=en')).text();
  assert.ok(
    /rel="canonical" href="[^"]*\?lang=en"/.test(homeEn) &&
      homeEn.includes('hreflang="en"') &&
      homeEn.includes('hreflang="x-default"'),
    'EN страницата има само-референтен canonical и hreflang алтернативи'
  );
  ok('canonical/hreflang са само-референтни по език');

  // 11c. Манифестът предлага PNG + maskable иконки (PWA инсталируемост)
  const manifest = await (await req('/manifest.webmanifest')).json();
  assert.ok(
    manifest.icons.some((i) => i.src === '/icon-512.png' && i.sizes === '512x512') &&
      manifest.icons.some((i) => i.purpose === 'maskable'),
    'манифестът включва 512px PNG и maskable иконка'
  );
  ok('манифестът включва PNG и maskable иконки');

  // 11d. PIN изисква поне 6 цифри (защита от груба сила)
  await req('/profile/pin', { method: 'POST', body: { pin: '1234' } });
  assert.ok(!getByUserId(user.id).pin_hash, 'къс 4-цифрен PIN не се приема');
  await req('/profile/pin', { method: 'POST', body: { pin: '135790' } });
  assert.ok(getByUserId(user.id).pin_hash, '6-цифрен PIN се приема');
  await req('/profile/pin', { method: 'POST', body: { pin: '' } }); // изчистваме за следващите тестове
  assert.ok(!getByUserId(user.id).pin_hash, 'празно поле премахва PIN-а');
  ok('PIN изисква поне 6 цифри');

  // 11б. Близкият е автоматично уведомен (без дублиране в рамките на прозореца)
  const settle = () => new Promise((r) => setTimeout(r, 100)); // известието се праща неблокиращо
  const notif = () =>
    outbox.filter((m) => m.subject.includes('профилът на') && m.to === 'maria@test.bg').length;
  await settle();
  assert.equal(notif(), 1, 'изпратено е едно известие до близкия');
  await req(`/e/${rawProfile.emergency_token}`); // повторно отваряне
  await settle();
  assert.equal(notif(), 1, 'повторното отваряне не дублира известието');
  // Link-preview бот (WhatsApp) не бива да задейства фалшиво „спешно" известие —
  // но показът на данните се записва в журнала (UA е в ръцете на клиента).
  const logged = () =>
    db
      .prepare('SELECT COUNT(*) c FROM access_log WHERE profile_id = ? AND user_agent = ?')
      .get(rawProfile.id, 'WhatsApp/2.23 A').c;
  const botRes = await fetch(`${base}/e/${rawProfile.emergency_token}`, {
    headers: { 'user-agent': 'WhatsApp/2.23 A' },
  });
  assert.equal(botRes.status, 200);
  // Express рутира без значение от регистъра — /E/<token> трябва да носи същото no-store.
  const upper = await fetch(`${base}/E/${rawProfile.emergency_token}`, {
    headers: { 'user-agent': 'curl/8.5' },
  });
  assert.equal(upper.headers.get('cache-control'), 'no-store', '/E/ без no-store');
  await settle();
  assert.equal(notif(), 1, 'бот за link-preview не задейства известие');
  assert.equal(logged(), 1, 'показът при бот-UA също е в журнала');
  ok('близкият се уведомява при отваряне (без дублиране и без бот preview)');

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

  // 11е. PIN: паралелни грешни опити не заобикалят заключването; locate изисква въведен PIN
  const tok = rawProfile.emergency_token;
  const resetWindows = () =>
    db
      .prepare(
        'UPDATE profiles SET pin_attempts = 0, pin_locked_until = NULL, last_notified_at = NULL, last_sos_at = NULL, last_located_at = NULL WHERE user_id = ?'
      )
      .run(user.id);
  await req('/profile/pin', { method: 'POST', body: { pin: '135790' } });
  resetWindows();
  const postPin = (pin) =>
    fetch(`${base}/e/${tok}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        cookie: cookieHeader(),
        'user-agent': 'Mozilla/5.0 (test)',
      },
      body: new URLSearchParams({ pin, _csrf: csrf() }).toString(),
      redirect: 'manual',
    });
  const burst = await Promise.all(Array.from({ length: 12 }, () => postPin('000000')));
  const wrongCount = burst.filter((x) => x.status === 401).length;
  assert.ok(
    wrongCount <= 5,
    `най-много 5 проверени опита при паралелна атака, получени ${wrongCount}`
  );
  assert.equal((await postPin('135790')).status, 429, 'верният PIN е блокиран след заключването');
  ok('паралелни грешни PIN опити не заобикалят заключването');

  resetWindows();
  const locateReq = (extraCookie = '') =>
    fetch(`${base}/e/${tok}/locate`, {
      method: 'POST',
      headers: {
        cookie: cookieHeader() + extraCookie,
        'content-type': 'application/json',
        'x-csrf-token': csrf(),
      },
      body: JSON.stringify({ lat: 42.7, lng: 23.3 }),
    });
  assert.equal((await locateReq()).status, 403, 'locate без PIN е отказан при защитен профил');
  const pinOk = await postPin('135790');
  assert.equal(pinOk.status, 200, 'верният PIN отваря профила');
  const proof = (pinOk.headers.getSetCookie().find((c) => c.startsWith('pinok=')) || '').split(
    ';'
  )[0];
  assert.ok(proof, 'издадена е бисквитка „pinok“');
  assert.equal((await locateReq('; ' + proof)).status, 200, 'locate с доказан PIN минава');
  await req('/profile/pin', { method: 'POST', body: { pin: '' } }); // махаме PIN-а
  resetWindows();
  ok('locate изисква въведен PIN при защитен профил');

  // 11ж. Бот-филтър: истински телефони (напр. CUBOT) не се броят за ботове; unfurler-ите — да
  const ua = (u) => ({ get: () => u });
  assert.equal(
    looksLikeRealVisit(ua('Mozilla/5.0 (Linux; Android 12; CUBOT KingKong) Chrome/120')),
    true
  );
  assert.equal(
    looksLikeRealVisit(ua('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) Safari/604.1')),
    true
  );
  assert.equal(looksLikeRealVisit(ua('WhatsApp/2.23.20 A')), false);
  assert.equal(looksLikeRealVisit(ua('TelegramBot (like TwitterBot)')), false);
  assert.equal(looksLikeRealVisit(ua('Mozilla/5.0 (compatible; Googlebot/2.1)')), false);
  assert.equal(looksLikeRealVisit(ua('')), false);
  ok('бот-филтърът не отрязва истински телефони, но хваща unfurler-и');

  // 11з. Името в писмата е чисто (без нови редове, връзки, прекомерна дължина)
  const dirty = mailName({
    full_name: 'Иван\r\nBcc: x@evil.tld https://evil.tld/phish ' + 'А'.repeat(200),
  });
  assert.ok(
    !/[\r\n]/.test(dirty) && !dirty.includes('http') && dirty.length <= 60,
    'името е почистено'
  );
  ok('името в писмата е очистено от нови редове и връзки');

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

  // 14б. Изтекъл токен НЕ важи (ISO срещу datetime('now') правеше „60 минути“ → ~24 часа)
  const expiredRaw = createToken(user.id, 'reset', -5); // изтекъл преди 5 минути
  assert.equal(peekToken(expiredRaw, 'reset'), null, 'изтекъл токен се отхвърля');
  const freshRaw = createToken(user.id, 'reset', 60);
  assert.equal(peekToken(freshRaw, 'reset'), user.id, 'валиден токен се приема');
  ok('токени с изтекъл срок се отхвърлят (и валидните се приемат)');

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

  // 16б. POST /profile/2fa/init не бива да изключва вече включена 2FA без парола
  const before2fa = db
    .prepare('SELECT totp_secret, totp_enabled FROM users WHERE id = ?')
    .get(user.id);
  await req('/profile/2fa/init', { method: 'POST', body: {} });
  const after2fa = db
    .prepare('SELECT totp_secret, totp_enabled FROM users WHERE id = ?')
    .get(user.id);
  assert.equal(after2fa.totp_enabled, 1, '2FA остава включена');
  assert.equal(after2fa.totp_secret, before2fa.totp_secret, 'секретът не е пренаписан');
  // резервните кодове (a1b2c-3d4e5) трябва да могат да се въведат във формата
  const verifyView = readFileSync(new URL('../src/views/2fa-verify.ejs', import.meta.url), 'utf8');
  assert.ok(!/pattern="\\d\{6\}"/.test(verifyView), 'формата за 2FA не блокира резервни кодове');
  ok('2FA не се изключва без парола; формата приема резервни кодове');

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

  // 19б. „Остани вписан“ преминава и през 2FA → дълготрайна сесия
  await req('/logout', { method: 'POST', body: {} });
  await req('/login', {
    method: 'POST',
    body: { email: 'ivan@test.bg', password, remember: 'on' },
  });
  await req('/2fa', { method: 'POST', body: { code: authenticator.generate(secret) } });
  const sess = db
    .prepare(
      'SELECT long_lived, expires_at FROM sessions WHERE user_id = ? ORDER BY rowid DESC LIMIT 1'
    )
    .get(user.id);
  assert.equal(sess.long_lived, 1, 'сесията е маркирана като дълготрайна');
  const days = (new Date(sess.expires_at).getTime() - Date.now()) / 86400000;
  assert.ok(days > 300, 'дълготрайната сесия е с дълъг срок на валидност');
  ok('„остани вписан“ създава дълготрайна сесия (и през 2FA)');

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
