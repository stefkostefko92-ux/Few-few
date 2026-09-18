// Портове: карта на изложеността + водената смяна на порт.
//
// Тук се проверяват точно нещата, които на живо се виждат само след като вече са
// счупили нещо: обръщането на байтовете в /proc адресите, ТРИТЕ състояния на
// изложеността (вкл. двата пътя към „не знам") и че генерираният `sed` пипа
// ЕДИН ред, а не всяко срещане на числото.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

import {
  parseHexAddr,
  parseSocketLine,
  parseAllowRules,
  allowsPort,
  classify,
  PortBaseline,
  portChecks,
} from '../src/ports.js';
import { assertPort, isPrivileged, plan, applySpec } from '../src/portchange.js';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'csd-ports-'));

// ── /proc адреси ─────────────────────────────────────────────────────────────
test('портове: шестнайсетичният адрес се обръща по байтове, не по думи', () => {
  assert.equal(parseHexAddr('0100007F'), '127.0.0.1');
  assert.equal(parseHexAddr('00000000'), '0.0.0.0');
  assert.equal(parseHexAddr('0F02000A'), '10.0.2.15');
});

test('портове: IPv6 се свива до :: и ::1', () => {
  assert.equal(parseHexAddr('00000000000000000000000001000000'), '::1');
  assert.equal(parseHexAddr('00000000000000000000000000000000'), '::');
});

// ── редът на `ss` ────────────────────────────────────────────────────────────
test('портове: редът на ss дава адрес, порт, процес и PID', () => {
  const r = parseSocketLine('tcp   LISTEN 0      511    0.0.0.0:80    0.0.0.0:*    users:(("nginx",pid=123,fd=6))');
  assert.equal(r.proto, 'tcp');
  assert.equal(r.addr, '0.0.0.0');
  assert.equal(r.port, 80);
  assert.equal(r.process, 'nginx');
  assert.equal(r.pid, 123);
});

test('портове: IPv6 в ss — портът е след ПОСЛЕДНОТО двоеточие', () => {
  assert.equal(parseSocketLine('tcp LISTEN 0 128 [::]:443 [::]:*').addr, '::');
  assert.equal(parseSocketLine('tcp LISTEN 0 128 [::]:443 [::]:*').port, 443);
  assert.equal(parseSocketLine('tcp LISTEN 0 128 [::1]:6379 [::]:*').addr, '::1');
  assert.equal(parseSocketLine('udp UNCONN 0 0 0.0.0.0:53 0.0.0.0:*').proto, 'udp');
  assert.equal(parseSocketLine('nl UNCONN 0 0 rtnl:kernel *'), null);
});

// ── правилата на стената ─────────────────────────────────────────────────────
test('портове: ufw правилата се превеждат до портове и диапазони', () => {
  const allow = parseAllowRules([
    { action: 'ALLOW', dir: 'IN', to: '22/tcp' },
    { action: 'ALLOW', dir: 'IN', to: '80' },
    { action: 'ALLOW', dir: 'IN', to: '1000:2000/udp' },
    { action: 'ALLOW', dir: 'IN', to: '192.168.1.5 5432/tcp' },
    { action: 'DENY', dir: 'IN', to: '3306/tcp' },
  ]);
  assert.ok(allowsPort(allow, 22));
  assert.ok(allowsPort(allow, 80));
  assert.ok(allowsPort(allow, 1500), 'диапазонът трябва да важи за средата му');
  assert.ok(allowsPort(allow, 5432), 'правило с адрес пак отваря порта');
  assert.ok(!allowsPort(allow, 3306), 'DENY не отваря нищо');
  assert.ok(!allowsPort(allow, 2001), 'горната граница е включителна, но не по-нататък');
  assert.deepEqual(allow.unresolved, []);
});

test('портове: неразпознато правило се ЗАПОМНЯ, не се подминава', () => {
  const allow = parseAllowRules([{ action: 'ALLOW', dir: 'IN', to: 'Някакъв профил' }]);
  assert.deepEqual(allow.unresolved, ['Някакъв профил']);
  assert.ok(!allowsPort(allow, 22));
});

// ── трите състояния ──────────────────────────────────────────────────────────
const CLEAN = { fwActive: true, fwAvailable: true, allow: parseAllowRules([{ action: 'ALLOW', dir: 'IN', to: '443/tcp' }]) };

test('портове: loopback е локален независимо от стената', () => {
  for (const addr of ['127.0.0.1', '::1']) {
    assert.equal(classify({ addr, port: 5432 }, { fwActive: false, fwAvailable: false, allow: CLEAN.allow }).exposure, 'локален');
  }
});

test('портове: отворено правило = изложен, липсващо правило = защитен', () => {
  assert.equal(classify({ addr: '0.0.0.0', port: 443 }, CLEAN).exposure, 'изложен');
  assert.equal(classify({ addr: '0.0.0.0', port: 5432 }, CLEAN).exposure, 'защитен');
});

test('портове: изключена стена прави всичко навън изложено', () => {
  const c = classify({ addr: '0.0.0.0', port: 5432 }, { ...CLEAN, fwActive: false });
  assert.equal(c.exposure, 'изложен');
  assert.match(c.why, /ИЗКЛЮЧЕНА/);
});

test('портове: първият път към „не знам" — ufw не отговори', () => {
  const c = classify({ addr: '0.0.0.0', port: 443 }, { fwActive: false, fwAvailable: false, allow: parseAllowRules([]) });
  assert.equal(c.exposure, 'неизвестно');
});

test('портове: вторият път към „не знам" — има непреведено правило', () => {
  const allow = parseAllowRules([{ action: 'ALLOW', dir: 'IN', to: 'Мой профил' }]);
  const c = classify({ addr: '0.0.0.0', port: 5432 }, { fwActive: true, fwAvailable: true, allow });
  assert.equal(c.exposure, 'неизвестно', 'без разпознато правило НЕ твърдим „защитен"');
  assert.match(c.why, /Мой профил/);
});

// ── базова линия ─────────────────────────────────────────────────────────────
const exposed = (port, proto = 'tcp', extra = {}) => ({ port, proto, exposure: 'изложен', why: '…', ...extra });

test('портове: без приета линия не гърми, а кани да я приемеш (info)', () => {
  const b = new PortBaseline(tmp());
  const rows = [exposed(443), exposed(22)];
  const d = b.diff(rows);
  assert.equal(d.primed, false);
  assert.deepEqual(d.fresh, []);
  const checks = portChecks({ available: true, rows, counts: { изложени: 2 } }, b);
  assert.equal(checks.length, 1);
  assert.equal(checks[0].key, 'ports:baseline');
  assert.equal(checks[0].severity, 'info', 'нормалното състояние не буди човек');
});

test('портове: НОВО изложен порт вдига аларма, приетите мълчат', () => {
  const b = new PortBaseline(tmp());
  b.accept([exposed(443), exposed(22)]);
  const rows = [exposed(443), exposed(22), exposed(5432, 'tcp', { process: 'postgres' })];
  const d = b.diff(rows);
  assert.equal(d.primed, true);
  assert.deepEqual(d.fresh.map((r) => r.port), [5432]);
  const checks = portChecks({ available: true, rows, counts: { изложени: 3 } }, b);
  assert.deepEqual(checks.map((c) => c.key), ['ports:new:5432/tcp']);
  assert.equal(checks[0].severity, 'warning');
});

test('портове: ключът е порт/протокол — 53/udp не е 53/tcp', () => {
  const b = new PortBaseline(tmp());
  b.accept([exposed(53, 'tcp')]);
  const d = b.diff([exposed(53, 'tcp'), exposed(53, 'udp')]);
  assert.deepEqual(d.fresh.map(PortBaseline.key), ['53/udp']);
});

test('портове: изчезнал порт е информация, не проблем', () => {
  const b = new PortBaseline(tmp());
  b.accept([exposed(443), exposed(8080)]);
  const checks = portChecks({ available: true, rows: [exposed(443)], counts: { изложени: 1 } }, b);
  assert.deepEqual(checks.map((c) => c.key), ['ports:gone']);
  assert.equal(checks[0].severity, 'info');
});

test('портове: приетата линия ПРЕЖИВЯВА рестарт (диск, mode 600)', () => {
  const dir = tmp();
  new PortBaseline(dir).accept([exposed(443)]);
  const again = new PortBaseline(dir);
  assert.equal(again.diff([exposed(443)]).primed, true);
  assert.deepEqual(again.diff([exposed(443)]).fresh, []);
  const st = fs.statSync(path.join(dir, 'ports.json'));
  assert.equal(st.mode & 0o777, 0o600);
});

test('портове: недостъпна карта не произвежда аларми (не знам ≠ чисто)', () => {
  const b = new PortBaseline(tmp());
  b.accept([exposed(443)]);
  assert.deepEqual(portChecks({ available: false, rows: [], counts: { изложени: 0 } }, b), []);
});

// ── смяна на порт: валидация ─────────────────────────────────────────────────
test('смяна на порт: границите се проверяват ПРЕДИ да е пипнато нещо', () => {
  assert.equal(assertPort('8080'), 8080);
  assert.equal(assertPort(1), 1);
  assert.equal(assertPort(65535), 65535);
  for (const bad of [0, -1, 65536, 1.5, 'осем', '', null, undefined, '80abc']) {
    assert.throws(() => assertPort(bad), /1–65535/, `${bad} трябва да е отказан`);
  }
  assert.ok(isPrivileged(80));
  assert.ok(!isPrivileged(1024));
});

// ── смяна на порт: план ──────────────────────────────────────────────────────
function fixture() {
  const dir = tmp();
  const envPath = path.join(dir, 'zabobovdol.env');
  fs.writeFileSync(
    envPath,
    [
      '# порт 3000 е и в коментара — не бива да се пипа',
      'TIMEOUT_MS=3000',
      'PORT=3000',
      'EXPORT_PORT_NOTE=3000',
      '',
    ].join('\n')
  );
  const cfg = {
    envFiles: [{ path: envPath, name: 'zabobovdol' }],
    healthChecks: [{ name: 'zabobovdol', url: 'http://127.0.0.1:3000/api/health', unit: 'demo.service' }],
  };
  return { dir, envPath, cfg };
}

test('смяна на порт: планът намира .env-а, рестарта и проверката на панела', () => {
  const { cfg } = fixture();
  const p = plan(cfg, { product: 'zabobovdol', newPort: 3100 });
  assert.equal(p.currentPort, 3000);
  assert.equal(p.newPort, 3100);
  assert.equal(p.healthPath, '/api/health');
  const kinds = p.steps.map((s) => s.kind);
  assert.ok(kinds.includes('env'));
  assert.ok(kinds.includes('restart'));
  assert.equal(kinds.at(-1), 'health', 'проверката на панела е винаги последна');
  assert.equal(p.steps.find((s) => s.kind === 'env').key, 'PORT');
  assert.equal(p.steps.at(-1).to, 'http://127.0.0.1:3100/api/health');
  assert.ok(p.applicable);
});

test('смяна на порт: непознат продукт, същият порт и лошо име се отказват', () => {
  const { cfg } = fixture();
  assert.throws(() => plan(cfg, { product: 'няма-такъв', newPort: 3100 }), /Невалидно име/);
  assert.throws(() => plan(cfg, { product: 'other', newPort: 3100 }), /Не познавам продукт/);
  assert.throws(() => plan(cfg, { product: 'zabobovdol', newPort: 3000 }), /вече е на порт/);
});

test('смяна на порт: привилегированият диапазон се предупреждава, не се крие', () => {
  const { cfg } = fixture();
  const p = plan(cfg, { product: 'zabobovdol', newPort: 80 });
  assert.ok(p.warnings.some((w) => /1024/.test(w) && /EACCES/.test(w)));
});

// ── смяна на порт: генерираният sed ──────────────────────────────────────────
test('смяна на порт: sed-ът пипа ТОЧНО реда на ключа, не всяко срещане на числото', () => {
  const { envPath, cfg } = fixture();
  const spec = applySpec(plan(cfg, { product: 'zabobovdol', newPort: 3100 }));
  const sed = spec.shell.split('\n').filter((l) => l.startsWith('sed -i -E'));
  assert.equal(sed.length, 1, 'един файл → един sed');
  execFileSync('bash', ['-c', sed[0]]);
  assert.deepEqual(fs.readFileSync(envPath, 'utf8').split('\n'), [
    '# порт 3000 е и в коментара — не бива да се пипа',
    'TIMEOUT_MS=3000',
    'PORT=3100',
    'EXPORT_PORT_NOTE=3000',
    '',
  ]);
});

test('смяна на порт: скриптът носи копие, откат и проверка на НОВИЯ порт', () => {
  const { cfg } = fixture();
  const spec = applySpec(plan(cfg, { product: 'zabobovdol', newPort: 3100 }));
  assert.match(spec.shell, /cp -a .*преди-смяна-на-порт/);
  assert.match(spec.shell, /^rollback\(\) \{$/m);
  assert.match(spec.shell, /127\.0\.0\.1:3100\/api\/health/);
  assert.match(spec.shell, /rollback; exit 1/, 'провалът на проверката ВРЪЩА назад');
  assert.equal(spec.exclusive, 'system', 'не бива да върви заедно с деплой');
  // Синтаксисът на самия скрипт се проверява, без да се изпълнява.
  execFileSync('bash', ['-n', '-c', spec.shell]);
});
