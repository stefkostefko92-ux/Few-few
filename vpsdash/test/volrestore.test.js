// Възстановяване на томове/папки — огледалото на архивирането.
//
// Най-опасната операция след възстановяването на база, затова тестовете гонят
// точно капаните: смес от две състояния (изпразване преди extract), грешна цел
// (хешът в името), плитък път (find -delete върху „/"), и че откатът е в СЪЩИЯ
// скрипт. Dir веригата се ИЗПЪЛНЯВА наистина върху фикстура.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

import {
  archiveName,
  parseArchiveName,
  assertRestoreDir,
  volumeRestorePreviewSpec,
  volumeRestoreApplySpec,
} from '../src/volumes.js';
import { DUMP_DIR } from '../src/databases.js';

// ── Имена ────────────────────────────────────────────────────────────────────
test('томове: името на архива се разбира до цел', () => {
  const v = parseArchiveName('vol-aso_pgdata-20260730-031500.tar.gz');
  assert.equal(v.kind, 'volume');
  assert.equal(v.volume, 'aso_pgdata');
  const d = parseArchiveName('dir-_opt_medqr_uploads-a1b2c3-20260730-031500.tar.gz');
  assert.equal(d.kind, 'dir');
  assert.equal(d.safeName, '_opt_medqr_uploads-a1b2c3');
  // Защитната снимка е сама по себе си възстановима — иначе откатът на отката
  // изисква SSH.
  const p = parseArchiveName('pre-restore-vol-aso_pgdata-20260730-040000.tar.gz');
  assert.equal(p.volume, 'aso_pgdata');
});

test('томове: чуждо/опасно име се отказва', () => {
  for (const bad of [
    '../../etc/cron.d/x.tar.gz',
    'vol-a;rm.tar.gz',
    'vol-x.tar.gz', // без времеви печат
    'medqr.sqlite-20260730-031500.tar.gz', // дъмп на база, не том
    'vol-a-20260730-031500.tar.gz.exe',
    '',
  ]) {
    assert.throws(() => parseArchiveName(bad), /Невалидно име/, JSON.stringify(bad));
  }
});

test('томове: плиткият път за възстановяване се отказва (find -delete върху „/")', () => {
  assert.equal(assertRestoreDir('/opt/medqr/uploads'), '/opt/medqr/uploads');
  for (const bad of ['/', '/opt', '/var', 'relative/path', '/opt/../x', '/opt/a b', '/opt/`id`']) {
    assert.throws(() => assertRestoreDir(bad), /Невалиден|плитък/, JSON.stringify(bad));
  }
});

// ── Спекове ──────────────────────────────────────────────────────────────────
test('томове: прегледът е само четене — нито ред, който пише', () => {
  const spec = volumeRestorePreviewSpec('vol-uploads-20260730-031500.tar.gz');
  const sh = spec.args[1];
  execFileSync('bash', ['-n', '-c', sh]);
  for (const danger of ['-delete', 'rm ', 'xzf', 'mv ', '> /']) {
    assert.equal(sh.includes(danger), false, `прегледът не бива да съдържа „${danger}"`);
  }
  assert.match(sh, /tar tzf/);
});

test('томове: прилагането за том носи снимка → изпразване → extract → откат → trap', () => {
  const spec = volumeRestoreApplySpec('vol-uploads-20260730-031500.tar.gz', { containers: ['medqr'] });
  const sh = spec.args[1];
  execFileSync('bash', ['-n', '-c', sh]);
  assert.match(sh, /trap restart_stopped EXIT/, 'рестартът е в trap — и по пътя на провала');
  assert.match(sh, /pre-restore-vol-uploads-/, 'защитната снимка е преди всичко друго');
  assert.match(sh, /find \/dst -mindepth 1 -delete && tar xzf/, 'изпразване ПРЕДИ extract — иначе смес от две състояния');
  assert.match(sh, /връщам защитната снимка/);
  assert.match(sh, /docker stop medqr/);
  const snapshotFirst = sh.indexOf('pre-restore-vol-') < sh.indexOf('docker stop');
  assert.ok(snapshotFirst, 'снимката е преди спирането — при провал на снимката нищо не е пипнато');
  assert.equal(spec.exclusive, 'backup');
});

test('томове: за папка целта се ДОКАЗВА по хеша — грешната се отказва преди първия байт', () => {
  const target = '/opt/medqr/uploads';
  const name = `dir-${archiveName(target)}-20260730-031500.tar.gz`;
  const spec = volumeRestoreApplySpec(name, { target });
  execFileSync('bash', ['-n', '-c', spec.args[1]]);
  assert.throws(
    () => volumeRestoreApplySpec(name, { target: '/opt/vizitka/uploads' }),
    /хешът в името не съвпада/,
    'архив на medqr върху vizitka трябва да е невъзможен'
  );
});

// ── Истинско изпълнение на dir веригата ──────────────────────────────────────
test('томове: dir веригата НАИСТИНА връща старото съдържание (изпълнена)', () => {
  // Фикстура с достатъчна дълбочина (assertRestoreDir иска ≥2 нива).
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'csd-volr-'));
  const target = path.join(base, 'uploads');
  fs.mkdirSync(target, { recursive: true });
  fs.writeFileSync(path.join(target, 'старо.txt'), 'от архива');
  fs.mkdirSync(path.join(target, 'подпапка'));
  fs.writeFileSync(path.join(target, 'подпапка', 'вложен.txt'), 'дълбок');

  // Архивът се прави с истинската конвенция за име.
  fs.mkdirSync(DUMP_DIR, { recursive: true });
  const name = `dir-${archiveName(target)}-20260730-031500.tar.gz`;
  execFileSync('tar', ['czf', path.join(DUMP_DIR, name), '-C', target, '.']);

  // Състоянието се променя СЛЕД архива: нов файл + променен стар.
  fs.writeFileSync(path.join(target, 'нов-след-архива.txt'), 'не бива да оцелее');
  fs.writeFileSync(path.join(target, 'старо.txt'), 'ПРЕЗАПИСАНО');

  const spec = volumeRestoreApplySpec(name, { target, containers: [] });
  const out = execFileSync('bash', ['-c', spec.args[1]], { encoding: 'utf8' });

  assert.equal(fs.readFileSync(path.join(target, 'старо.txt'), 'utf8'), 'от архива', 'старото съдържание е върнато');
  assert.equal(fs.existsSync(path.join(target, 'нов-след-архива.txt')), false, 'файлът СЛЕД архива не оцелява — не смесваме състояния');
  assert.equal(fs.readFileSync(path.join(target, 'подпапка', 'вложен.txt'), 'utf8'), 'дълбок');
  assert.match(out, /✔ Върнато/);

  // Защитната снимка съществува и носи ПРЕЗАПИСАНОТО (следархивното) състояние.
  const pre = fs.readdirSync(DUMP_DIR).filter((n) => n.startsWith(`pre-restore-dir-${archiveName(target)}`));
  assert.equal(pre.length, 1, 'защитната снимка остава след успех');
  const check = fs.mkdtempSync(path.join(os.tmpdir(), 'csd-volr-pre-'));
  execFileSync('tar', ['xzf', path.join(DUMP_DIR, pre[0]), '-C', check]);
  assert.equal(fs.readFileSync(path.join(check, 'старо.txt'), 'utf8'), 'ПРЕЗАПИСАНО', 'снимката пази точно това, което възстановяването заличи');

  // Чистене (тестът не оставя следи в живата папка с дъмпове).
  fs.rmSync(path.join(DUMP_DIR, name), { force: true });
  fs.rmSync(path.join(DUMP_DIR, pre[0]), { force: true });
});

test('томове: счупен архив → откат връща текущото (изпълнена)', () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'csd-volr2-'));
  const target = path.join(base, 'uploads');
  fs.mkdirSync(target, { recursive: true });
  fs.writeFileSync(path.join(target, 'ценно.txt'), 'текущото състояние');

  fs.mkdirSync(DUMP_DIR, { recursive: true });
  const name = `dir-${archiveName(target)}-20260730-031500.tar.gz`;
  fs.writeFileSync(path.join(DUMP_DIR, name), 'това не е gzip'); // счупен архив

  const spec = volumeRestoreApplySpec(name, { target, containers: [] });
  let code = 0;
  let out = '';
  try {
    out = execFileSync('bash', ['-c', spec.args[1]], { encoding: 'utf8' });
  } catch (err) {
    code = err.status;
    out = String(err.stdout || '') + String(err.stderr || '');
  }
  assert.notEqual(code, 0, 'счупеният архив е провал, не тих успех');
  assert.match(out, /връщам защитната снимка/);
  assert.equal(fs.readFileSync(path.join(target, 'ценно.txt'), 'utf8'), 'текущото състояние', 'откатът върна точно каквото имаше');

  for (const n of fs.readdirSync(DUMP_DIR)) {
    if (n.includes(archiveName(target))) fs.rmSync(path.join(DUMP_DIR, n), { force: true });
  }
});
