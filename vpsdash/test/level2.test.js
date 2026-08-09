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
  assert.match(spec.shell, /pg_dump -U "\$PGU" --clean --if-exists -d zabobovdol/);
  // Роля „postgres" НЕ съществува в нито един наш стек (zabobovdol/bot/
  // eternaltouch) — заковаването ѝ значеше тих провал на бекъпа.
  assert.match(spec.shell, /printenv POSTGRES_USER/, 'потребителят се чете ОТ контейнера');
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

test('резервни кодове: хеширани, еднократни, времево-константна проверка', async () => {
  const { generateRecoveryCodes, hashRecoveryCode, verifyRecoveryCode, normalizeRecovery } = await import('../src/totp.js');
  const codes = generateRecoveryCodes();
  assert.equal(codes.length, 10);
  assert.match(codes[0], /^[0-9A-F]{4}(-[0-9A-F]{4}){3}$/);
  const hashes = codes.map(hashRecoveryCode);
  // Хешовете не съдържат самия код — открадне ли някой конфига, няма готови ключове.
  assert.ok(!hashes.some((h, i) => h.includes(normalizeRecovery(codes[i]))));

  assert.equal(verifyRecoveryCode(codes[3], hashes), 3);
  // Толерира форматиране (интервали, малки букви, без тирета).
  assert.equal(verifyRecoveryCode(codes[3].toLowerCase().replace(/-/g, ' '), hashes), 3);
  assert.equal(verifyRecoveryCode('AAAA-BBBB-CCCC-DDDD', hashes), -1);
  assert.equal(verifyRecoveryCode('', hashes), -1);
  assert.equal(verifyRecoveryCode(codes[0], []), -1);

  // След изразходване същият код вече не минава.
  const remaining = hashes.filter((_, i) => i !== 3);
  assert.equal(verifyRecoveryCode(codes[3], remaining), -1);
});

test('възстановяване: валидира името на снимката и целта', async () => {
  const { assertDumpName, restoreApplySpec } = await import('../src/backups.js');
  for (const bad of ['../etc/passwd.sqlite.gz', 'x.sh.gz', 'x.sqlite', 'x.gz', '']) {
    assert.throws(() => assertDumpName(bad), `трябваше да отхвърли: ${bad}`);
  }
  // Цел с метазнаци и грешно разширение падат.
  assert.throws(() => restoreApplySpec('няма.sqlite.gz', '/tmp/x.db')); // липсва файлът
});

test('проба: фазите и проверката на съдържание', async () => {
  const { probe, diffDns } = await import('../src/probe.js');
  const bad = await probe({ name: 'няма', url: 'http://127.0.0.1:1/', });
  assert.equal(bad.up, false);
  assert.ok(bad.error, 'недостъпният адрес трябва да носи грешка');
  const invalid = await probe({ name: 'лош', url: 'не-е-url' });
  assert.equal(invalid.up, false);
  // Промяна в DNS записа се засича (отвлечен домейн / изтекла регистрация).
  assert.equal(diffDns(null, { a: ['1.1.1.1'] }), null);
  assert.equal(diffDns({ a: ['1.1.1.1'], aaaa: [] }, { a: ['1.1.1.1'], aaaa: [] }), null);
  assert.deepEqual(diffDns({ a: ['1.1.1.1'], aaaa: [] }, { a: ['9.9.9.9'], aaaa: [] }), { before: '1.1.1.1', after: '9.9.9.9' });
});

test('одит огледало: приема от възел, пази отделно, валидира името', async () => {
  const { Audit } = await import('../src/audit.js');
  const fsx = await import('node:fs');
  const dir = fsx.mkdtempSync(path.join(os.tmpdir(), 'csd-mirror-'));
  const a = new Audit(dir);
  a.log({ action: 'login.ok', user: 'admin' });
  a.log({ action: 'terminal.run', cmd: 'ls' });

  // Изнасяне: „какво има след този хеш".
  const batch = a.since('GENESIS', 10);
  assert.equal(batch.entries.length, 2);
  assert.ok(batch.lastHash && batch.lastHash !== 'GENESIS');
  assert.equal(a.since(batch.lastHash).entries.length, 0, 'след курсора няма нови');

  // Приемане от друг възел — в ОТДЕЛЕН файл, за да не мърси нашата верига.
  const r = a.acceptMirror('vps2', batch.entries);
  assert.equal(r.accepted, 2);
  assert.equal(a.verify().ok, true, 'собствената верига остава цяла');
  assert.equal(a.mirrors().length, 1);
  assert.equal(a.mirrors()[0].node, 'vps2');
  assert.throws(() => a.acceptMirror('../зло', []));
  fsx.rmSync(dir, { recursive: true, force: true });
});

// ── Агентски слой: „липсва" трябва да е ДИАГНОЗА, не съобщение ────────────────
test('инструментите връщат и КЪДЕ е гледал панелът', async () => {
  const { listAgentTools } = await import('../src/agents.js');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'csd-agents-'));

  // Липсваща папка: целият слой е празен, но причината е ЕДНА — да се вижда.
  const gone = listAgentTools({ paths: { currentLink: path.join(dir, 'няма') } });
  assert.equal(gone.rootExists, false, 'разликата „няма папка" ↔ „непълен архив" е първото, което човек трябва да види');
  assert.ok(gone.tools.length, 'списъкът с инструменти не зависи от наличието им');
  assert.ok(gone.tools.every((x) => !x.present));
  assert.ok(gone.root.includes('няма'), 'пътят се връща, иначе „липсва" не подлежи на действие');

  // Папка без tools/ — разгърнат, но непълен архив. Друга причина, друг съвет.
  const partial = listAgentTools({ paths: { currentLink: dir } });
  assert.equal(partial.rootExists, true);
  assert.ok(partial.tools.every((x) => !x.present));

  // Наличен скрипт → present, без да пипаме нищо друго.
  const one = partial.tools[0].script;
  fs.mkdirSync(path.join(dir, path.dirname(one)), { recursive: true });
  fs.writeFileSync(path.join(dir, one), '// x\n');
  const now = listAgentTools({ paths: { currentLink: dir } });
  assert.equal(now.tools.find((x) => x.script === one).present, true);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('изключен бутон трябва и да ИЗГЛЕЖДА изключен', () => {
  // Кодът честно слагаше `disabled`, но в CSS нямаше НИТО едно правило за него:
  // бутонът стоеше ярък и подканващ, натискаш и не става нищо — изглежда като
  // счупен панел, а всъщност е правилно спрян.
  const css = fs.readFileSync(path.join(import.meta.dirname, '..', 'public', 'style.css'), 'utf8');
  const block = css.match(/\.btn:disabled[^}]*\{[^}]*\}/);
  assert.ok(block, 'липсва правило за .btn:disabled');
  // Цветът сам не стига (далтонизъм, силна светлина) — искаме и втори сигнал.
  assert.match(block[0], /opacity/, 'нужна е намалена наситеност');
  assert.match(block[0], /cursor:\s*not-allowed/, 'курсорът е вторият сигнал');
  // И hover-ът трябва да е спрян — иначе бутонът пак „отговаря" на посочване.
  assert.match(css, /\.btn:disabled:hover/, 'изключен бутон не бива да реагира на hover');
});
