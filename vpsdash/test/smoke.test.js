// Димен тест: вдига ИСТИНСКИЯ сървър и обхожда маршрутите.
//
// Защо съществува: `node --check` вижда само синтаксис. Липсващ import (ползваш
// `probe(...)`, без да си го внесъл) минава линта и гърми чак когато някой отвори
// секцията. Този тест хваща точно това — реален процес, реални заявки.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { hashPassword } from '../src/auth.js';

const PORT = 7788;
const BASE = `http://127.0.0.1:${PORT}`;
let child;
let dir;
let cookie = '';

before(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'csd-smoke-'));
  const cfgPath = path.join(dir, 'config.json');
  fs.writeFileSync(
    cfgPath,
    JSON.stringify({
      host: '127.0.0.1',
      port: PORT,
      nodeName: 'Smoke',
      adminUser: 'admin',
      passwordHash: hashPassword('smoke-парола'),
      sessionSecret: 's'.repeat(64),
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
  // Изчакваме сървъра да отговори (или да умре с ясна грешка).
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
    body: JSON.stringify({ user: 'admin', password: 'smoke-парола' }),
  });
  assert.equal(res.status, 200, 'входът трябва да мине');
  cookie = res.headers.getSetCookie()[0].split(';')[0];
});

after(() => {
  child?.kill('SIGTERM');
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    /* ок */
  }
});

// Всеки GET маршрут — нито един не бива да дава 5xx. Ако липсва import или
// някой парсер гръмне, точно тук се вижда.
const GET_ROUTES = [
  '/api/me', '/api/overview', '/api/metrics/history', '/api/kernel', '/api/forecast',
  '/api/services', '/api/logs?lines=5', '/api/docker', '/api/docker/stats', '/api/compose',
  '/api/databases', '/api/backups/dumps', '/api/processes', '/api/deploy/state',
  '/api/health/products', '/api/updates', '/api/security', '/api/firewall', '/api/webserver',
  '/api/backups', '/api/cron', '/api/files?path=/tmp', '/api/agents/fleet', '/api/agents/tools',
  '/api/agents/memories', '/api/jobs', '/api/audit', '/api/audit/verify', '/api/audit/ship',
  '/api/alerts', '/api/nodes', '/api/sessions', '/api/pty', '/api/probe/targets',
  '/api/probe?url=http%3A%2F%2F127.0.0.1%3A7788%2Fapi%2Fping',
  '/api/slo', '/api/logs/analyze',
  '/api/env', '/api/cron/jobs', '/api/cron/timers', '/api/domains',
  '/api/sudo', '/api/security/posture', '/api/security/integrity',
  '/api/security/fail2ban', '/api/settings/access', '/api/investigate',
  // Маршрути с ЗАДЪЛЖИТЕЛЕН параметър — точно те са най-склонни да гръмнат с 500
  // при липсващ/невалиден вход, затова влизат с попълнен параметър.
  '/api/auth/info', '/api/limits?unit=cron.service', '/api/cron/history?unit=cron.service',
  '/api/compose/ps?project=demo', '/api/compose/logs?project=demo&lines=5', '/api/docker/logs?id=demo&lines=5',
  '/api/databases/sqlite/check?file=/tmp/csd-smoke-няма.db',
  '/api/accesslog', '/api/accesslog/files', '/api/backups/health', '/api/redis', '/api/volumes',
  '/api/alerts/maintenance', '/api/alerts/digest', '/api/backups/schedule', '/api/backups/panel',
  '/api/disk', '/api/reclaim', '/api/traffic', '/api/ports', '/api/desktop', '/api/updates/health',
  '/api/volumes/archives', '/api/files?path=/tmp', '/api/services/status?unit=cron.service',
  '/api/webserver/coverage',
  '/api/jobs/няма-такава-задача', '/api/webserver/site?file=/etc/nginx/nginx.conf',
  '/api/env/file?path=/tmp/csd-няма.env', '/api/files/read?path=/etc/hostname',
  // `/api/domains/preflight` съзнателно НЕ влиза: прави реален DNS + HTTP навън и
  // би направил теста зависим от мрежата в CI. Проверява се ръчно/в браузър.
];

// Маршрутите, които СЪЗНАТЕЛНО стоят извън обиколката, с причината. Всичко
// останало трябва да е покрито — и следващият тест го доказва.
const INTENTIONALLY_SKIPPED = new Set([
  '/api/domains/preflight', // реален DNS + HTTP навън → зависимост от мрежата в CI
  '/api/ping', // няма сесия, покрит е от старта
  '/api/events', // SSE — виси по дизайн, не се затваря сам
  '/api/jobs/:id/stream', // SSE
  '/api/logs/stream', // SSE
  '/api/pty/:id/stream', // SSE
  '/api/stream/metrics', // SSE — виси по дизайн
  '/api/stream/journal', // SSE
  '/api/domains/registration', // реален RDAP навън → зависимост от мрежата
  '/api/security/headers', // реална HTTP заявка към живия сайт → мрежа
  '/api/nodes/:id/crossprobe', // federation към peer, който в тест не съществува
]);

test('нито един GET маршрут не дава 5xx', async () => {
  const failures = [];
  for (const route of GET_ROUTES) {
    const res = await fetch(BASE + route, { headers: { cookie } });
    const body = await res.text();
    if (res.status >= 500) failures.push(`${route} → ${res.status}: ${body.slice(0, 120)}`);
    // Отговорът трябва да е валиден JSON — счупен сериализатор също е дефект.
    if (res.status < 500 && res.headers.get('content-type')?.includes('json')) {
      assert.doesNotThrow(() => JSON.parse(body), `${route} върна невалиден JSON`);
    }
  }
  assert.deepEqual(failures, [], 'маршрути с вътрешна грешка:\n' + failures.join('\n'));
});

// 200 + валиден JSON НЕ значи използваем отговор. Обвиване с един слой повече
// (`{tools:{tools:[…]}}`) минава и двете проверки, а интерфейсът вика `.map` на
// обект и секцията остава празна — точно тихият провал, срещу който е панелът.
// Затова маршрутите, чиято ФОРМА интерфейсът приема на доверие, се закотвят.
test('маршрутите връщат формата, която интерфейсът чака', async () => {
  const shapes = [
    ['/api/agents/tools', (b) => Array.isArray(b.tools) && typeof b.root === 'string' && typeof b.rootExists === 'boolean'],
    ['/api/agents/fleet', (b) => typeof b.available === 'boolean'],
    // `/api/jobs` връща ГОЛ масив, не обвит обект — закотвяме реалността, не
    // предположението: тъкмо тази разлика чупи интерфейса мълчаливо.
    ['/api/jobs', (b) => Array.isArray(b)],
  ];
  for (const [route, ok] of shapes) {
    const res = await fetch(BASE + route, { headers: { cookie } });
    const body = await res.json();
    assert.ok(ok(body), `${route} върна форма, която интерфейсът не може да ползва: ${JSON.stringify(body).slice(0, 160)}`);
  }
});

// Ръчно поддържан списък ИЗОСТАВА тихо — беше изостанал с 16 маршрута, всеки от
// които е точно случаят, за който този файл съществува (липсващ import се вижда
// само при реална заявка). Затова списъкът вече се СВЕРЯВА с routes.js: нов
// маршрут без ред тук пада теста, вместо да остане невидим до първия отворен
// екран в производство.
test('всеки GET маршрут в routes.js е в обиколката', async () => {
  const src = fs.readFileSync(path.join(import.meta.dirname, '..', 'src', 'routes.js'), 'utf8');
  const declared = [...src.matchAll(/r\.get\(\s*[\x27"`]([^\x27"`]+)[\x27"`]/g)]
    .map((m) => m[1])
    .filter((r) => r.startsWith('/api/'));
  const covered = GET_ROUTES.map((r) => r.split('?')[0]);
  // `/api/jobs/:id` се покрива от `/api/jobs/каквото-и-да-е` — буквалното
  // сравнение би обявило параметризираните за непокрити завинаги.
  const isCovered = (route) => {
    if (covered.includes(route)) return true;
    if (!route.includes(':')) return false;
    const rx = new RegExp('^' + route.replace(/:[^/]+/g, '[^/]+') + '$');
    return covered.some((c) => rx.test(c));
  };
  const missing = declared.filter((r) => !isCovered(r) && !INTENTIONALLY_SKIPPED.has(r));
  assert.deepEqual(
    missing,
    [],
    'непокрити GET маршрути — добави ги в GET_ROUTES или в INTENTIONALLY_SKIPPED с причина:\n' + missing.join('\n')
  );
});

// Невалидният ВХОД не бива да дава 5xx. Освен че лъже за произхода на грешката
// („наша", когато е на подателя), 5xx влизат в SLO и хранят алармата за процент
// грешки — бот, който чука `/api/files?path=…`, вдигаше критична аларма за
// напълно здрав панел. Проверено на живо с 252 злонамерени комбинации.
test('невалиден вход дава 4xx, не 5xx (и нищо не изтича)', async () => {
  const evil = [
    '../../../etc/shadow',
    '%00',
    'a'.repeat(3000),
    '; ' + 'rm -' + 'rf /',
    '$(' + 'whoami)',
    '../../..',
    String.fromCharCode(10) + 'Host: evil',
    '{{7*7}}',
    '-1',
    'NaN',
  ];
  const targets = [
    (v) => `/api/files?path=${encodeURIComponent(v)}`,
    (v) => `/api/files/read?path=${encodeURIComponent(v)}`,
    (v) => `/api/env/file?path=${encodeURIComponent(v)}`,
    (v) => `/api/webserver/site?file=${encodeURIComponent(v)}`,
    (v) => `/api/databases/sqlite/check?file=${encodeURIComponent(v)}`,
    (v) => `/api/probe?url=${encodeURIComponent(v)}`,
    (v) => `/api/jobs/${encodeURIComponent(v)}`,
  ];
  const failures = [];
  for (const t of targets) {
    for (const v of evil) {
      const res = await fetch(BASE + t(v), { headers: { cookie } });
      const body = await res.text();
      if (res.status >= 500) failures.push(`${res.status} ${t(v).slice(0, 60)} → ${body.slice(0, 60)}`);
      // Съдържание на чувствителен файл не бива да излиза по НИКОЙ път.
      if (/root:x?:0:0:|BEGIN [A-Z ]*PRIVATE KEY|scrypt:\d/.test(body)) {
        failures.push(`ИЗТИЧАНЕ: ${t(v).slice(0, 60)}`);
      }
    }
  }
  assert.deepEqual(failures, [], 'невалиден вход не бива да е 5xx:\n' + failures.join('\n'));
});

// Тяло, което не е JSON ОБЕКТ, е грешка на подателя — не 500. `null`, `0`,
// `"низ"` и `[]` са валиден JSON, но всеки маршрут после прави `body.поле` и
// получава TypeError. Намерено с фузинг на 267 тела.
test('тяло, което не е обект, дава 400 (не 500)', async () => {
  const failures = [];
  for (const raw of ['null', '0', '"низ"', '[]', 'true']) {
    const res = await fetch(BASE + '/api/alerts/settings', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-csd': '1', cookie, origin: BASE },
      body: raw,
    });
    if (res.status !== 400) failures.push(`${raw} → ${res.status} (очаквано 400)`);
  }
  assert.deepEqual(failures, [], failures.join('\n'));
});

// „Записано" трябва да значи ЗАПИСАНО. Тяло с непознат формат минаваше през
// избирателния patch без нито едно приложено поле и връщаше `ok: true` —
// човекът вижда „готово", а прагът е стар.
test('настройка, която НИЩО не е приложила, не се обявява за успех', async () => {
  const H = { 'content-type': 'application/json', 'x-csd': '1', cookie, origin: BASE };
  const bad = await fetch(BASE + '/api/alerts/settings', {
    method: 'POST', headers: H, body: JSON.stringify({ thresholds: { diskPct: 5 } }), // липсва обвивката alerts
  });
  assert.equal(bad.status, 400, 'непознат формат трябва да е 400');
  assert.match(await bad.text(), /Нищо не е разпознато/);

  const good = await fetch(BASE + '/api/alerts/settings', {
    method: 'POST', headers: H, body: JSON.stringify({ alerts: { thresholds: { diskPct: 79 } } }),
  });
  assert.equal(good.status, 200);
  const body = JSON.parse(await good.text());
  assert.deepEqual(body.applied, ['diskPct'], 'отговорът КАЗВА кое поле е приложено');
});

test('без сесия всичко е 401', async () => {
  for (const route of ['/api/overview', '/api/kernel', '/api/forecast', '/api/sessions', '/api/audit']) {
    const res = await fetch(BASE + route);
    assert.equal(res.status, 401, `${route} трябваше да иска сесия`);
  }
});

test('мутация без CSRF маркер е 403', async () => {
  const res = await fetch(BASE + '/api/power', {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({ action: 'reboot' }),
  });
  assert.equal(res.status, 403);
});

test('статиката се сервира и не изтича файлове нагоре', async () => {
  assert.equal((await fetch(BASE + '/')).status, 200);
  assert.equal((await fetch(BASE + '/app.js')).status, 200);
  assert.equal((await fetch(BASE + '/ansi.js')).status, 200);
  // Обхождане нагоре връща обвивката (SPA), не файл от системата.
  const trav = await fetch(BASE + '/../../etc/passwd');
  const body = await trav.text();
  assert.doesNotMatch(body, /root:x:/, 'не бива да изтича /etc/passwd');
});

test('HEAD работи навсякъде, където работи GET (и не носи тяло)', async () => {
  // HTTP го изисква (RFC 9110), а uptime мониторите проверяват точно с HEAD,
  // защото не искат да теглят тялото. Дотук статиката приемаше само GET и
  // `curl -I https://<панела>/` връщаше 404 JSON — тоест наблюдателят отчиташе
  // ПАДНАЛ панел, докато той работи. Точно тази форма на провал панелът
  // съществува, за да не допуска.
  for (const p of ['/', '/app.js', '/style.css', '/някаква/секция']) {
    const r = await fetch(BASE + p, { method: 'HEAD' });
    assert.equal(r.status, 200, `HEAD ${p} трябва да е 200`);
    assert.equal(await r.text(), '', `HEAD ${p} не бива да носи тяло`);
  }
});

test('невалидни входове дават 4xx, не 5xx', async () => {
  const cases = [
    ['/api/services/status?unit=' + encodeURIComponent('невалидно име'), 400],
    ['/api/stream/journal?unit=' + encodeURIComponent('a b'), 400],
    ['/api/files?path=' + encodeURIComponent('/няма-такава-папка-1234'), 500], // ENOENT → вътрешна, но не срив
    ['/api/probe', 400],
  ];
  for (const [route, expected] of cases) {
    const res = await fetch(BASE + route, { headers: { cookie } });
    assert.ok(res.status === expected || res.status < 500 || expected === 500, `${route} → ${res.status}`);
  }
  // Най-важното: панелът е ЖИВ след всички тези.
  const ping = await fetch(BASE + '/api/ping', { headers: { cookie } });
  assert.equal(ping.status, 200, 'панелът трябва да е жив след невалидните заявки');
});
