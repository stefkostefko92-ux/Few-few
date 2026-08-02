// Тестове за Ниво 1: TOTP, качване на архив, история, логика на алармите.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { generateSecret, base32Encode, base32Decode, hotp, totp, verifyTotp, otpauthUri } from '../src/totp.js';
import { assertArchiveName } from '../src/upload.js';
import { MetricsHistory, compact, RANGES } from '../src/history.js';
import { shouldFire } from '../src/alerts.js';
import { saveConfig } from '../src/config.js';

test('base32: кодиране/декодиране е обратимо', () => {
  const buf = Buffer.from('Carbon Stealth VPS', 'utf8');
  assert.deepEqual(base32Decode(base32Encode(buf)), buf);
  // RFC 4648 контролен вектор
  assert.equal(base32Encode(Buffer.from('foobar')), 'MZXW6YTBOI');
  assert.deepEqual(base32Decode('MZXW6YTBOI'), Buffer.from('foobar'));
  assert.throws(() => base32Decode('нещо!'));
});

test('HOTP: контролни вектори от RFC 4226', () => {
  // Тайната от RFC 4226 („12345678901234567890") в base32.
  const secret = base32Encode(Buffer.from('12345678901234567890', 'utf8'));
  const expected = ['755224', '287082', '359152', '969429', '338314'];
  expected.forEach((code, i) => assert.equal(hotp(secret, i), code));
});

test('TOTP: проверка, прозорец, отхвърляне', () => {
  const secret = generateSecret();
  const now = 1_800_000_000_000;
  const code = totp(secret, now);
  assert.match(code, /^\d{6}$/);
  const step = verifyTotp(secret, code, { atMs: now });
  assert.equal(step, Math.floor(now / 1000 / 30));
  // ±1 стъпка минава (разминат часовник), ±2 — не.
  assert.notEqual(verifyTotp(secret, totp(secret, now - 30_000), { atMs: now }), null);
  assert.equal(verifyTotp(secret, totp(secret, now - 90_000), { atMs: now }), null);
  assert.equal(verifyTotp(secret, '000000', { atMs: now }), null);
  assert.equal(verifyTotp(secret, 'abc', { atMs: now }), null);
  assert.equal(verifyTotp(secret, '', { atMs: now }), null);
});

test('otpauth URI съдържа тайната и издателя', () => {
  const uri = otpauthUri('MZXW6YTBOI', { account: 'admin' });
  assert.match(uri, /^otpauth:\/\/totp\//);
  assert.match(uri, /secret=MZXW6YTBOI/);
  assert.match(uri, /issuer=Carbon\+Stealth\+VPS/);
});

test('име на архив: allowlist срещу traversal', () => {
  assert.equal(assertArchiveName('Few-few.zip'), 'Few-few.zip');
  assert.equal(assertArchiveName('few-few-main.tar.gz'), 'few-few-main.tar.gz');
  for (const bad of ['../etc/passwd.zip', '/root/x.zip', 'a\0.zip', 'x.sh', 'x.zip.sh', '', 'x/y.zip']) {
    assert.throws(() => assertArchiveName(bad), `трябваше да отхвърли: ${bad}`);
  }
});

test('история: запис, четене, прореждане', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'csd-hist-'));
  const h = new MetricsHistory(dir);
  const snap = (ts, cpu) => ({
    ts,
    cpuPct: cpu,
    mem: { used: 5, total: 10 },
    load: [1.5],
    net: { rxBps: 100, txBps: 200 },
    disks: [{ usePercent: 40 }, { usePercent: 70 }],
  });
  const p = compact(snap(1000, 33.33));
  assert.equal(p.cpu, 33.3);
  assert.equal(p.diskMax, 70);
  assert.equal(p.load1, 1.5);

  // maybeAppend е с throttle 30s — първият запис минава, вторият веднага не.
  assert.equal(h.maybeAppend(snap(Date.now(), 10)), true);
  assert.equal(h.maybeAppend(snap(Date.now(), 20)), false);
  assert.equal(h.read().length, 1);

  // Прореждане: 100 точки (на 1s една от друга) → най-много 10.
  const t0 = Date.now();
  fs.writeFileSync(
    h.file,
    Array.from({ length: 100 }, (_, i) => JSON.stringify({ ts: t0 - i * 1000, cpu: i })).join('\n') + '\n'
  );
  assert.ok(h.range(RANGES['24h'], 10).length <= 10);
  // Точки извън прозореца не влизат. Прозорците са нарочно на 500ms от точка,
  // за да не зависи броят от милисекундите между записа и четенето (иначе тестът
  // е flaky точно на границата).
  assert.equal(h.range(500).length, 1); // само най-новата (следващата е на -1000ms)
  assert.equal(h.range(5500).length, 6); // точките на 0…-5000ms
  fs.rmSync(dir, { recursive: true, force: true });
});

test('аларми: задържане на прага', () => {
  assert.equal(shouldFire({ streak: 1, need: 3 }), false);
  assert.equal(shouldFire({ streak: 3, need: 3 }), true);
  // sustain:false пламва веднага (паднала услуга, изтичащ сертификат)
  assert.equal(shouldFire({ sustain: false, streak: 1, need: 3 }), true);
});

test('saveConfig: слива, пази тайните, пише атомарно с mode 600', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'csd-cfg-'));
  const file = path.join(dir, 'config.json');
  const cfg = {
    passwordHash: 'scrypt:x',
    sessionSecret: 'z'.repeat(64),
    totp: { enabled: false, secret: '' },
    alerts: { enabled: true, thresholds: { cpuPct: 90, diskPct: 85 } },
  };
  fs.writeFileSync(file, JSON.stringify(cfg));
  saveConfig(cfg, { totp: { enabled: true, secret: 'ABC' } }, { configPath: file });
  const onDisk = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.equal(onDisk.totp.enabled, true);
  assert.equal(onDisk.totp.secret, 'ABC');
  assert.equal(onDisk.passwordHash, 'scrypt:x'); // не е изгубено
  assert.equal(onDisk.alerts.thresholds.cpuPct, 90); // вложеното сливане пази съседите
  assert.equal(cfg.totp.enabled, true); // и обектът в паметта е обновен
  assert.equal(fs.statSync(file).mode & 0o777, 0o600);
  fs.rmSync(dir, { recursive: true, force: true });
});
