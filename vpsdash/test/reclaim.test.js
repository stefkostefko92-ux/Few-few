// „Какво може да се освободи" — предпазителите около триенето.
import test from 'node:test';
import assert from 'node:assert/strict';

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
