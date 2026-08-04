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
import { compact } from '../src/history.js';
import { Router } from '../src/httpd.js';
import { assertUnit } from '../src/services.js';
import { KNOWN_PROJECTS } from '../src/deploy.js';
import { loadConfig } from '../src/config.js';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

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

// ── Повреден конфиг: панелът върви от копието, но го КАЗВА ────────────────────
test('конфиг: повреденият се възстановява от .bak, шумно и без презапис', () => {
  // Точно в момента, в който конфигът е повреден (спряло захранване насред
  // запис, пълен диск), панелът е най-нужен — без него човек не вижда нищо.
  // Копието се пишеше, но НИКОЙ не го четеше: панелът умираше до спасението си.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'csd-cfg-'));
  const cfgPath = path.join(dir, 'config.json');
  const good = {
    passwordHash: 'x'.repeat(40),
    sessionSecret: 's'.repeat(64),
    nodeName: 'ДОБЪР',
    paths: { stateDir: path.join(dir, 'state') },
  };
  fs.writeFileSync(`${cfgPath}.bak`, JSON.stringify(good));
  fs.writeFileSync(cfgPath, '{"passwordHash":"x'); // отрязан по средата

  const cfg = loadConfig({ configPath: cfgPath, allowDev: false });
  assert.equal(cfg.nodeName, 'ДОБЪР', 'върви от копието');
  assert.ok(cfg.recovered, 'и го КАЗВА — тихото възстановяване крие провалил се запис');
  assert.match(cfg.recovered.from, /\.bak$/);
  assert.equal(fs.readFileSync(cfgPath, 'utf8'), '{"passwordHash":"x', 'повреденият файл е ДОКАЗАТЕЛСТВО — не се пипа');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('конфиг: и копието да е негодно → падаме с ПЪРВОНАЧАЛНАТА причина', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'csd-cfg2-'));
  const cfgPath = path.join(dir, 'config.json');
  fs.writeFileSync(cfgPath, 'боклук');
  fs.writeFileSync(`${cfgPath}.bak`, 'също боклук');
  assert.throws(() => loadConfig({ configPath: cfgPath, allowDev: false }), /Невалиден конфиг/);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('конфиг: копие БЕЗ passwordHash не се брои за спасение', () => {
  // Иначе „възстановяването" би вдигнало панел без парола.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'csd-cfg3-'));
  const cfgPath = path.join(dir, 'config.json');
  fs.writeFileSync(cfgPath, '{отрязан');
  fs.writeFileSync(`${cfgPath}.bak`, JSON.stringify({ sessionSecret: 's'.repeat(64), nodeName: 'БЕЗ ПАРОЛА' }));
  assert.throws(() => loadConfig({ configPath: cfgPath, allowDev: false }), /Невалиден конфиг/);
  fs.rmSync(dir, { recursive: true, force: true });
});

// ── Числата: „не знам" не се закръгля до нула ────────────────────────────────
test('метрики: първата проба е null, не 0 — фалшивата нула храни прогнозата', () => {
  // `cpuPct ?? 0` изглеждаше безобидно: първата проба след всеки старт на панела
  // няма от какво да смята делта. Но 0 е ЧИСЛО — влизаше в историята, оттам в
  // прогнозата, в откриването на аномалии и в търсенето на промяна в поведението.
  // Тоест всеки рестарт на панела вписваше отвесен спад до нулата, който после
  // детекторът съобщаваше като „поведението се промени тогава".
  assert.equal(cpuPercent(null, { total: 100, idle: 50 }), null);
  assert.equal(cpuPercent({ total: 100, idle: 50 }, { total: 100, idle: 50 }), null, 'нулева делта');
  assert.equal(cpuPercent({ total: 200, idle: 100 }, { total: 100, idle: 50 }), null, 'брояч назад (снапшот на ВМ)');
});

test('памет: липсващ MemAvailable не значи „100% заета"', () => {
  // Ядрата под 3.14 и орязаният /proc нямат MemAvailable. `|| 0` правеше
  // used = total → КРИТИЧНА аларма за памет на напълно здрава машина.
  const m = parseMeminfo('MemTotal: 4000000 kB\nMemFree: 3000000 kB\nBuffers: 100000 kB\nCached: 500000 kB\n');
  assert.ok((m.used / m.total) * 100 < 50, `очаква се ~10%, получено ${((m.used / m.total) * 100).toFixed(0)}%`);
  assert.equal(m.availableEstimated, true, 'оценката се ПРИЗНАВА за оценка');
});

test('памет: нечетим /proc дава null по цялата линия', () => {
  const m = parseMeminfo('');
  assert.equal(m.total, null);
  assert.equal(m.used, null);
  assert.equal(m.swapUsed, null, 'swap също — 0 - 0 = 0 изглежда като измерено');
});

test('мрежа: контейнерният байт се брои ВЕДНЪЖ, не два пъти', () => {
  // Байт от контейнер минава и през docker0/veth, и през eth0. Сборът от всички
  // го брои двойно — и точно това правеше живата скорост на обзора, СЪСЕДНО на
  // месечния трафик, който брои правилно. Две числа на един екран, разминати
  // ~2.8×, са по-лоши от едно грешно: не знаеш кое да вярваш.
  const dev = [
    'x', 'y',
    '    lo: 1000 1 0 0 0 0 0 0 1000 1 0 0 0 0 0 0',
    '  eth0: 5000 5 0 0 0 0 0 0 7000 7 0 0 0 0 0 0',
    'docker0: 3000 3 0 0 0 0 0 0 4000 4 0 0 0 0 0 0',
    'veth9a1f2: 3000 3 0 0 0 0 0 0 4000 4 0 0 0 0 0 0',
  ].join('\n');
  const n = parseNetDev(dev);
  assert.equal(n.rx, 5000);
  assert.equal(n.tx, 7000);
  assert.deepEqual(n.ifaces, ['eth0']);
});

test('история: null остава null, а не 0 след закръгляне', () => {
  const point = compact({
    ts: 1, cpuPct: null, load: [null], net: { rxBps: null, txBps: null },
    mem: { used: null, total: null, available: null, swapUsed: null }, disks: [],
  });
  assert.equal(point.cpu, null, 'Math.round(null) дава 0 — точно това не бива');
  assert.equal(point.rxBps, null);
  assert.equal(point.load1, null);
  assert.equal(point.memUsed, null);
});
