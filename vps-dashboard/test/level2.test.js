// Тестове за Ниво 2 — най-вече валидацията, която стои между браузъра и
// системните команди (ufw, compose, pg_dump).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildRuleArgs } from '../src/firewall.js';
import { composeActionSpec } from '../src/compose.js';
import { postgresDumpSpec, sqliteDumpSpec } from '../src/databases.js';
import { writeFile } from '../src/files.js';

const audit = { log: () => {} };

test('firewall: валидни правила дават очакваните аргументи', () => {
  assert.deepEqual(buildRuleArgs({ action: 'allow', port: '22', proto: 'tcp' }), ['allow', '22/tcp']);
  assert.deepEqual(buildRuleArgs({ action: 'deny', port: '8080' }), ['deny', '8080']);
  assert.deepEqual(buildRuleArgs({ action: 'allow', port: 'ssh' }), ['allow', 'ssh']);
  assert.deepEqual(buildRuleArgs({ action: 'limit', port: '1000:2000', proto: 'udp' }), ['limit', '1000:2000/udp']);
  assert.deepEqual(buildRuleArgs({ action: 'allow', port: '5432', proto: 'tcp', from: '10.0.0.0/8' }), [
    'allow', 'from', '10.0.0.0/8', 'to', 'any', 'port', '5432', 'proto', 'tcp',
  ]);
  assert.deepEqual(buildRuleArgs({ action: 'allow', port: '80', comment: 'уеб' }), ['allow', '80', 'comment', 'уеб']);
});

test('firewall: отхвърля инжекции и безсмислици', () => {
  const bad = [
    { action: 'allow; rm -rf /', port: '22' },
    { action: 'allow', port: '22; reboot' },
    { action: 'allow', port: '$(whoami)' },
    { action: 'allow', port: '0' },
    { action: 'allow', port: '99999' },
    { action: 'allow', port: '1:2:3' },
    { action: 'allow', port: '22', proto: 'tcp; ls' },
    { action: 'allow', port: '22', from: '`id`' },
    { action: 'allow', port: '22', from: '10.0.0.1; cat /etc/shadow' },
    { action: 'allow', port: '1000:2000' }, // диапазон без протокол
    { action: 'allow', port: '22', comment: 'зло\nправило' },
    { action: '', port: '22' },
    { action: 'allow', port: '' },
  ];
  for (const r of bad) assert.throws(() => buildRuleArgs(r), `трябваше да отхвърли: ${JSON.stringify(r)}`);
});

test('compose: валидира проект, действие и compose файл', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'csd-compose-'));
  const conf = path.join(dir, 'docker-compose.yml');
  fs.writeFileSync(conf, 'services: {}\n');
  const spec = composeActionSpec({ project: 'zabobovdol', configFile: conf, action: 'up' });
  assert.equal(spec.cmd, 'docker');
  assert.deepEqual(spec.args.slice(0, 5), ['compose', '-p', 'zabobovdol', '-f', conf]);
  assert.ok(spec.args.includes('-d'));
  assert.equal(spec.exclusive, 'compose:zabobovdol');

  assert.throws(() => composeActionSpec({ project: 'a;b', configFile: conf, action: 'up' }));
  assert.throws(() => composeActionSpec({ project: 'ok', configFile: conf, action: 'exec' }));
  assert.throws(() => composeActionSpec({ project: 'ok', configFile: '/etc/passwd', action: 'up' }));
  assert.throws(() => composeActionSpec({ project: 'ok', configFile: path.join(dir, 'няма.yml'), action: 'up' }));
  fs.rmSync(dir, { recursive: true, force: true });
});

test('бази: dump спецификациите валидират имената', () => {
  const spec = postgresDumpSpec({ container: 'zbd-postgres-1', database: 'zabobovdol' });
  assert.match(spec.shell, /pg_dump -U postgres -d zabobovdol/);
  assert.equal(spec.exclusive, 'backup');
  for (const bad of [
    { container: 'c;rm -rf /', database: 'db' },
    { container: 'c', database: 'db; DROP DATABASE x' },
    { container: '', database: 'db' },
    { container: 'c', database: '' },
  ]) {
    assert.throws(() => postgresDumpSpec(bad), `трябваше да отхвърли: ${JSON.stringify(bad)}`);
  }
  assert.throws(() => sqliteDumpSpec('/etc/passwd'));
});

test('файлове: записът прави копие и не създава нови без изричен create', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'csd-files-'));
  const f = path.join(dir, 'test.conf');
  fs.writeFileSync(f, 'първо\n');
  const r = writeFile(f, 'второ\n', {}, audit, 'test');
  assert.equal(fs.readFileSync(f, 'utf8'), 'второ\n');
  assert.equal(fs.readFileSync(r.backup, 'utf8'), 'първо\n');

  // Несъществуващ файл без create → грешка; с create → създава се.
  const missing = path.join(dir, 'нов.conf');
  assert.throws(() => writeFile(missing, 'x', {}, audit, 'test'));
  const created = writeFile(missing, 'ново\n', { create: true }, audit, 'test');
  assert.equal(created.backup, null);
  assert.equal(fs.readFileSync(missing, 'utf8'), 'ново\n');

  // Правата на съществуващ файл се запазват.
  const perm = path.join(dir, 'perm.conf');
  fs.writeFileSync(perm, 'a\n', { mode: 0o600 });
  writeFile(perm, 'b\n', {}, audit, 'test');
  assert.equal(fs.statSync(perm).mode & 0o777, 0o600);
  fs.rmSync(dir, { recursive: true, force: true });
});
