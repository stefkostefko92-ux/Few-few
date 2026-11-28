// Файловият мениджър: правилата за пътищата, кошчето и „без тихо презаписване".
// Всичко срещу временна папка — нищо от машината не се пипа.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as f from '../src/fileops.js';
import { isSensitive } from '../src/files.js';

let ROOT;
let cfg;
const log = [];
const audit = { log: (e) => log.push(e) };

before(() => {
  ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'csd-fileops-'));
  cfg = { paths: { stateDir: path.join(ROOT, 'state') } };
  fs.mkdirSync(cfg.paths.stateDir);
});
after(() => fs.rmSync(ROOT, { recursive: true, force: true }));

test('файлове: системните пътища, критичните файлове и самият панел не се трият', () => {
  for (const p of ['/', '/etc', '/opt', '/proc/1', '/boot/vmlinuz', '/usr/bin/ls', '/var/lib/docker/x', '/var/lib/dpkg/status']) {
    assert.throws(() => f.assertMutable(p, cfg), /най-горно ниво|Системен път/, p);
  }
  for (const p of ['/etc/passwd', '/etc/shadow', '/etc/sudoers', '/etc/ssh/sshd_config', '/root/.ssh', '/root/.ssh/authorized_keys']) {
    assert.throws(() => f.assertMutable(p, cfg), /Критичен файл/, p);
  }
  assert.throws(() => f.assertMutable(path.join(import.meta.dirname, '..', 'server.js'), cfg), /самия панел/);
  assert.throws(() => f.assertMutable(path.join(cfg.paths.stateDir, 'audit.jsonl'), cfg), /самия панел/);
  // Нов SSH ключ или sudo ред чрез качване — не.
  assert.throws(() => f.assertCreatable('/root/.ssh/authorized_keys2', cfg), /достъпа до машината/);
  assert.throws(() => f.assertCreatable('/etc/sudoers.d/x', cfg), /достъпа до машината/);
  assert.throws(() => f.assertCreatable('/usr/local/bin/x', cfg), /Системен път/);
  assert.equal(f.assertMutable('/opt/demo/data/x.db', cfg), '/opt/demo/data/x.db');
  assert.throws(() => f.resolvePath('относителен/път'), /абсолютен/);
});

test('файлове: кошче — изтриване, списък, връщане на старото място, изпразване', async () => {
  const dir = path.join(ROOT, 'site');
  fs.mkdirSync(path.join(dir, 'public'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'public', 'index.html'), '<h1>x</h1>');
  const meta = await f.toTrash(path.join(dir, 'public'), cfg, audit, 'u');
  assert.equal(fs.existsSync(path.join(dir, 'public')), false);
  let list = await f.trashList(cfg);
  assert.equal(list.items.length, 1);
  assert.equal(list.items[0].path, path.join(dir, 'public'));
  assert.ok(list.items[0].sizeBytes > 0, 'размерът на папката се смята');
  // Върнато на старото място — със съдържанието.
  await f.trashRestore(meta.id, cfg, audit, 'u');
  assert.equal(fs.readFileSync(path.join(dir, 'public', 'index.html'), 'utf8'), '<h1>x</h1>');
  // Връщане върху нещо, което вече е там — отказ.
  const again = await f.toTrash(path.join(dir, 'public'), cfg, audit, 'u');
  fs.mkdirSync(path.join(dir, 'public'));
  await assert.rejects(f.trashRestore(again.id, cfg, audit, 'u'), /вече има/);
  await f.trashPurge('all', cfg, audit, 'u');
  list = await f.trashList(cfg);
  assert.equal(list.items.length, 0);
  assert.ok(log.some((e) => e.action === 'file.trash') && log.some((e) => e.action === 'file.trashPurge'));
});

test('файлове: кошчето изтича само след trashDays — по-новите остават', async () => {
  const a = path.join(ROOT, 'old.txt');
  const b = path.join(ROOT, 'new.txt');
  fs.writeFileSync(a, 'a');
  fs.writeFileSync(b, 'b');
  const ma = await f.toTrash(a, cfg, audit, 'u');
  await f.toTrash(b, cfg, audit, 'u');
  // Записът на „a" — изтрит преди 8 дни.
  const metaFile = path.join(f.trashDir(cfg), ma.id, 'meta.json');
  fs.writeFileSync(metaFile, JSON.stringify({ ...ma, deletedAt: new Date(Date.now() - 8 * 86400000).toISOString() }));
  const r = await f.trashExpire(cfg, audit);
  assert.equal(r.purged, 1);
  const left = (await f.trashList(cfg)).items.map((i) => i.path);
  assert.deepEqual(left, [b]);
  await f.trashPurge('all', cfg, audit, 'u');
});

test('файлове: местенето не презаписва и не влиза в самото себе си', async () => {
  const a = path.join(ROOT, 'a.txt');
  const b = path.join(ROOT, 'b.txt');
  fs.writeFileSync(a, 'A');
  fs.writeFileSync(b, 'B');
  await assert.rejects(f.rename(a, b, cfg, audit, 'u'), /няма тихо презаписване/);
  assert.equal(fs.readFileSync(b, 'utf8'), 'B');
  const d = path.join(ROOT, 'd');
  fs.mkdirSync(d);
  await assert.rejects(f.rename(d, path.join(d, 'вътре'), cfg, audit, 'u'), /самата себе си/);
  await f.rename(a, path.join(ROOT, 'c.txt'), cfg, audit, 'u');
  assert.equal(fs.readFileSync(path.join(ROOT, 'c.txt'), 'utf8'), 'A');
});

test('файлове: права без setuid, собственик по шаблон, търсене по име, архиви в нова папка', async () => {
  const x = path.join(ROOT, 'x.sh');
  fs.writeFileSync(x, 'echo');
  await assert.rejects(f.chmod(x, '4755', {}, cfg, audit, 'u'), /setuid/);
  await assert.rejects(f.chmod(x, '7777', {}, cfg, audit, 'u'), /setuid/);
  await f.chmod(x, '750', {}, cfg, audit, 'u');
  assert.equal(fs.statSync(x).mode & 0o777, 0o750);
  await assert.rejects(f.chown(x, 'root;reboot', '', {}, cfg, audit, 'u'), /Невалиден/);
  await assert.rejects(f.search(ROOT, 'a/b'), /ИМЕ/);
  const s = await f.search(ROOT, 'x.s');
  assert.ok(s.hits.some((h) => h.path === x));
  const spec = f.archiveSpec([x], cfg);
  assert.equal(spec.cmd, 'tar');
  assert.ok(spec.dest.endsWith('x.sh.tar.gz'));
  fs.writeFileSync(path.join(ROOT, 'pkg.tar.gz'), '');
  const ex = f.extractSpec(path.join(ROOT, 'pkg.tar.gz'), cfg);
  assert.equal(ex.dest, path.join(ROOT, 'pkg'), 'нова папка до архива');
  assert.match(ex.args[1], /--no-same-owner --no-same-permissions/);
  // Папката вече съществува → нова до нея, никога разопаковане върху старата.
  fs.mkdirSync(path.join(ROOT, 'pkg'));
  assert.equal(f.extractSpec(path.join(ROOT, 'pkg.tar.gz'), cfg).dest, path.join(ROOT, 'pkg-2'));
  assert.throws(() => f.extractSpec(path.join(ROOT, 'x.sh'), cfg), /Поддържани/);
});

test('файлове: кошчето е ДО state, не в него — и е защитено от директни действия', () => {
  const t = f.trashDir(cfg);
  assert.equal(path.dirname(t), path.dirname(cfg.paths.stateDir));
  assert.ok(!t.startsWith(cfg.paths.stateDir + '/'), 'в state влиза в нощния бекъп на панела');
  assert.equal(f.trashDir({ paths: { stateDir: '/var/lib/vps-dashboard' } }), '/var/lib/vps-dashboard-trash');
  assert.throws(() => f.assertMutable(path.join(t, 'x', 'item'), cfg), /самия панел/);
});

// Истински EXDEV: /dev/shm е tmpfs. Точно това прави systemd с ReadWritePaths —
// отделна точка на монтиране върху същия диск — и `rename` отказва.
const shm = (() => {
  try {
    const d = fs.mkdtempSync('/dev/shm/csd-x-');
    const other = fs.statSync(d).dev !== fs.statSync(os.tmpdir()).dev;
    fs.rmSync(d, { recursive: true, force: true });
    return other;
  } catch {
    return false;
  }
})();
test('файлове: местене между дялове — копие + изтриване, с таван и без следи при отказ', { skip: !shm && 'няма отделен tmpfs' }, async () => {
  // /dev е забранен за файловия мениджър (правилно) — затова тук директно
  // `moveAny`, който и кошчето, и местенето ползват; пътят през кошчето от /root
  // се проверява в лабораторията под истински systemd.
  const far = fs.mkdtempSync('/dev/shm/csd-far-');
  try {
    const src = path.join(far, 'папка');
    fs.mkdirSync(path.join(src, 'вътре'), { recursive: true });
    fs.writeFileSync(path.join(src, 'вътре', 'a.txt'), 'съдържание');
    // Над тавана — честен отказ, нищо не е пипнато, нищо не е оставено на целта.
    const dst = path.join(ROOT, 'дошло');
    await assert.rejects(f.moveAny(src, dst, { files: { crossDeviceMaxBytes: 1 } }), /друг дял/);
    assert.equal(fs.readFileSync(path.join(src, 'вътре', 'a.txt'), 'utf8'), 'съдържание');
    assert.equal(fs.existsSync(dst), false);
    // В тавана — копие със съдържанието, оригиналът го няма.
    const r = await f.moveAny(src, dst, cfg);
    assert.equal(r.crossDevice, true);
    assert.equal(fs.readFileSync(path.join(dst, 'вътре', 'a.txt'), 'utf8'), 'съдържание');
    assert.equal(fs.existsSync(src), false);
    // И обратно (така минава „Върни" от кошчето към друг дял).
    await f.moveAny(dst, src, cfg);
    assert.equal(fs.readFileSync(path.join(src, 'вътре', 'a.txt'), 'utf8'), 'съдържание');
  } finally {
    fs.rmSync(far, { recursive: true, force: true });
  }
});

test('файлове: /home под ProtectHome=tmpfs се КАЗВА, не се показва като празна', () => {
  const mi = [
    '25 1 8:1 / / rw,relatime shared:1 - ext4 /dev/sda1 rw',
    '300 25 0:60 / /home rw,nosuid,nodev - tmpfs tmpfs rw,mode=755',
  ].join('\n');
  assert.equal(f.sandboxNote('/home/deploy', mi), '/home');
  assert.equal(f.sandboxNote('/home', mi), '/home');
  assert.equal(f.sandboxNote('/opt/x', mi), null);
  // Истински /home на друг диск (ext4) — не е пясъчник, нищо не се казва.
  assert.equal(f.sandboxNote('/home/x', mi.replace('tmpfs tmpfs', 'ext4 /dev/sdb1')), null);
});

test('файлове: тайните на панела не излизат — нито пряко, нито през копие, архив или папка', () => {
  // Копията на конфига носят същите тайни (регексът по `config.json$` ги пропускаше).
  for (const p of ['/etc/vps-dashboard/config.json', '/etc/vps-dashboard/config.json.bak', '/etc/vps-dashboard/config.json.tmp', '/etc/vps-dashboard/restic.env', '/opt/vps-dashboard/deploy/desktop/desktop.env']) {
    assert.ok(isSensitive(p), p);
  }
  assert.equal(isSensitive('/etc/nginx/nginx.conf'), false);
  // Цялата папка с тайните не се сваля; /etc — да, но без нея.
  assert.throws(() => f.downloadPlan('/etc/vps-dashboard', { isSensitive, secretDirs: ['/etc/vps-dashboard'] }), /тайните/);
  const plan = f.downloadPlan('/etc', { isSensitive, secretDirs: ['/etc/vps-dashboard'] });
  assert.ok(plan.dir && plan.excludes.includes('etc/vps-dashboard'), JSON.stringify(plan));
  assert.throws(() => f.downloadPlan('/proc/self/environ'), /Системен/);
  assert.throws(() => f.downloadPlan('/'), /Системен/);
  // Заобиколният път.
  assert.throws(() => f.copySpec('/etc/vps-dashboard/config.json', path.join(ROOT, 'изнесено.json'), cfg), /тайните/);
  assert.throws(() => f.copySpec('/etc', path.join(ROOT, 'etc-копие'), cfg), /тайните/);
  assert.throws(() => f.archiveSpec(['/etc/vps-dashboard'], cfg), /тайните/);
});

test('редактор: копието НЕ ляга в папка, която nginx зарежда цяла', async () => {
  const { backupPathFor, EDIT_BAK_DIR } = await import('../src/files.js');
  const now = new Date('2026-11-01T09:30:00.123Z');
  const avail = path.join(ROOT, 'nginx', 'sites-available');
  const enabled = path.join(ROOT, 'nginx', 'sites-enabled');
  fs.mkdirSync(avail, { recursive: true });
  fs.mkdirSync(enabled, { recursive: true });
  fs.writeFileSync(path.join(avail, 'сайт'), 'server {}');
  fs.symlinkSync(path.join(avail, 'сайт'), path.join(enabled, 'сайт'));
  // През символната връзка — до истинския файл в sites-available.
  assert.equal(backupPathFor(path.join(enabled, 'сайт'), now), path.join(avail, 'сайт.bak-2026-11-01T09-30-00-123Z'));
  // Истински файл в sites-enabled — извън нея.
  fs.writeFileSync(path.join(enabled, 'друг'), 'server {}');
  assert.equal(backupPathFor(path.join(enabled, 'друг'), now), path.join(EDIT_BAK_DIR, 'друг.bak-2026-11-01T09-30-00-123Z'));
  // Обикновен файл — до себе си, както досега.
  assert.equal(backupPathFor(path.join(avail, 'сайт'), now), path.join(avail, 'сайт.bak-2026-11-01T09-30-00-123Z'));
});

test('файлове: големи стари файлове — праг, възраст, отворени, защитени', async () => {
  const dir = path.join(ROOT, 'големи');
  fs.mkdirSync(dir, { recursive: true });
  const big = path.join(dir, 'стар-дъмп.sql');
  const fresh = path.join(dir, 'нов.iso');
  fs.writeFileSync(big, Buffer.alloc(2 * 1024 * 1024 + 10));
  fs.writeFileSync(fresh, Buffer.alloc(2 * 1024 * 1024 + 10));
  fs.writeFileSync(path.join(dir, 'малък.txt'), 'x');
  const old = new Date(Date.now() - 40 * 86400000);
  fs.utimesSync(big, old, old);
  const fd = fs.openSync(big, 'r'); // „жив процес" го държи
  try {
    const r = await f.bigFiles(dir, { minMb: 2, days: 30 }, cfg);
    assert.deepEqual(r.hits.map((h) => h.path), [big], 'само големият И старият');
    assert.equal(r.hits[0].open, true, 'отворен файл не освобождава място — казва се');
    const all = await f.bigFiles(dir, { minMb: 2, days: 0 }, cfg);
    assert.equal(all.hits.length, 2);
  } finally {
    fs.closeSync(fd);
  }
  await assert.rejects(f.bigFiles('/usr', {}, cfg), /Системен/);
  await assert.rejects(f.bigFiles(dir, { minMb: 0 }, cfg), /MB/);
  await assert.rejects(f.bigFiles(dir, { minMb: 5, days: -1 }, cfg), /Дните/);
});

// ── Червен екип (Разбивача, 28.11): децата на критичните папки и символните връзки ──
test('файлове: ДЕЦАТА на /etc/ssh, /root/.ssh и /etc/sudoers.d са защитени като самите папки', () => {
  for (const p of ['/etc/ssh/ssh_host_ed25519_key', '/root/.ssh/id_rsa', '/root/.ssh/authorized_keys2', '/etc/sudoers.d/90-custom', '/etc/ssh/sshd_config.d/50-cloud-init.conf']) {
    assert.throws(() => f.assertMutable(p, cfg), /Критичен/, p);
  }
  // Файл-елементите остават точно съвпадение: /etc/hostsx не е /etc/hosts.
  assert.equal(f.assertMutable('/etc/hostsx', cfg), '/etc/hostsx');
});

test('файлове: символна връзка към защитено място не заобикаля правилата', async () => {
  const d = path.join(ROOT, 'връзки');
  fs.mkdirSync(d, { recursive: true });
  fs.symlinkSync('/etc', path.join(d, 'etc-връзка'));
  fs.symlinkSync('/proc', path.join(d, 'proc-връзка'));
  fs.symlinkSync('/etc/passwd', path.join(d, 'passwd-връзка'));
  // Изтриване „на /etc/shadow" през папка-връзка → кошчето би преместило истинския файл.
  assert.throws(() => f.assertMutable(path.join(d, 'etc-връзка', 'shadow'), cfg), /Критичен файл \(\/etc\/shadow\)/);
  assert.throws(() => f.assertMutable(path.join(d, 'proc-връзка', 'self'), cfg), /Системен/);
  await assert.rejects(f.toTrash(path.join(d, 'etc-връзка', 'shadow'), cfg, audit, 'u'), /Критичен/);
  // Самата връзка се трие (местенето мести връзката, не целта)…
  assert.equal(f.assertMutable(path.join(d, 'passwd-връзка'), cfg), path.join(d, 'passwd-връзка'));
  // …но права/собственик минават ПРЕЗ нея до целта — отказ.
  await assert.rejects(f.chmod(path.join(d, 'passwd-връзка'), '777', {}, cfg, audit, 'u'), /Критичен/);
  await assert.rejects(f.chown(path.join(d, 'passwd-връзка'), 'nobody', '', {}, cfg, audit, 'u'), /Критичен/);
  // Създаване в /etc/ssh през връзка — отказ.
  assert.throws(() => f.assertCreatable(path.join(d, 'etc-връзка', 'ssh', 'нов-ключ'), cfg), /достъпа до машината/);
});

test('файлове: сваляне през символна връзка към тайните на панела — отказ', () => {
  const d = path.join(ROOT, 'връзки-тайни');
  const secretDir = path.join(ROOT, 'етц-панел');
  fs.mkdirSync(d, { recursive: true });
  fs.mkdirSync(secretDir, { recursive: true });
  fs.writeFileSync(path.join(secretDir, 'config.json'), '{"passwordHash":"x"}');
  fs.symlinkSync(path.join(secretDir, 'config.json'), path.join(d, 'невинно.txt'));
  const opts = { isSensitive: (p) => p === path.join(secretDir, 'config.json'), secretDirs: [secretDir] };
  assert.throws(() => f.downloadPlan(path.join(d, 'невинно.txt'), opts), /тайните/);
});

// ── Находките на Кодаджията (28.11) ──────────────────────────────────────────
test('файлове: РОДИТЕЛ на защитен път не се трие (/var/lib → rm -rf dpkg, docker, state)', () => {
  for (const p of ['/var/lib', '/usr/local/..', ROOT]) {
    assert.throws(() => f.assertMutable(p, cfg), /защитен път|най-горно ниво|Системен/, p);
  }
  // ROOT е родител на state — и на кошчето до него.
  assert.throws(() => f.assertMutable(ROOT, cfg), /защитен път/);
  // Съседната папка без нищо защитено вътре — минава.
  const free = path.join(ROOT, 'свободна');
  fs.mkdirSync(free, { recursive: true });
  assert.equal(f.assertMutable(free, cfg), free);
});

test('кошче: копирано на другия дял, но оригиналът остана наполовина — копието НЕ се трие', async () => {
  const src = path.join(ROOT, 'наполовина');
  fs.mkdirSync(src, { recursive: true });
  fs.writeFileSync(path.join(src, 'a.txt'), 'единственото копие');
  // Точно провалът от пробата: cp мина, rm -rf спря на „chattr +i" файл.
  const move = async (from, to) => {
    fs.cpSync(from, to, { recursive: true });
    fs.rmSync(path.join(from, 'a.txt'));
    throw Object.assign(new Error('Копието е готово, но оригиналът не се изтри докрай: Operation not permitted'), { status: 500, copied: true });
  };
  const meta = await f.toTrash(src, cfg, audit, 'u', { move });
  assert.match(meta.warning, /част от оригинала остана/);
  assert.equal(fs.readFileSync(path.join(f.trashDir(cfg), meta.id, 'item', 'a.txt'), 'utf8'), 'единственото копие');
  const list = await f.trashList(cfg);
  assert.ok(list.items.some((i) => i.id === meta.id && i.warning), 'записът е в кошчето, с предупреждението');
  // Обикновен провал (cp не мина) — слотът се чисти както досега.
  const plain = async () => {
    throw Object.assign(new Error('cp не мина'), { status: 500 });
  };
  const before = fs.readdirSync(f.trashDir(cfg)).length;
  await assert.rejects(f.toTrash(src, cfg, audit, 'u', { move: plain }), /cp не мина/);
  assert.equal(fs.readdirSync(f.trashDir(cfg)).length, before, 'без празен слот');
});

test('кошче: несъществуващ запис е 404, а запис без meta.json изтича по часа на папката', async () => {
  await assert.rejects(f.trashPurge('nonexistent00', cfg, audit, 'u'), /Няма такъв запис/);
  const slot = path.join(f.trashDir(cfg), 'brokenslot01');
  fs.mkdirSync(path.join(slot, 'item'), { recursive: true });
  const old = new Date(Date.now() - 30 * 86400000);
  fs.utimesSync(slot, old, old);
  const r = await f.trashExpire(cfg, audit);
  assert.ok(r.purged >= 1);
  assert.equal(fs.existsSync(slot), false, 'счупеният запис не стои вечно');
});

test('разархивиране: tar не прави setuid и отказва устройства/FIFO', async () => {
  const { execFileSync, spawnSync } = await import('node:child_process');
  execFileSync('bash', ['-n', '-c', f.TAR_SAFE_SH]);
  const d = path.join(ROOT, 'tarпроба');
  fs.mkdirSync(path.join(d, 'src'), { recursive: true });
  fs.writeFileSync(path.join(d, 'src', 'suid'), '#!/bin/sh\n');
  fs.chmodSync(path.join(d, 'src', 'suid'), 0o4755);
  execFileSync('tar', ['-cf', path.join(d, 'suid.tar'), '-C', path.join(d, 'src'), 'suid']);
  const spec = f.extractSpec(path.join(d, 'suid.tar'), cfg);
  assert.equal(spec.cmd, 'bash');
  assert.equal(spec.args[1], f.TAR_SAFE_SH, 'пътищата са аргументи, не текст в скрипта');
  fs.mkdirSync(spec.dest, { recursive: true });
  const ok = spawnSync(spec.cmd, spec.args, { encoding: 'utf8' });
  assert.equal(ok.status, 0, ok.stderr);
  assert.equal(fs.statSync(path.join(spec.dest, 'suid')).mode & 0o7000, 0, 'setuid е махнат');
  // FIFO в архива — отказ преди първия байт.
  execFileSync('mkfifo', [path.join(d, 'src', 'тръба')]);
  execFileSync('tar', ['-cf', path.join(d, 'fifo.tar'), '-C', path.join(d, 'src'), 'тръба']);
  const spec2 = f.extractSpec(path.join(d, 'fifo.tar'), cfg);
  fs.mkdirSync(spec2.dest, { recursive: true });
  const bad = spawnSync(spec2.cmd, spec2.args, { encoding: 'utf8' });
  assert.equal(bad.status, 3);
  assert.match(bad.stderr, /устройства или FIFO/);
  assert.deepEqual(fs.readdirSync(spec2.dest), []);
});

test('сваляне: изчезнал файл и паднал tar рязват връзката — процесът оцелява', async () => {
  const http = await import('node:http');
  const gone = path.join(ROOT, 'изчезна.log');
  const srv = http.createServer((req, res) => {
    if (req.url === '/file') f.streamDownload({ path: gone, dir: false, name: 'x.log', sizeBytes: 100 }, res);
    else f.streamDownload({ path: path.join(ROOT, 'няма-папка'), dir: true, name: 'няма-папка', excludes: [] }, res);
  });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${srv.address().port}`;
  try {
    // Не uncaughtException (тестът би паднал), а прекъсната връзка.
    await assert.rejects(fetch(base + '/file', { signal: AbortSignal.timeout(5000) }).then((r) => r.arrayBuffer()), (e) => e.name !== 'TimeoutError');
    await assert.rejects(fetch(base + '/dir', { signal: AbortSignal.timeout(5000) }).then((r) => r.arrayBuffer()), (e) => e.name !== 'TimeoutError', 'tar с код 2 не дава „успешно" отрязан архив');
  } finally {
    srv.close();
  }
});

test('тайните: прегледът през символна връзка към config.json също ги скрива', () => {
  const d = path.join(ROOT, 'връзка-конфиг');
  fs.mkdirSync(d, { recursive: true });
  fs.symlinkSync('/etc/vps-dashboard/config.json', path.join(d, 'config.json'));
  fs.symlinkSync('/etc/vps-dashboard', path.join(d, 'панел'));
  assert.equal(isSensitive(path.join(d, 'config.json')), true, 'целта е тайна, дори да липсва на тази машина');
  assert.equal(isSensitive(path.join(d, 'панел', 'config.json')), true);
  assert.equal(isSensitive(path.join(d, 'друго.txt')), false);
});
