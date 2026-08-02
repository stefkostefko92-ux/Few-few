// Регресии по находките на Разбивача (R1–R5). Всеки тест пада преди поправката.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createSession, verifySession } from '../src/auth.js';
import { Audit, hashLine } from '../src/audit.js';
import { PEER_DENY } from '../src/routes.js';

const SECRET = 'z'.repeat(64);

test('R1: поколението обезсилва всички издадени сесии наведнъж', () => {
  const tok = createSession(SECRET, 'admin', 60_000, { gen: 0 });
  assert.ok(verifySession(SECRET, tok, { gen: 0 }), 'валидна при същото поколение');
  assert.equal(verifySession(SECRET, tok, { gen: 1 }), null, 'след „изход от всички устройства" пада');
});

test('R1: поименната отмяна спира откраднат токен веднага', () => {
  const tok = createSession(SECRET, 'admin', 60_000, { jti: 'сесия-1' });
  const revoked = new Set();
  assert.ok(verifySession(SECRET, tok, { revoked }));
  revoked.add('сесия-1');
  assert.equal(verifySession(SECRET, tok, { revoked }), null, 'отменената сесия трябва да пада');
});

test('R2: абсолютният таван бие подновяването при бездействие', () => {
  // Дълга бисквитка, но абсолютният таван вече е минал.
  const tok = createSession(SECRET, 'admin', 3600_000, { absoluteMs: -1 });
  assert.equal(verifySession(SECRET, tok), null, 'сесия отвъд абсолютния таван трябва да пада');
  // И обратно: изтекла бисквитка пада дори с далечен таван.
  const stale = createSession(SECRET, 'admin', -1, { absoluteMs: 3600_000 });
  assert.equal(verifySession(SECRET, stale), null);
});

test('R4: хеш-веригата хваща изтрит ред', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'csd-audit-'));
  const a = new Audit(dir);
  a.log({ action: 'login.ok', user: 'admin' });
  a.log({ action: 'terminal.run', cmd: 'нещо опасно', user: 'admin' });
  a.log({ action: 'logout', user: 'admin' });
  assert.equal(a.verify().ok, true, 'непокътнатият дневник е валиден');

  // Нападателят изрязва средния ред (следата от терминала).
  const lines = fs.readFileSync(a.file, 'utf8').split('\n').filter(Boolean);
  fs.writeFileSync(a.file, [lines[0], lines[2]].join('\n') + '\n');
  const v = new Audit(dir).verify();
  assert.equal(v.ok, false, 'изрязаният ред трябва да се хване');
  assert.equal(v.brokenAt, 2);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('R4: подменено съдържание на ред също къса веригата', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'csd-audit2-'));
  const a = new Audit(dir);
  a.log({ action: 'login.ok', user: 'admin' });
  a.log({ action: 'power.reboot', user: 'admin' });
  a.log({ action: 'logout', user: 'admin' });
  const lines = fs.readFileSync(a.file, 'utf8').split('\n').filter(Boolean);
  const tampered = JSON.parse(lines[1]);
  tampered.action = 'нещо безобидно';
  lines[1] = JSON.stringify(tampered);
  fs.writeFileSync(a.file, lines.join('\n') + '\n');
  const v = new Audit(dir).verify();
  assert.equal(v.ok, false);
  assert.equal(v.brokenAt, 3, 'следващият ред вече не сочи правилния предшественик');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('R4: провалът при запис е шумен, не мълчалив', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'csd-audit3-'));
  const a = new Audit(dir);
  let alerted = 0;
  a.onWriteFailure = () => alerted++;
  a.file = '/proc/няма-такъв/audit.jsonl'; // запис, който няма как да мине
  a.log({ action: 'test' });
  assert.equal(alerted, 1, 'трябва да вдигне аларма');
  assert.equal(a.writeFailures, 1);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('R5: peer с обхват „read" не стига до опасните маршрути', () => {
  const denied = [
    '/api/terminal/run',
    '/api/pty/open',
    '/api/pty/abc/input',
    '/api/power',
    '/api/files/write',
    '/api/files/read',
    '/api/deploy/run',
    '/api/deploy/rollback',
    '/api/firewall/rule',
    '/api/agents/tools/run',
    '/api/totp/disable',
  ];
  for (const p of denied) {
    assert.ok(PEER_DENY.some((rx) => rx.test(p)), `трябваше да е забранен за peer: ${p}`);
  }
  // Четенето на състояние остава разрешено — federation-ът трябва да е полезен.
  for (const p of ['/api/overview', '/api/services', '/api/metrics/history', '/api/alerts', '/api/docker']) {
    assert.ok(!PEER_DENY.some((rx) => rx.test(p)), `не биваше да е забранен: ${p}`);
  }
});

test('hashLine е детерминистичен и къс', () => {
  assert.equal(hashLine('нещо'), hashLine('нещо'));
  assert.notEqual(hashLine('нещо'), hashLine('нещо друго'));
  assert.equal(hashLine('x').length, 22);
});
