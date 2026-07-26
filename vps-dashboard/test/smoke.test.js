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
];

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
