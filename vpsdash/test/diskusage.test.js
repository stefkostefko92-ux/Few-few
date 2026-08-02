// „Кой яде диска" — сканиране, разбор и предпазителите.
//
// Най-важното тук не е разборът, а двете „не": произволен път НЕ се сканира
// (иначе панелът е „изброй имената на файловете навсякъде като root"), и
// прекъснато сканиране НЕ минава за пълна картина.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

import {
  roots,
  assertRoot,
  assertDepth,
  assertMinMB,
  scanSpec,
  parseScan,
  DiskScanStore,
  vacuumJournalSpec,
  pruneBuildCacheSpec,
} from '../src/diskusage.js';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'csd-disk-'));
const CFG = { paths: {} };

test('диск: кореновите пътища са ЗАТВОРЕН списък', () => {
  const allowed = roots(CFG);
  assert.ok(allowed.includes('/'), 'коренът винаги е там');
  assert.equal(assertRoot(CFG, '/'), '/');
  for (const bad of ['/etc', '/root/.ssh', '/var/../root', '/nonexistent-xyz', '/tmp/../etc', '/opt/../etc']) {
    assert.throws(() => assertRoot(CFG, bad), /не е в списъка/, `${JSON.stringify(bad)} трябва да е отказан`);
  }
  // Липсващият корен пада на „/" НАРОЧНО: това е сканирането, което човек иска,
  // когато не е избрал нищо, и е безобидно (само четене, с таван на изхода).
  for (const empty of ['', null, undefined]) assert.equal(assertRoot(CFG, empty), '/');
});

test('диск: конфигурираните папки влизат в списъка, опасните знаци — не', () => {
  const dir = tmp();
  const withCfg = roots({ paths: { stateDir: dir } });
  assert.ok(withCfg.includes(dir), 'stateDir от конфига е валиден корен');
  // Път с шел метасимвол не бива да стигне до `du` — там влиза в shell ред.
  assert.equal(roots({ paths: { stateDir: '/tmp/a;rm -rf /' } }).includes('/tmp/a;rm -rf /'), false);
  assert.equal(roots({ paths: { stateDir: '/tmp/`id`' } }).some((p) => p.includes('`')), false);
});

test('диск: дълбочина и минимален размер са с граници', () => {
  assert.equal(assertDepth(undefined), 2);
  assert.equal(assertDepth(4), 4);
  for (const bad of [0, 5, -1, 1.5, 'две']) assert.throws(() => assertDepth(bad), /1–4/);
  assert.equal(assertMinMB(undefined), 50);
  for (const bad of [0, -5, 1.5, 'петдесет', 1024 * 1000]) assert.throws(() => assertMinMB(bad), /1–102400/);
});

test('диск: сканиращият скрипт е валиден bash и не прекосява файлови системи', () => {
  const spec = scanSpec(CFG, { root: '/', depth: 1, minMB: 100 });
  assert.match(spec.shell, /du -x -B1 --max-depth=1 \//, '-x пази от двойно броене през /proc и монтирани томове');
  assert.match(spec.shell, /find \/ -xdev -type f -size \+100M/);
  assert.equal(spec.exclusive, 'system', 'не заедно с бекъп/деплой — сканирането е тежко по вход-изход');
  execFileSync('bash', ['-n', '-c', spec.shell]);
});

// ── Разборът ─────────────────────────────────────────────────────────────────
const OUT = [
  '▸ Сканирам /',
  '###ПАПКИ',
  '5368709120\t/var/lib/docker',
  '2147483648\t/var/log',
  '1073741824\t/opt/few-few',
  'du: cannot read directory: няма достъп',
  '###ФАЙЛОВЕ',
  '3221225472\t/var/lib/docker/overlay2/abc/diff/huge.img',
  '104857600\t/var/log/nginx/access.log.1',
  '###КРАЙ',
].join('\n');

test('диск: разборът взема само редовете „байтове\\tпът" и подрежда по размер', () => {
  const p = parseScan(OUT);
  assert.equal(p.complete, true);
  assert.deepEqual(p.dirs.map((d) => d.path), ['/var/lib/docker', '/var/log', '/opt/few-few']);
  assert.equal(p.dirs[0].bytes, 5368709120);
  assert.equal(p.files.length, 2, 'шумът от du не влиза никъде');
  assert.equal(p.files[0].path, '/var/lib/docker/overlay2/abc/diff/huge.img');
});

test('диск: пътища с интервали и кирилица оцеляват разбора', () => {
  const p = parseScan(['###ФАЙЛОВЕ', '123\t/opt/моят проект/файл с интервали.tar.gz', '###КРАЙ'].join('\n'));
  assert.equal(p.files[0].path, '/opt/моят проект/файл с интервали.tar.gz');
  assert.equal(p.files[0].bytes, 123);
});

test('диск: без маркер за край резултатът НЕ е пълен', () => {
  const cut = OUT.slice(0, OUT.indexOf('###КРАЙ'));
  const p = parseScan(cut);
  assert.equal(p.complete, false, 'прекъснато сканиране не бива да минава за отговор');
  assert.ok(p.dirs.length, 'но каквото е събрано, се разбира');
});

test('диск: провален изход не се записва като пълна картина, дори с маркер', () => {
  const st = new DiskScanStore(tmp());
  const rec = st.record({ root: '/', depth: 2, minMB: 50, output: OUT, code: 1 });
  assert.equal(rec.complete, false, 'изход ≠ 0 значи не вярваме на резултата');
  assert.equal(rec.code, 1);
  assert.ok(rec.dirs.length);
});

test('диск: успешното сканиране преживява рестарт (mode 600)', () => {
  const dir = tmp();
  new DiskScanStore(dir).record({ root: '/', depth: 2, minMB: 50, output: OUT, code: 0 });
  const again = new DiskScanStore(dir);
  assert.equal(again.state.complete, true);
  assert.equal(again.state.dirs[0].path, '/var/lib/docker');
  assert.equal(fs.statSync(path.join(dir, 'disk-scan.json')).mode & 0o777, 0o600);
});

// ── Освобождаване ────────────────────────────────────────────────────────────
test('диск: свиването на журнала е с граници и БЕЗ shell', () => {
  const spec = vacuumJournalSpec(512);
  assert.equal(spec.cmd, 'journalctl');
  assert.deepEqual(spec.args, ['--vacuum-size=512M']);
  assert.equal(spec.shell, undefined, 'нула shell — нула инжекция');
  for (const bad of [0, 15, -1, 'много', 1024 * 100, '512M']) {
    assert.throws(() => vacuumJournalSpec(bad), /16–51200/, `${bad} трябва да е отказан`);
  }
});

test('диск: чисти се САМО build кешът — никакъв system prune', () => {
  const spec = pruneBuildCacheSpec();
  assert.deepEqual(spec.args, ['builder', 'prune', '-f']);
  // `docker system prune -a --volumes` трие томове с ЖИВИ данни (качени файлове,
  // бази). Най-честият начин човек да си направи инцидент, докато „чисти място".
  // Проверява се САМО командата: `exclusive: 'system'` иначе прави наивното
  // търсене на низа „system" в целия обект лъжливо положително.
  const args = spec.args.join(' ');
  assert.equal(args.includes('system'), false);
  assert.equal(args.includes('--volumes'), false);
  assert.equal(args.includes('-a'), false);
  assert.equal(spec.cmd, 'docker');
});
