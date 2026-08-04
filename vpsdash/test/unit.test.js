// Юнит тестове за чистите функции (нула зависимости, node:test).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  hashPassword,
  verifyPassword,
  createSession,
  verifySession,
  tokenEqual,
} from '../src/auth.js';
import {
  parseCpuStat,
  cpuPercent,
  parseMeminfo,
  parseNetDev,
  parseDf,
} from '../src/metrics.js';
import { Router } from '../src/httpd.js';
import { assertUnit } from '../src/services.js';
import { KNOWN_PROJECTS } from '../src/deploy.js';

test('парола: хеш и проверка', () => {
  const h = hashPassword('таен-парол-123');
  assert.ok(h.startsWith('scrypt:'));
  assert.equal(verifyPassword('таен-парол-123', h), true);
  assert.equal(verifyPassword('грешна', h), false);
});

test('сесия: подпис, изтичане, подправяне', () => {
  const secret = 'x'.repeat(64);
  const tok = createSession(secret, 'admin', 60000);
  const ok = verifySession(secret, tok);
  assert.equal(ok.user, 'admin');
  assert.equal(verifySession('друг-secret'.padEnd(64, 'y'), tok), null);
  assert.equal(verifySession(secret, tok + 'x'), null);
  assert.equal(verifySession(secret, createSession(secret, 'admin', -1)), null);
});

test('tokenEqual: константно сравнение', () => {
  assert.equal(tokenEqual('abc', 'abc'), true);
  assert.equal(tokenEqual('abc', 'abd'), false);
  assert.equal(tokenEqual('', ''), false);
  assert.equal(tokenEqual('a', 'ab'), false);
});

test('CPU: делта проценти', () => {
  const a = parseCpuStat('cpu  100 0 100 800 0 0 0 0\n');
  const b = parseCpuStat('cpu  200 0 200 1400 0 0 0 0\n');
  assert.equal(a.total, 1000);
  assert.equal(a.idle, 800);
  const pct = cpuPercent(a, b);
  // delta total=800, delta idle=600 → busy 200/800 = 25%
  assert.ok(Math.abs(pct - 25) < 0.001);
  assert.equal(cpuPercent(null, b), null);
});

test('meminfo парсване', () => {
  const m = parseMeminfo('MemTotal:  1000 kB\nMemFree: 200 kB\nMemAvailable: 400 kB\nSwapTotal: 100 kB\nSwapFree: 60 kB\n');
  assert.equal(m.total, 1000 * 1024);
  assert.equal(m.available, 400 * 1024);
  assert.equal(m.used, 600 * 1024);
  assert.equal(m.swapUsed, 40 * 1024);
});

test('net dev: сумира интерфейси без lo', () => {
  const txt = [
    'Inter-|   Receive',
    ' face |bytes packets',
    '    lo: 500 1 2 3 4 5 6 7 500 8',
    '  eth0: 1000 0 0 0 0 0 0 0 2000 0',
  ].join('\n');
  const n = parseNetDev(txt);
  assert.equal(n.rx, 1000);
  assert.equal(n.tx, 2000);
});

test('df -kP парсване', () => {
  const txt = [
    'Filesystem 1024-blocks Used Available Capacity Mounted on',
    '/dev/sda1 1000000 400000 600000 40% /',
    'tmpfs 50000 0 50000 0% /run',
  ].join('\n');
  const d = parseDf(txt);
  assert.equal(d.length, 1);
  assert.equal(d[0].mount, '/');
  assert.equal(d[0].usePercent, 40);
  assert.equal(d[0].totalBytes, 1000000 * 1024);
});

test('Router: параметри и wildcard', () => {
  const r = new Router();
  r.get('/api/services/:action', () => {});
  r.on('*', '/api/nodes/:id/*', () => {});
  const m1 = r.match('GET', '/api/services/restart');
  assert.equal(m1.params.action, 'restart');
  const m2 = r.match('POST', '/api/nodes/vps2/services/action');
  assert.equal(m2.params.id, 'vps2');
  assert.equal(m2.params.rest, 'services/action');
  assert.equal(r.match('GET', '/api/nope'), null);
});

test('assertUnit: отхвърля инжекции', () => {
  assert.equal(assertUnit('medqr.service'), 'medqr.service');
  assert.equal(assertUnit('docker.socket'), 'docker.socket');
  assert.throws(() => assertUnit('a; rm -rf /'));
  assert.throws(() => assertUnit('a b'));
  assert.throws(() => assertUnit('$(whoami)'));
});

test('известни проекти включват vpsdashboard', () => {
  assert.ok(KNOWN_PROJECTS.includes('vpsdashboard'));
  assert.ok(KNOWN_PROJECTS.includes('zabobovdol'));
});

// ── Копието на конфига преди запис ───────────────────────────────────────────
test('конфиг: записът пази копие на ПОСЛЕДНОТО ВАЛИДНО състояние', async () => {
  const fsx = await import('node:fs');
  const osx = await import('node:os');
  const pathx = await import('node:path');
  const { saveConfig } = await import('../src/config.js');
  const dir = fsx.mkdtempSync(pathx.join(osx.tmpdir(), 'csd-cfgbak-'));
  const file = pathx.join(dir, 'config.json');
  const original = { passwordHash: 'scrypt:първо', sessionSecret: 'тайна', port: 7700 };
  fsx.writeFileSync(file, JSON.stringify(original), { mode: 0o600 });

  saveConfig({ ...original }, { port: 8800 }, { configPath: file });
  const bak = JSON.parse(fsx.readFileSync(file + '.bak', 'utf8'));
  assert.equal(bak.port, 7700, 'копието е СТАРОТО състояние');
  assert.equal(bak.sessionSecret, 'тайна', 'тайните оцеляват в копието');
  assert.equal((fsx.statSync(file + '.bak').mode & 0o777), 0o600, 'копието също е 600');
  assert.equal(JSON.parse(fsx.readFileSync(file, 'utf8')).port, 8800, 'новото е записано');
  fsx.rmSync(dir, { recursive: true, force: true });
});

test('конфиг: СЧУПЕН файл НЕ става копие (иначе трие спасителното)', async () => {
  const fsx = await import('node:fs');
  const osx = await import('node:os');
  const pathx = await import('node:path');
  const { saveConfig } = await import('../src/config.js');
  const dir = fsx.mkdtempSync(pathx.join(osx.tmpdir(), 'csd-cfgbak2-'));
  const file = pathx.join(dir, 'config.json');
  fsx.writeFileSync(file + '.bak', JSON.stringify({ passwordHash: 'ДОБРОТО', sessionSecret: 'пази ме' }));
  fsx.writeFileSync(file, '{ счупен');

  saveConfig({ passwordHash: 'ново' }, { port: 1 }, { configPath: file });
  const bak = JSON.parse(fsx.readFileSync(file + '.bak', 'utf8'));
  assert.equal(bak.passwordHash, 'ДОБРОТО', 'старото добро копие НЕ е презаписано с боклук');
  fsx.rmSync(dir, { recursive: true, force: true });
});
