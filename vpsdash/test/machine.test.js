// „Машина": SSH ключовете, пакетите, swap — предпазителите, без да се пипа
// истинската машина (ключовете — във временен файл, sshd — подменен).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import * as m from '../src/machine.js';

let ROOT;
let cfg;
const log = [];
const audit = { log: (e) => log.push(e) };

const sshStr = (b) => {
  const buf = Buffer.isBuffer(b) ? b : Buffer.from(b);
  const len = Buffer.alloc(4);
  len.writeUInt32BE(buf.length);
  return Buffer.concat([len, buf]);
};
const ed25519 = (comment = 'admin@лаптоп') => {
  const blob = Buffer.concat([sshStr('ssh-ed25519'), sshStr(crypto.randomBytes(32))]);
  return { line: `ssh-ed25519 ${blob.toString('base64')} ${comment}`, blob };
};
const rsa = (bits) => {
  const n = Buffer.concat([Buffer.from([0]), crypto.randomBytes(bits / 8)]);
  n[1] |= 0x80;
  const blob = Buffer.concat([sshStr('ssh-rsa'), sshStr(Buffer.from([1, 0, 1])), sshStr(n)]);
  return `ssh-rsa ${blob.toString('base64')} стар`;
};

before(() => {
  ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'csd-machine-'));
  cfg = { paths: { stateDir: path.join(ROOT, 'state') } };
});
after(() => fs.rmSync(ROOT, { recursive: true, force: true }));

test('ssh: редът се разпознава, отпечатъкът е като на ssh-keygen, лъжливият тип се хваща', () => {
  const { line, blob } = ed25519();
  const k = m.parseKeyLine(line);
  assert.equal(k.type, 'ssh-ed25519');
  assert.equal(k.comment, 'admin@лаптоп');
  assert.equal(k.fingerprint, 'SHA256:' + crypto.createHash('sha256').update(blob).digest('base64').replace(/=+$/, ''));
  // Сверка с истинския инструмент, ако го има.
  try {
    const f = path.join(ROOT, 'k.pub');
    fs.writeFileSync(f, line + '\n');
    const out = execFileSync('ssh-keygen', ['-lf', f], { encoding: 'utf8' });
    assert.ok(out.includes(k.fingerprint), out);
  } catch (e) {
    if (e.code !== 'ENOENT') throw e;
  }
  // „ssh-rsa" отпред, ed25519 вътре — редът лъже какъв е.
  assert.equal(m.parseKeyLine(line.replace('ssh-ed25519', 'ssh-rsa')).invalid, true);
  assert.equal(m.parseKeyLine('# коментар'), null);
  assert.equal(m.parseKeyLine('ssh-ed25519 не-е-base64!!').invalid, true);
  assert.equal(m.parseKeyLine(rsa(1024)).weak, true);
  assert.equal(m.parseKeyLine(rsa(1024)).bits, 1024);
  assert.equal(m.parseKeyLine(rsa(4096)).weak, undefined);
  assert.equal(m.parseKeyLine(`command="/bin/x",no-pty ${line}`).options, 'command="/bin/x",no-pty');
});

test('ssh: добавяне — само чист, силен, нов ключ; файлът е 600, копие отива в state', async () => {
  const file = path.join(ROOT, 'ssh', 'authorized_keys');
  const a = ed25519();
  const r = await m.addKey(a.line, cfg, audit, 'u', { file });
  assert.match(r.fingerprint, /^SHA256:/);
  assert.equal(fs.statSync(file).mode & 0o777, 0o600);
  assert.equal(fs.statSync(path.dirname(file)).mode & 0o777, 0o700);
  await assert.rejects(m.addKey(a.line, cfg, audit, 'u', { file }), /вече е добавен/);
  await assert.rejects(m.addKey(`command="curl x|sh" ${ed25519().line}`, cfg, audit, 'u', { file }), /опции/);
  await assert.rejects(m.addKey(rsa(1024), cfg, audit, 'u', { file }), /слаб/);
  await assert.rejects(m.addKey(`${a.line}\n${ed25519().line}`, cfg, audit, 'u', { file }), /един ред/i);
  await assert.rejects(m.addKey('здрасти', cfg, audit, 'u', { file }), /валиден/);
  await m.addKey(ed25519('втори').line, cfg, audit, 'u', { file });
  assert.ok(fs.readdirSync(m.keyBackupDir(cfg)).length >= 1, 'копие преди промяната');
  // В одита — отпечатък, не коментарът (той често е имейл).
  const entry = log.find((e) => e.action === 'ssh.keyAdd');
  assert.ok(entry.fingerprint && !JSON.stringify(entry).includes('лаптоп'));
});

test('ssh: последният ключ НЕ се маха, когато паролата е изключена или не знаем', async () => {
  const file = path.join(ROOT, 'ssh2', 'authorized_keys');
  const a = ed25519();
  const b = ed25519('b');
  await m.addKey(a.line, cfg, audit, 'u', { file });
  await m.addKey(b.line, cfg, audit, 'u', { file });
  const fpA = m.parseKeyLine(a.line).fingerprint;
  const fpB = m.parseKeyLine(b.line).fingerprint;
  const noPw = async () => ({ known: true, passwordAuth: false });
  const unknown = async () => ({ known: false });
  const r = await m.removeKey(fpA, cfg, audit, 'u', { file, sshd: noPw });
  assert.equal(r.left, 1);
  await assert.rejects(m.removeKey(fpB, cfg, audit, 'u', { file, sshd: noPw }), /заключиш/);
  await assert.rejects(m.removeKey(fpB, cfg, audit, 'u', { file, sshd: unknown }), /не мога да проверя/);
  assert.ok(fs.readFileSync(file, 'utf8').includes(b.line.split(' ')[1]), 'ключът си е там');
  const ok = await m.removeKey(fpB, cfg, audit, 'u', { file, sshd: async () => ({ known: true, passwordAuth: true }) });
  assert.equal(ok.left, 0);
  await assert.rejects(m.removeKey('SHA256:кирилица', cfg, audit, 'u', { file }), /Невалиден/);
});

test('ssh: последно влизане по отпечатък от журнала', () => {
  const j = [
    '2026-10-30T08:00:01+0000 vps sshd[1]: Accepted publickey for root from 10.0.0.5 port 50000 ssh2: ED25519 SHA256:AAAA',
    '2026-10-31T09:00:01+0000 vps sshd[2]: Accepted publickey for root from 10.0.0.6 port 50001 ssh2: ED25519 SHA256:AAAA',
    '2026-10-31T09:05:01+0000 vps sshd[3]: Failed password for root from 1.2.3.4 port 1 ssh2',
  ].join('\n');
  const map = m.lastUsedFromJournal(j);
  assert.equal(map.get('SHA256:AAAA').at, '2026-10-31T09:00:01+0000');
  assert.equal(map.size, 1);
});

test('пакети: името минава през шаблон — опция не стига до apt', () => {
  assert.deepEqual(m.installSpec('htop').args, ['install', '-y', '--no-install-recommends', '--', 'htop']);
  for (const bad of ['-o', '--allow-unauthenticated', 'htop vim', 'HTOP', 'a', 'x;reboot', '']) {
    assert.throws(() => m.installSpec(bad), /Невалидно име/, bad);
  }
  assert.equal(m.installSpec('libc++1').args.at(-1), 'libc++1');
});

test('пакети: план за махане и разбор на dpkg', async () => {
  const sim = 'NOTE: This is only a simulation!\nRemv nginx [1.24.0]\nRemv nginx-common [1.24.0]\nInst x\n';
  assert.deepEqual(m.parseRemovePlan(sim), ['nginx', 'nginx-common']);
  const list = m.parseDpkgList('htop\t3.3.0\tii \t400\toptional\tno\nbash\t5.2\tii \t1800\trequired\tyes\nold\t1\trc \t0\toptional\tno\n');
  assert.equal(list.length, 3);
  assert.equal(list.find((p) => p.name === 'old').installed, false);
  assert.equal(list.find((p) => p.name === 'bash').essential, true);
  // Основата не се маха — преди изобщо да се пита apt.
  for (const p of ['openssh-server', 'systemd', 'sudo', 'nodejs']) {
    await assert.rejects(m.removePlan(p), /основата/, p);
  }
});

test('swap: създаване — граници, място, без втори /swapfile; скриптът е валиден bash', () => {
  const info = { swaps: [], swapfileExists: false, diskFreeBytes: 50 * 1024 ** 3 };
  const s = m.createSwapSpec(2048, info);
  execFileSync('bash', ['-n', '-c', s.shell]);
  assert.match(s.shell, /fstab\.преди-swap/, 'копие на fstab преди записа');
  assert.match(s.shell, /grep -qE/, 'редът не се добавя втори път');
  assert.throws(() => m.createSwapSpec(100, info), /от 256/);
  assert.throws(() => m.createSwapSpec('2048; reboot', info), /цяло число/);
  assert.throws(() => m.createSwapSpec(2048, { ...info, swapfileExists: true }), /вече съществува/);
  assert.throws(() => m.createSwapSpec(4096, { ...info, diskFreeBytes: 5 * 1024 ** 3 }), /Няма място/);
});

test('swap: махане — само ако паметта поема изпразването', () => {
  const swaps = [{ file: '/swapfile', type: 'file', sizeKb: 2097148, usedKb: 1500000, priority: -2 }];
  assert.throws(() => m.removeSwapSpec({ swaps, swapfileExists: true, memAvailableKb: 1000000 }), /OOM/);
  const s = m.removeSwapSpec({ swaps, swapfileExists: true, memAvailableKb: 4000000 });
  execFileSync('bash', ['-n', '-c', s.shell]);
  assert.throws(() => m.removeSwapSpec({ swaps: [], swapfileExists: false, memAvailableKb: 1 }), /Няма/);
  assert.deepEqual(m.parseSwaps('Filename\tType\tSize\tUsed\tPriority\n/swapfile file 2097148 0 -2\n'), [{ file: '/swapfile', type: 'file', sizeKb: 2097148, usedKb: 0, priority: -2 }]);
});
