// Продукционният път: зад прокси (`trustProxy: true`).
//
// Всички други живи тестове вдигат сървъра БЕЗ прокси — тоест бисквитката с
// префикс `__Host-`, флагът `Secure` и четенето на адреса от `X-Real-IP` не се
// изпълняваха от нито един тест, макар че точно така върви в производство.
// Непроверен път е път, за който само се надяваме.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { hashPassword } from '../src/auth.js';

const PORT = 7793;
const BASE = `http://127.0.0.1:${PORT}`;
const PASS = 'прокси-парола-4471';
let child;
let dir;

const login = (password, extra = {}) =>
  fetch(BASE + '/api/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-csd': '1', ...extra },
    body: JSON.stringify({ user: 'admin', password }),
  });

before(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'csd-proxy-'));
  const cfgPath = path.join(dir, 'config.json');
  fs.writeFileSync(
    cfgPath,
    JSON.stringify({
      host: '127.0.0.1',
      port: PORT,
      nodeName: 'Зад прокси',
      adminUser: 'admin',
      passwordHash: hashPassword(PASS),
      sessionSecret: 'P'.repeat(64),
      trustProxy: true,
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
});

after(() => {
  child?.kill('SIGTERM');
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    /* временната папка */
  }
});

test('зад прокси: бисквитката е __Host- + Secure, а голото име е мъртво', async () => {
  const res = await login(PASS, { 'x-real-ip': '203.0.113.10' });
  assert.equal(res.status, 200);
  const set = res.headers.getSetCookie()[0];
  assert.match(set, /^__Host-csd_sess=/, 'зад прокси името носи префикса');
  assert.match(set, /;\s*Secure/i, '__Host- без Secure браузърът го отхвърля');
  assert.match(set, /Path=\//);
  assert.ok(!/Domain=/i.test(set));
  const token = set.split(';')[0].split('=')[1];

  assert.equal((await fetch(BASE + '/api/overview', { headers: { cookie: `__Host-csd_sess=${token}` } })).status, 200);
  // Старото име като резервен път би направило защитата театър.
  assert.equal(
    (await fetch(BASE + '/api/overview', { headers: { cookie: `csd_sess=${token}` } })).status,
    401,
    'голото име НЕ бива да се приема зад прокси'
  );
  // Изходът чисти И ДВЕТЕ имена.
  const out = await fetch(BASE + '/api/logout', { method: 'POST', headers: { cookie: `__Host-csd_sess=${token}`, 'x-csd': '1' } });
  const cleared = out.headers.getSetCookie().join('\n');
  assert.match(cleared, /__Host-csd_sess=;/);
  assert.match(cleared, /(^|\n)csd_sess=;/, 'старото име също се чисти при изход');
});

test('зад прокси: HSTS се праща, а адресът идва от X-Real-IP, не от левия XFF', async () => {
  const res = await fetch(BASE + '/api/ping');
  assert.match(res.headers.get('strict-transport-security') || '', /max-age=63072000/, 'HSTS само зад прокси — тук трябва да го има');

  // Пет провала с ЕДИН реален адрес → шестият е спрян; подправен ляв XFF не помага.
  for (let i = 0; i < 5; i++) await login('грешна', { 'x-real-ip': '198.51.100.7', 'x-forwarded-for': `10.0.0.${i}, 198.51.100.7` });
  const блок = await login('грешна', { 'x-real-ip': '198.51.100.7', 'x-forwarded-for': '10.9.9.9, 198.51.100.7' });
  assert.equal(блок.status, 429, 'ротиращ ляв XFF не заобикаля лимита — брои се X-Real-IP');
  // Друг реален адрес не е засегнат.
  assert.equal((await login('грешна', { 'x-real-ip': '198.51.100.8' })).status, 401);
});
