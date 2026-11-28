// Десктопът се проксира ИЗВЪН рутера (`/desktop/…` + WebSocket upgrade), тоест
// извън guard() — там живеят AGENT_ALLOW и peerScope. Само `authenticate`
// пускаше агентския ключ (облакът) и жетона на съседа до графична root сесия:
// `/api/desktop` им отказваше, а `/desktop/` ги проксираше (поука на Кодаджията,
// доказана с жива заявка: 502 = „проксирано към спрян контейнер").
// Тестът пада със стария код на стъпките за агента и съседа.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import net from 'node:net';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { hashPassword } from '../src/auth.js';

const PORT = 7815;
const BASE = `http://127.0.0.1:${PORT}`;
const PASS = 'парола-десктоп-гейт';
const PEER = 'p'.repeat(48);
const AGENT = 'a'.repeat(48);
let dir;
let child;

before(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'csd-desktopgate-'));
  const cfgPath = path.join(dir, 'config.json');
  fs.writeFileSync(cfgPath, JSON.stringify({
    host: '127.0.0.1', port: PORT, nodeId: 'dg', nodeName: 'DG', adminUser: 'admin',
    passwordHash: hashPassword(PASS), sessionSecret: 'd'.repeat(64),
    peerToken: PEER, peerScope: 'full', agentKey: AGENT,
    paths: { stateDir: path.join(dir, 'state'), archiveDir: dir, releasesDir: path.join(dir, 'rel'), currentLink: path.join(dir, 'cur') },
    // Портът на десктопа е затворен: проксирана заявка дава 502, отказана — 403.
    desktop: { port: 1 },
    peers: [], healthChecks: [], alerts: { enabled: false },
  }));
  child = spawn(process.execPath, ['server.js'], {
    cwd: path.resolve(import.meta.dirname, '..'),
    env: { ...process.env, CSD_CONFIG: cfgPath },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  for (let i = 0; i < 60; i++) {
    try {
      await fetch(BASE + '/api/ping');
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 250));
    }
  }
});
after(() => {
  child?.kill();
  fs.rmSync(dir, { recursive: true, force: true });
});

const get = (headers = {}) => fetch(BASE + '/desktop/', { headers, redirect: 'manual' });

// Суров upgrade — fetch не прави WebSocket; първият ред на отговора е присъдата.
function upgrade(extra) {
  return new Promise((resolve) => {
    const s = net.connect(PORT, '127.0.0.1', () => {
      s.write(`GET /desktop/websockify HTTP/1.1\r\nHost: 127.0.0.1:${PORT}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n` +
        `Sec-WebSocket-Version: 13\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\n${extra}\r\n`);
    });
    let buf = '';
    s.on('data', (c) => (buf += c));
    s.on('close', () => resolve(buf.split('\r\n')[0]));
    s.setTimeout(3000, () => s.destroy());
  });
}

test('десктоп: без вход 401; агентски ключ и съсед (дори „full") — 403, не прокси', async () => {
  assert.equal((await get()).status, 401);
  assert.equal((await get({ authorization: `CSD-Agent ${AGENT}` })).status, 403, 'агентът е в облака — само четене и предложения');
  assert.equal((await get({ authorization: `Bearer ${PEER}` })).status, 403, 'съседът не рамкира чужд десктоп');
  // Човек с вход стига до проксито (502 — контейнерът не върви).
  const login = await fetch(BASE + '/api/login', {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-csd': '1' }, body: JSON.stringify({ user: 'admin', password: PASS }),
  });
  const cookie = login.headers.getSetCookie()[0].split(';')[0];
  assert.notEqual((await get({ cookie })).status, 403);
});

test('десктоп: WebSocket upgrade със жетон на съседа или агентски ключ — 403', async () => {
  assert.match(await upgrade(''), /401/);
  assert.match(await upgrade(`Authorization: Bearer ${PEER}\r\n`), /403/);
  assert.match(await upgrade(`Authorization: CSD-Agent ${AGENT}\r\n`), /403/);
  const audit = fs.readFileSync(path.join(dir, 'state', 'audit.jsonl'), 'utf8');
  assert.match(audit, /desktop\.denied/, 'опитът остава в одита');
});

test('сондата на деплоя: /api/ping носи маркера на панела и в отказа', async () => {
  const res = await fetch(BASE + '/api/ping');
  assert.equal(res.status, 401);
  assert.equal((await res.json()).app, 'vps-dashboard');
  // autodeploy брои 401/200 за „жив" САМО с този маркер — иначе всяко
  // приложение с вход на порта минава (поука на Наблюдателя).
  const sh = fs.readFileSync(path.resolve(import.meta.dirname, '..', '..', 'deploy', 'autodeploy.sh'), 'utf8');
  assert.match(sh, /grep -q '"app":"vps-dashboard"'/);
  // …само когато разгърнатият код го носи: иначе връщането назад към release
  // отпреди маркера винаги „пада" и панелът не се връща никога.
  assert.match(sh, /grep -q "app: 'vps-dashboard'" "\$VPSDASH_DIR\/src\/routes\.js"/);
  const routes = fs.readFileSync(path.resolve(import.meta.dirname, '..', 'src', 'routes.js'), 'utf8');
  assert.ok(routes.includes("app: 'vps-dashboard'"), 'низът, по който autodeploy разпознава новия панел, е в routes.js');
});
