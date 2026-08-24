// Интеграционни тестове на пазача в routes.js — guard()/csrfOk()/peerAllowed()/
// sudo гейта. Досега нищо не караше buildRouter() истински през HTTP: PEER_DENY
// беше проверен само като СПИСЪК от regex-и (test/sessions.test.js), а не заедно
// с реалната логика на peerAllowed() (peerScope, метод); csrfOk() имаше тест само
// за липсващ x-csd маркер, никога за разминат Origin; needsSudo()/SudoGrants бяха
// тествани поотделно, никога закачени в реалната верига на guard(). Три мутации,
// пуснати нарочно (Origin проверката, GET-само за peer, изключване на sudo клона),
// оцеляха при пълния пакет от 190 теста — точно затова този файл съществува.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { hashPassword } from '../src/auth.js';

const PORT = 7789;
const BASE = `http://127.0.0.1:${PORT}`;
const PASSWORD = 'парола-guard-тест';
const PEER_TOKEN = 'peer-secret-token-1234567890';
let child;
let dir;
let cookie = '';

before(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'csd-guard-'));
  const cfgPath = path.join(dir, 'config.json');
  fs.writeFileSync(
    cfgPath,
    JSON.stringify({
      host: '127.0.0.1',
      port: PORT,
      nodeName: 'GuardTest',
      adminUser: 'admin',
      passwordHash: hashPassword(PASSWORD),
      sessionSecret: 's'.repeat(64),
      peerToken: PEER_TOKEN,
      peerScope: 'read', // по подразбиране — peer-ът е САМО за четене
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
    body: JSON.stringify({ user: 'admin', password: PASSWORD }),
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

// ── CSRF: Origin трябва да пасва на Host, не само да присъства заглавката ──────
test('CSRF: чужд Origin с валиден x-csd маркер пак е 403', async () => {
  const res = await fetch(BASE + '/api/sessions/revoke-all', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      cookie,
      'x-csd': '1',
      origin: 'https://evil.example',
    },
    body: '{}',
  });
  assert.equal(res.status, 403, 'разминат Origin трябва да се отхвърли дори с x-csd:1');
});

test('CSRF: съвпадащ Origin с x-csd маркер минава отвъд CSRF проверката', async () => {
  const res = await fetch(BASE + '/api/alerts/settings', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      cookie,
      'x-csd': '1',
      origin: BASE,
    },
    body: JSON.stringify({ alerts: { enabled: true } }),
  });
  assert.equal(res.status, 200, 'легитимна заявка не бива да пада на CSRF проверката');
});

// ── Federation: peer с обхват „read" не бива да мутира нищо ────────────────────
test('peer (Bearer) с peerScope „read" вижда GET, но не и POST извън PEER_ALLOW', async () => {
  const getRes = await fetch(BASE + '/api/overview', { headers: { authorization: `Bearer ${PEER_TOKEN}` } });
  assert.equal(getRes.status, 200, 'peer трябва да чете състоянието');

  // /api/sessions/revoke-all НЕ е в PEER_DENY списъка (защитата там разчита на
  // „не е GET"), но peerScope: read трябва да отхвърли ВСЯКА мутация от peer,
  // не само изрично изброените в PEER_DENY маршрути.
  const postRes = await fetch(BASE + '/api/sessions/revoke-all', {
    method: 'POST',
    headers: { authorization: `Bearer ${PEER_TOKEN}`, 'content-type': 'application/json' },
    body: '{}',
  });
  assert.equal(postRes.status, 403, 'peer с обхват „read" не бива да мутира каквото и да е извън PEER_ALLOW');
});

test('peer (Bearer) не стига до PEER_DENY маршрут дори с GET', async () => {
  const res = await fetch(BASE + '/api/files/read?path=/etc/hostname', {
    headers: { authorization: `Bearer ${PEER_TOKEN}` },
  });
  assert.equal(res.status, 403, 'PEER_DENY важи независимо от метода');
});

// ── Sudo: реагиране в реалната верига на guard(), не само needsSudo() изолирано ─
test('SUDO_ALWAYS: четенето на произволен файл иска повторно потвърждаване', async () => {
  const tmp = path.join(dir, 'таен.txt');
  fs.writeFileSync(tmp, 'нищо особено\n');

  const before1 = await fetch(BASE + '/api/files/read?path=' + encodeURIComponent(tmp), { headers: { cookie } });
  assert.equal(before1.status, 428, 'без sudo потвърждение четенето на файл трябва да е блокирано');

  const sudoRes = await fetch(BASE + '/api/sudo', {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie, 'x-csd': '1' },
    body: JSON.stringify({ password: PASSWORD }),
  });
  assert.equal(sudoRes.status, 200, 'вярната парола трябва да отключи sudo прозореца');

  const after1 = await fetch(BASE + '/api/files/read?path=' + encodeURIComponent(tmp), { headers: { cookie } });
  assert.equal(after1.status, 200, 'след потвърждение четенето трябва да мине');
  const body = await after1.json();
  assert.match(body.content, /нищо особено/);

  // Разлогваме sudo прозореца, за да не изтича към другите тестове в процеса.
  await fetch(BASE + '/api/sudo/revoke', {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie, 'x-csd': '1' },
    body: '{}',
  });
});
