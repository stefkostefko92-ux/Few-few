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
  assert.ok(ex.args.includes('--no-same-owner'));
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
