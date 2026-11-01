// „Какво може да се освободи" — предпазителите около триенето.
import test from 'node:test';
import assert from 'node:assert/strict';

import fs from 'node:fs';
import path from 'node:path';
import { reclaimSpec, assertSafePath } from '../src/reclaim.js';

// ── Затвореният списък от пътища ─────────────────────────────────────────────
test('чистене: позволените пътища са ТОЧНО три шаблона', () => {
  assert.equal(assertSafePath('/opt/vps-dashboard.bak-20260802-153000'), '/opt/vps-dashboard.bak-20260802-153000');
  assert.equal(assertSafePath('/opt/few-few/releases/20260801-030000'), '/opt/few-few/releases/20260801-030000');
  assert.equal(assertSafePath('/root/Few-few.zip'), '/root/Few-few.zip');
});

test('чистене: произволен път се ОТКАЗВА, не се „обеззаразява"', () => {
  for (const bad of [
    '/etc/vps-dashboard/config.json',
    '/opt/few-few/current',
    '/var/lib/vps-dashboard',
    '/root/.ssh/id_ed25519',
    '/opt/medqr',
    '/',
    '/opt',
  ]) {
    assert.throws(() => assertSafePath(bad), /не е в позволените/, `трябва да откаже: ${bad}`);
  }
});

test('чистене: изкачване нагоре и относителен път не минават', () => {
  assert.throws(() => assertSafePath('/opt/few-few/releases/../../../etc'), /Отказан път/);
  assert.throws(() => assertSafePath('opt/x.bak-20260101-000000'), /Отказан път/);
  assert.throws(() => assertSafePath('/root/a.zip\0/etc/shadow'), /Отказан път/);
  assert.throws(() => assertSafePath(''), /Отказан път/);
});

test('чистене: releases съвпада ТОЧНО по формата на датата', () => {
  assert.throws(() => assertSafePath('/opt/few-few/releases/current'), /не е в позволените/);
  assert.throws(() => assertSafePath('/opt/few-few/releases/2026'), /не е в позволените/);
});

// ── Командите ────────────────────────────────────────────────────────────────
test('чистене: apt кешът е `apt-get clean`, без shell', () => {
  const s = reclaimSpec('apt-cache');
  assert.equal(s.cmd, 'apt-get');
  assert.deepEqual(s.args, ['clean']);
  assert.equal(s.shell, undefined);
});

test('чистене: Docker е `image prune` БЕЗ -a (иначе маха живи образи)', () => {
  const s = reclaimSpec('dangling-images');
  assert.deepEqual(s.args, ['image', 'prune', '-f']);
  assert.equal(s.args.includes('-a'), false, '-a маха всеки образ без ЖИВ контейнер');
  assert.equal(s.args.includes('--volumes'), false, 'томовете са ДАННИ');
});

test('чистене: ротираните логове съвпадат само по архивни имена', () => {
  const s = reclaimSpec('rotated-logs');
  assert.match(s.shell, /^find \/var\/log/, 'ограничено до /var/log');
  assert.match(s.shell, /-name '\*\.gz'/);
  assert.equal(/\bsyslog\b|\bmessages\b/.test(s.shell), false, 'живият лог няма как да съвпадне');
});

test('чистене: пътищата влизат в командата ЦИТИРАНИ', () => {
  const s = reclaimSpec('old-releases', { paths: ['/opt/few-few/releases/20260101-000000'] });
  assert.match(s.shell, /"\/opt\/few-few\/releases\/20260101-000000"/);
  assert.match(s.shell, /^du -shx/, 'първо КАЗВА колко освобождава, после трие');
});

test('чистене: подхвърлен път в тялото не стига до rm', () => {
  assert.throws(
    () => reclaimSpec('old-releases', { paths: ['/opt/few-few/releases/20260101-000000', '/etc'] }),
    /не е в позволените/
  );
  assert.throws(
    () => reclaimSpec('uploaded-archives', { paths: ['/root/x.zip; rm -rf /'] }),
    /не е в позволените/
  );
});

test('чистене: празен списък не произвежда гол `rm -rf`', () => {
  assert.throws(() => reclaimSpec('deploy-backups', { paths: [] }), /Няма какво да се чисти/);
  assert.throws(() => reclaimSpec('deploy-backups', {}), /Няма какво да се чисти/);
});

test('чистене: непозната категория се ОТКАЗВА', () => {
  assert.throws(() => reclaimSpec('каквото-и-да-е'), /Непозната категория/);
  assert.throws(() => reclaimSpec('docker-volumes'), /Непозната категория/, 'томовете ги няма и няма да ги има');
});

test('чистене: спрените контейнери и томовете НЕ са категория', () => {
  for (const forbidden of ['stopped-containers', 'volumes', 'tmp', 'system-prune']) {
    assert.throws(() => reclaimSpec(forbidden), /Непозната категория/);
  }
});

test('Docker build cache: размерът е ДЕСЕТИЧЕН, не гибибайти', async () => {
  const { parseDockerSize } = await import('../src/reclaim.js');
  // Docker пише GB=10^9. Смятането като 1024^3 надува числото с ~7% — точно
  // видът грешка, заради която панелът би обещал повече, отколкото освобождава.
  assert.equal(parseDockerSize('26.45GB'), 26_450_000_000);
  assert.equal(parseDockerSize('731.9MB'), 731_900_000);
  assert.equal(parseDockerSize('512B'), 512);
  assert.equal(parseDockerSize('0B'), 0);
  // Нечетимото е 0, не NaN: NaN в сумата трови ЦЕЛИЯ общ размер.
  for (const bad of ['', null, undefined, 'много', '26.45 гига', '-5GB']) {
    assert.equal(parseDockerSize(bad), 0, `„${bad}" трябва да е 0, не NaN`);
  }
});

test('build-cache действието чисти СЪЩОТО, което показва', () => {
  const spec = reclaimSpec('build-cache', {});
  assert.equal(spec.cmd, 'docker');
  // Показаното число идва от `docker system df` (възстановимо), затова
  // командата трябва да е `-a` — иначе панелът обещава повече, отколкото прави.
  assert.deepEqual(spec.args, ['builder', 'prune', '-af']);
  assert.equal(spec.exclusive, 'docker', 'не бива да върви успоредно с друго docker действие');
});

test('висящите образи НЕ заемат числото на `system df`', () => {
  // Измерено на живо: панелът показваше 13.8 GB до бутон, който освободи 0B.
  // Числата са за РАЗЛИЧНИ множества — `system df · Images · RECLAIMABLE` брои
  // и тагнатите неизползвани образи, а `image prune -f` (без `-a`) пипа само
  // нетагнатите. Число до бутон е обещание; чуждо число е лъжа.
  const src = fs.readFileSync(path.join(import.meta.dirname, '..', 'src', 'reclaim.js'), 'utf8');
  const fn = src.slice(src.indexOf('async function danglingImages'), src.indexOf('async function buildCache'));
  assert.ok(!/system['"],\s*['"]df/.test(fn) && !fn.includes("'system df'"), 'danglingImages не бива да чете `docker system df`');
  assert.ok(/plural\(ids\.length/.test(fn), 'показва се броят — това е, което бутонът реално маха');
  assert.match(fn, /note:/, 'липсата на размер трябва да е ОБЯСНЕНА, не премълчана');
  // И командата остава без `-a` — това е съзнателно решение, не пропуск.
  const spec = reclaimSpec('dangling-images', {});
  assert.deepEqual(spec.args, ['image', 'prune', '-f']);
});

// ── Новите категории (v1.17) ─────────────────────────────────────────────────
import { execFileSync } from 'node:child_process';
import { isEditorBackup, parseSnapList, CACHE_DIRS } from '../src/reclaim.js';

test('чистене: всеки shell от категориите е СИНТАКТИЧНО верен (bash -n)', () => {
  const specs = [
    reclaimSpec('rotated-logs'),
    reclaimSpec('crash-dumps'),
    reclaimSpec('coredumps'),
    reclaimSpec('old-snaps', { revs: [{ name: 'core22', rev: '1380' }, { name: 'lxd', rev: '29351' }] }),
    reclaimSpec('file-trash', {}, { paths: { stateDir: '/var/lib/vps-dashboard' } }),
    reclaimSpec('old-releases', { paths: ['/opt/few-few/releases/20260101-000000'] }),
  ];
  for (const s of specs) {
    assert.ok(s.shell, s.title);
    execFileSync('bash', ['-n', '-c', s.shell]);
  }
});

test('чистене: кешовете — само ТОЧНИТЕ пътища от затворения списък', () => {
  const s = reclaimSpec('pkg-caches', { paths: ['/root/.npm/_cacache', '/root', '/etc', '/root/.npm/_cacache/../../.ssh'] });
  assert.deepEqual(s.args, ['-rf', '--', '/root/.npm/_cacache']);
  assert.equal(s.cmd, 'rm');
  assert.ok(CACHE_DIRS.every((d) => d.split('/').length >= 4), 'нито един кеш не е папка от горно ниво');
  assert.throws(() => reclaimSpec('pkg-caches', { paths: ['/root'] }), /Няма какво/);
});

test('чистене: копията от редактора — само по точния формат и в позволените корени', () => {
  assert.ok(isEditorBackup('/etc/nginx/nginx.conf.bak-2026-10-01T09-30-00-123Z'));
  assert.ok(isEditorBackup('/opt/сайт/конфиг на сайта.bak-2026-10-01T09-30-00-123Z'), 'кирилица и интервал минават (rm без shell)');
  for (const bad of [
    '/etc/nginx/nginx.conf.bak', // чужд .bak
    '/etc/nginx/nginx.conf.bak-20261001-093000', // формата на деплоя, не на редактора
    '/usr/lib/x.bak-2026-10-01T09-30-00-123Z', // извън корените
    '/etc/../usr/x.bak-2026-10-01T09-30-00-123Z',
    '/etc/x\n.bak-2026-10-01T09-30-00-123Z',
  ]) {
    assert.equal(isEditorBackup(bad), false, bad);
  }
  const s = reclaimSpec('editor-backups', { paths: ['/etc/a.bak-2026-10-01T09-30-00-123Z', '/etc/shadow'] });
  assert.deepEqual(s.args, ['-f', '--', '/etc/a.bak-2026-10-01T09-30-00-123Z']);
});

test('чистене: snap — само изключените ревизии, активната никога', () => {
  const text = [
    'Name    Version   Rev    Tracking       Publisher   Notes',
    'core22  20240111  1122   latest/stable  canonical✓  base,disabled',
    'core22  20240408  1380   latest/stable  canonical✓  base',
    'lxd     5.21.1    28463  5.21/stable    canonical✓  disabled',
    'lxd     5.21.2    29351  5.21/stable    canonical✓  -',
  ].join('\n');
  assert.deepEqual(parseSnapList(text), [{ name: 'core22', rev: '1122' }, { name: 'lxd', rev: '28463' }]);
  const s = reclaimSpec('old-snaps', { revs: [{ name: 'lxd; reboot', rev: '1' }, { name: 'lxd', rev: '28463' }] });
  assert.equal(s.shell, 'snap remove lxd --revision=28463 && echo "✔ Готово"');
});

test('чистене: прегледите на бекъпи — само файлове в restore/', () => {
  const s = reclaimSpec('restore-previews', { paths: ['/var/lib/vps-dashboard/restore/medqr.db', '/var/lib/vps-dashboard/audit.jsonl', '/var/lib/vps-dashboard/restore/../config'] });
  assert.deepEqual(s.args, ['-f', '--', '/var/lib/vps-dashboard/restore/medqr.db']);
});
