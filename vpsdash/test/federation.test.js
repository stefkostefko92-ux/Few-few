// Пълен контрол над съседа ПРЕЗ проксито — два истински панела на 127.0.0.1.
//
// Защо съществува: при „peerScope": "full" съседът пропуска sudo за заявки с
// жетон (няма браузър, който да покаже диалога), а проксито на нашия панел
// гледаше `needsSudo('/api/nodes/b/…')` — път, който не съвпада с нито едно
// правило. Тоест открадната сесия ТУК беше root shell ТАМ без парола. Тестът
// пада със стария код (стъпка „без sudo тук → 428").
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { hashPassword } from '../src/auth.js';

const PA = 7811; // „a" — панелът, от който управляваш
const PB = 7812; // „b" — съседът
const A = `http://127.0.0.1:${PA}`;
const B = `http://127.0.0.1:${PB}`;
const PASS_A = 'парола-а-федерация';
const PASS_B = 'парола-б-федерация';
const TOKEN = 'f'.repeat(48);
const kids = [];
let dir;
let cookieA = '';
let cookieB = '';

async function boot(name, port, extra) {
  const d = path.join(dir, name);
  fs.mkdirSync(d);
  const cfgPath = path.join(d, 'config.json');
  fs.writeFileSync(cfgPath, JSON.stringify({
    host: '127.0.0.1',
    port,
    nodeId: name,
    nodeName: name.toUpperCase(),
    adminUser: 'admin',
    sessionSecret: name.repeat(64),
    paths: { stateDir: path.join(d, 'state'), archiveDir: d, releasesDir: path.join(d, 'rel'), currentLink: path.join(d, 'cur') },
    peers: [],
    healthChecks: [],
    alerts: { enabled: false },
    ...extra,
  }));
  const child = spawn(process.execPath, ['server.js'], {
    cwd: path.resolve(import.meta.dirname, '..'),
    env: { ...process.env, CSD_CONFIG: cfgPath },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  kids.push(child);
  let stderr = '';
  child.stderr.on('data', (c) => (stderr += c));
  for (let i = 0; i < 60; i++) {
    if (child.exitCode !== null) throw new Error(`${name} умря при старт:\n${stderr}`);
    try {
      await fetch(`http://127.0.0.1:${port}/api/ping`);
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 250));
    }
  }
}

async function login(base, password) {
  const res = await fetch(base + '/api/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-csd': '1' },
    body: JSON.stringify({ user: 'admin', password }),
  });
  assert.equal(res.status, 200, 'входът трябва да мине');
  return res.headers.getSetCookie()[0].split(';')[0];
}

const call = (base, cookie, p, { method = 'GET', body, headers = {} } = {}) =>
  fetch(base + p, {
    method,
    headers: { cookie, ...(method === 'GET' ? {} : { 'x-csd': '1', 'content-type': 'application/json' }), ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

const sudoOn = (base, cookie, password) => call(base, cookie, '/api/sudo', { method: 'POST', body: { password } });

before(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'csd-fed-'));
  await boot('b', PB, { passwordHash: hashPassword(PASS_B), peerToken: TOKEN, peerScope: 'read' });
  await boot('a', PA, { passwordHash: hashPassword(PASS_A), peers: [{ id: 'b', name: 'B', url: B, token: TOKEN }] });
  cookieA = await login(A, PASS_A);
  cookieB = await login(B, PASS_B);
});

after(() => {
  for (const k of kids) k.kill('SIGTERM');
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    /* ок */
  }
});

test('федерация: от „само четене" до пълен контрол — с парола ТУК, със следа ТАМ', async () => {
  // 1) Обхват „read": четенето минава, мутацията — не, с подсказка как.
  assert.equal((await call(A, cookieA, '/api/nodes/b/overview')).status, 200);
  const ro = await call(A, cookieA, '/api/nodes/b/alerts/settings', { method: 'POST', body: { alerts: { enabled: false } } });
  assert.equal(ro.status, 403);
  assert.match((await ro.json()).error, /Достъп на съседа/);

  // 2) Обхватът се сменя САМО на самия възел, зад sudo — и съседът не може.
  assert.equal((await call(A, cookieA, '/api/nodes/b/settings/peer', { method: 'POST', body: { scope: 'full' } })).status, 403);
  const peerSelf = await fetch(B + '/api/settings/peer', {
    method: 'POST',
    headers: { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json' },
    body: JSON.stringify({ scope: 'full' }),
  });
  assert.equal(peerSelf.status, 403, 'съседът не си разширява доверието сам');
  assert.equal((await call(B, cookieB, '/api/settings/peer', { method: 'POST', body: { scope: 'full' } })).status, 428);
  assert.equal((await sudoOn(B, cookieB, PASS_B)).status, 200);
  assert.equal((await call(B, cookieB, '/api/settings/peer', { method: 'POST', body: { scope: 'nope' } })).status, 400);
  const full = await call(B, cookieB, '/api/settings/peer', { method: 'POST', body: { scope: 'full' } });
  assert.equal(full.status, 200);
  assert.equal((await (await call(B, cookieB, '/api/settings/peer')).json()).scope, 'full');

  // 3) РЕГРЕСИЯТА: опасен път на съседа без sudo ТУК → 428, не 200.
  const noSudo = await call(A, cookieA, '/api/nodes/b/files/read?path=/etc/hostname');
  assert.equal(noSudo.status, 428, 'пълният обхват там не бива да прескача паролата тук');

  // 4) Странни пътища не минават покрай проверката.
  assert.equal((await call(A, cookieA, '/api/nodes/b//files/read?path=/etc/hostname')).status, 400);
  // Верига към трети възел и „sudo през съседа" — никога.
  assert.equal((await call(A, cookieA, '/api/nodes/b/nodes')).status, 403);
  assert.equal((await call(A, cookieA, '/api/nodes/b/sudo', { method: 'POST', body: { password: PASS_B } })).status, 403);
  const chain = await fetch(B + '/api/nodes', { headers: { authorization: `Bearer ${TOKEN}` } });
  assert.equal(chain.status, 403, 'и при пълен обхват съседът не е прокси към трети');

  // 5) С парола ТУК: пълен контрол там.
  assert.equal((await sudoOn(A, cookieA, PASS_A)).status, 200);
  assert.equal((await call(A, cookieA, '/api/nodes/b/files/read?path=/etc/hostname')).status, 200);
  const mut = await call(A, cookieA, '/api/nodes/b/alerts/settings', {
    method: 'POST',
    body: { alerts: { enabled: false } },
    headers: { 'x-csd-actor': 'evil@x' }, // браузърът не избира чие име влиза в одита
  });
  assert.equal(mut.status, 200);

  // 6) Следата: там — кой човек оттам; тук — какво е пратено натам.
  const auditB = await (await call(B, cookieB, '/api/audit?limit=50')).json();
  const rowsB = JSON.stringify(auditB);
  assert.match(rowsB, /peer:admin@a/, 'одитът на съседа казва кой човек е действал');
  assert.doesNotMatch(rowsB, /evil@x/, 'подправеното име не стига до одита');
  const auditA = JSON.stringify(await (await call(A, cookieA, '/api/audit?limit=50')).json());
  assert.match(auditA, /peer\.proxy/);

  // 7) Чужда заглавка без жетон не дава нищо.
  const forged = await fetch(B + '/api/overview', { headers: { 'x-csd-actor': 'admin@a' } });
  assert.equal(forged.status, 401);

  // 8) Обратно към „само четене" — пак само на самия възел.
  assert.equal((await call(B, cookieB, '/api/settings/peer', { method: 'POST', body: { scope: 'read' } })).status, 200);
  assert.equal((await call(A, cookieA, '/api/nodes/b/files/read?path=/etc/hostname')).status, 403);
});
