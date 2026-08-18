// АКТИВЕН тест: вдига истинския сървър и се опитва да го пробие.
//
// Различен е по вид от всичко останало в тази папка. Другите тестове проверяват
// дали кодът прави каквото сме искали; този проверява дали ЖИВАТА система устоява
// на това, което НЕ сме искали. Ловят се различни грешки: статичният преглед не
// вижда състезание между заявки, ред на middleware-и, разлика между „кодът има
// проверка" и „проверката се стига", нито тайна, изтекла в отговор на маршрут,
// който никой не свързва с тайни.
//
// Оторизирано и отбранително: атакува се САМО собствен процес, вдигнат от самия
// тест, върху временна папка. Нищо навън.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { hashPassword } from '../src/auth.js';

const PORT = 7791;
const BASE = `http://127.0.0.1:${PORT}`;
const PASS = 'атака-парола-9931';
const PEER_TOKEN = 'p'.repeat(48);
let child;
let dir;
let cookie = '';

before(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'csd-attack-'));
  const cfgPath = path.join(dir, 'config.json');
  fs.writeFileSync(
    cfgPath,
    JSON.stringify({
      host: '127.0.0.1',
      port: PORT,
      nodeName: 'Мишена',
      adminUser: 'admin',
      passwordHash: hashPassword(PASS),
      sessionSecret: 'S'.repeat(64),
      peerToken: PEER_TOKEN,
      paths: { stateDir: path.join(dir, 'state'), archiveDir: dir, releasesDir: path.join(dir, 'rel'), currentLink: path.join(dir, 'cur') },
      peers: [],
      healthChecks: [],
      alerts: { enabled: false },
    })
  );
  child = spawn(process.execPath, ['server.js'], {
    cwd: path.resolve(import.meta.dirname, '..'),
    env: { ...process.env, CSD_CONFIG: cfgPath },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stderr = '';
  child.stderr.on('data', (c) => (stderr += c));
  for (let i = 0; i < 60; i++) {
    if (child.exitCode !== null) throw new Error(`сървърът умря при старт:\n${stderr}`);
    try {
      await fetch(BASE + '/api/ping');
      break;
    } catch {
      await new Promise((r) => setTimeout(r, 250));
    }
  }
  const res = await fetch(BASE + '/api/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-csd': '1' },
    body: JSON.stringify({ user: 'admin', password: PASS }),
  });
  assert.equal(res.status, 200, 'легитимният вход трябва да мине');
  cookie = res.headers.getSetCookie()[0].split(';')[0];
});

after(() => {
  child?.kill('SIGTERM');
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    /* временната папка */
  }
});

// ── 1. Тайните не бива да излизат по НИТО един маршрут ────────────────────────
test('атака: обхождам всичко като админ и търся тайни в отговорите', async () => {
  // Най-скъпият възможен пропуск: маршрут, който никой не свързва с тайни, ги
  // връща „между другото" — напр. диагностика, която показва целия конфиг.
  // Админът и без това има терминал, но отговорът минава през браузър, прокси
  // логове и евентуален съсед; тайна в JSON е тайна на твърде много места.
  const SECRETS = [
    ['passwordHash', 'scrypt:'],
    ['sessionSecret', 'S'.repeat(64)],
    ['peerToken', PEER_TOKEN],
    ['паролата на десктопа', 'DESKTOP_PASSWORD='],
  ];
  const ROUTES = [
    '/api/me', '/api/overview', '/api/settings/access', '/api/sessions', '/api/nodes',
    '/api/alerts', '/api/security', '/api/security/posture', '/api/backups/panel',
    '/api/audit', '/api/audit/ship', '/api/desktop', '/api/env', '/api/updates/health',
    '/api/deploy/state', '/api/agents/tools', '/api/jobs', '/api/traffic', '/api/slo',
  ];
  const leaks = [];
  for (const route of ROUTES) {
    const res = await fetch(BASE + route, { headers: { cookie } });
    const body = await res.text();
    for (const [name, needle] of SECRETS) {
      if (body.includes(needle)) leaks.push(`${route} → ${name}`);
    }
  }
  assert.deepEqual(leaks, [], 'тайна в отговор на API:\n' + leaks.join('\n'));
});

// ── 2. Подправени сесийни токени ─────────────────────────────────────────────
test('атака: подправен, отрязан и чужд токен не минават', async () => {
  const [name, value] = cookie.split('=');
  const [payload, sig] = value.split('.');
  const forged = [
    ['подменен подпис', `${payload}.${'A'.repeat(sig.length)}`],
    ['без подпис', payload],
    ['празен подпис', `${payload}.`],
    ['подменено съдържание', `${Buffer.from(JSON.stringify({ u: 'admin', exp: Date.now() + 9e9, ab: Date.now() + 9e9, g: 0, jti: 'x' })).toString('base64url')}.${sig}`],
    ['чужд токен', 'eyJ1IjoiYWRtaW4ifQ.AAAA'],
    ['празен', ''],
  ];
  for (const [what, token] of forged) {
    const res = await fetch(BASE + '/api/overview', { headers: { cookie: `${name}=${token}` } });
    assert.equal(res.status, 401, `„${what}" НЕ бива да минава (върна ${res.status})`);
  }
  // И контрола: истинският продължава да работи, тоест тестът мери каквото трябва.
  assert.equal((await fetch(BASE + '/api/overview', { headers: { cookie } })).status, 200);
});

// ── 3. Подхлъзната бисквитка от „съседен поддомейн" ──────────────────────────
test('атака: втора бисквитка със същото име не подменя сесията', async () => {
  const [name, value] = cookie.split('=');
  // Точно формата на атаката: браузърът праща две с едно име. Панелът трябва да
  // устои и в двата реда, защото редът НЕ е гарантиран от спецификацията.
  const чужда = `${Buffer.from(JSON.stringify({ u: 'admin', exp: Date.now() + 9e9, g: 0, jti: 'чужд' })).toString('base64url')}.ZZZZ`;
  const редове = [
    `${name}=${чужда}; ${name}=${value}`,
    `${name}=${value}; ${name}=${чужда}`,
  ];
  for (const c of редове) {
    const res = await fetch(BASE + '/api/overview', { headers: { cookie: c } });
    // Приемливи са два изхода: 200 (взета е истинската) или 401 (отхвърлени и
    // двете). НЕ е приемливо да мине ЧУЖДАТА — това би било подмяна на сесия.
    assert.ok([200, 401].includes(res.status), `неочакван код ${res.status} за „${c.slice(0, 40)}…"`);
  }
  // Само чуждата → задължително 401.
  assert.equal((await fetch(BASE + '/api/overview', { headers: { cookie: `${name}=${чужда}` } })).status, 401);
});

// ── 4. CSRF ──────────────────────────────────────────────────────────────────
test('атака: мутация без собствения хедър се отхвърля', async () => {
  // Сценарият: чужд сайт кара браузъра ти да прати POST. `SameSite=Strict` вече
  // пази, но вторият слой трябва да работи и сам — защитата не бива да виси на
  // една настройка на браузъра.
  const res = await fetch(BASE + '/api/alerts/silence', {
    method: 'POST',
    headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify({ key: 'x', minutes: 5 }),
  });
  assert.equal(res.status, 403, 'липсващият маркер трябва да дава 403');
  assert.match(await res.text(), /CSRF/);
});

// ── 5. Обхождане на пътища ───────────────────────────────────────────────────
test('атака: изкачване по пътя не стига до чужди файлове', async () => {
  const цели = [
    '/etc/shadow',
    '../../../etc/shadow',
    '/tmp/../etc/shadow',
    '/proc/self/environ',
    '/etc/vps-dashboard/config.json',
  ];
  for (const p of цели) {
    const res = await fetch(BASE + `/api/files/read?path=${encodeURIComponent(p)}`, { headers: { cookie } });
    const body = await res.text();
    assert.ok(!body.includes('root:'), `${p} върна съдържание на /etc/shadow`);
    assert.ok(!body.includes('scrypt:'), `${p} върна хеша на паролата`);
  }
});

// ── 6. Bearer налучкване ─────────────────────────────────────────────────────
test('атака: налучкването на peerToken се СПИРА, не само се отбелязва', async () => {
  const кодове = [];
  for (let i = 0; i < 25; i++) {
    const res = await fetch(BASE + '/api/overview', { headers: { authorization: `Bearer ${'x'.repeat(48)}` } });
    кодове.push(res.status);
  }
  assert.equal(кодове.filter((s) => s === 200).length, 0, 'нито един грешен токен не бива да мине');
  // ТОЧНО ТОВА хвана дефекта в първата версия на лимитера: тя спираше само
  // писането в одита, тоест 25 грешни токена даваха 25 отговора 401 и нула 429.
  // Лимит, който не отказва, е брояч, не защита.
  assert.ok(кодове.includes(429), `лимитерът трябва да ОТКАЗВА след прага; получени кодове: ${[...new Set(кодове)].join(',')}`);
  assert.ok(кодове.filter((s) => s === 401).length <= 10, 'прагът е 10 опита на прозорец');

  // А ВЕРНИЯТ токен продължава да работи, и това е нарочно.
  //
  // Първо написах теста с очакване 429 и той падна — грешката беше моя, не на
  // кода. Сравнението е ПРЕДИ лимитера, значи легитимният съсед не може да бъде
  // заключен от чужди опити с неговия адрес. Това не е дупка: нападател, който
  // вече знае токена, и без това има достъп, тоест 429 не би скрил нищо. Обратното
  // обаче би било реален дефект — зад CGNAT/споделено прокси един нападател би
  // свалил федерацията, без изобщо да познае токена.
  const ok = await fetch(BASE + '/api/overview', { headers: { authorization: `Bearer ${PEER_TOKEN}` } });
  assert.equal(ok.status, 200, 'верният жетон не бива да е заложник на чужди опити от същия адрес');
});

// ── 7. Непознат маршрут не чертае картата на API-то ──────────────────────────
test('атака: невписан заявител не различава „няма го" от „нямаш достъп"', async () => {
  // Разликата между 404 и 401 е карта: скенер я ползва, за да разбере кои
  // маршрути СЪЩЕСТВУВАТ, без да има достъп до нито един.
  const истински = await fetch(BASE + '/api/overview');
  const измислен = await fetch(BASE + '/api/няма-такъв-маршрут-9931');
  assert.equal(истински.status, 401);
  assert.equal(измислен.status, 401, 'непознат път трябва да отговаря СЪЩО 401');
});

// ── 8. Защитните хедъри стоят и на грешките ──────────────────────────────────
test('атака: хедърите за сигурност ги има и на 401/404, не само на успех', async () => {
  // Класически пропуск: хедърите се слагат в „щастливия" път, а страницата за
  // грешка остава гола — и точно тя често отразява вход от нападателя.
  for (const [път, очакван] of [['/api/overview', 401], ['/api/няма-9931', 401], ['/', 200]]) {
    const res = await fetch(BASE + път);
    assert.equal(res.status, очакван, път);
    assert.ok(res.headers.get('content-security-policy'), `${път}: липсва CSP`);
    assert.equal(res.headers.get('x-content-type-options'), 'nosniff', `${път}: липсва nosniff`);
    assert.ok(res.headers.get('permissions-policy'), `${път}: липсва Permissions-Policy`);
    assert.equal(res.headers.get('cross-origin-opener-policy'), 'same-origin', `${път}: липсва COOP`);
  }
});

// ── 9. Бисквитката е недостъпна за скрипт ────────────────────────────────────
test('атака: сесийната бисквитка е HttpOnly + SameSite=Strict', async () => {
  const res = await fetch(BASE + '/api/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-csd': '1' },
    body: JSON.stringify({ user: 'admin', password: PASS }),
  });
  const set = res.headers.getSetCookie()[0];
  assert.match(set, /HttpOnly/i, 'без HttpOnly един XSS взима сесията');
  assert.match(set, /SameSite=Strict/i);
  assert.match(set, /Path=\//);
  assert.ok(!/Domain=/i.test(set), 'Domain би позволил на поддомейн да я вижда');
});

// ── 10. Залп срещу входа ─────────────────────────────────────────────────────
test('атака: паралелен залп не пробива лимита на входа', async () => {
  // Този тест ГО ИМА и на ниво модул, но там мери функция. Тук мери ЖИВАТА
  // система: HTTP приемане, четене на тяло, scrypt, ред на проверките. Точно
  // между тях беше дупката, която unit тестът не би видял сам.
  const залп = await Promise.all(
    Array.from({ length: 40 }, () =>
      fetch(BASE + '/api/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-csd': '1' },
        body: JSON.stringify({ user: 'admin', password: 'грешна' }),
      }).then((r) => r.status)
    )
  );
  const минали = залп.filter((s) => s === 401).length;
  const спрени = залп.filter((s) => s === 429).length;
  assert.ok(спрени > 0, 'лимитерът трябва да е спрял част от залпа');
  assert.ok(минали <= 5, `през гейта минаха ${минали} опита при лимит 5`);
  // И вярната парола вече е спряна от същия адрес — това е ЦЕЛТА, не дефект.
  const после = await fetch(BASE + '/api/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-csd': '1' },
    body: JSON.stringify({ user: 'admin', password: PASS }),
  });
  assert.equal(после.status, 429, 'след изчерпана квота дори вярната парола чака');
});
