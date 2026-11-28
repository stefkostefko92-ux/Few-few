// Файлов мениджър — операциите, които променят машината.
//
// `files.js` четеше и редактираше текст. Това е останалото: качване, сваляне,
// нова папка, преименуване/местене, копиране, кошче, права, собственик, търсене,
// архиви, размер. Панелът върви като root, значи всеки бутон тук е root действие
// с приятен интерфейс — затова правилата са твърди и на ЕДНО място:
//
//  · Изтриването отива в КОШЧЕ (преименуване — мигновено, обратимо). Окончателното
//    е отделно действие с изписване. Кошчето се чисти само след `files.trashDays`.
//  · Системните пътища (/proc, /boot, /usr, вътрешностите на dpkg/Docker…) и
//    критичните файлове (passwd, shadow, sudoers, SSH ключовете на root) не се
//    трият, местят и не им се сменят правата оттук. Редакцията на текст минава
//    през `files.js`, който пази копие.
//  · Собствените файлове на панела (код, конфиг, state) — също: панел, който може
//    да изтрие сам себе си през собствения си бутон, е капан.
//  · Тежките неща (копиране, архив, изтриване на дърво, размер) са отделни
//    процеси или задачи — синхронен обход на голямо дърво спира целия панел.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { run } from './exec.js';
import { CONFIG_PATH } from './config.js';
import { isSensitive as isSecretFile, secretDirs as panelSecretDirs, resolveLinks } from './files.js';

const PANEL_DIR = path.resolve(import.meta.dirname, '..');

// Тук НИЩО не се пипа оттук, дори четенето да е позволено.
const HARD_DENY = [
  '/proc', '/sys', '/dev', '/run', '/boot', '/usr', '/bin', '/sbin', '/lib', '/lib32', '/lib64', '/libx32', '/snap',
  '/var/lib/dpkg', '/var/lib/apt', '/var/lib/docker', '/var/lib/containerd',
];
// Без тях машината не пуска никого (или пуска всеки). Редакция — да, през files.js
// с копие; изтриване/местене/права — не.
const CRITICAL = [
  '/etc/passwd', '/etc/shadow', '/etc/group', '/etc/gshadow', '/etc/sudoers', '/etc/sudoers.d', '/etc/fstab',
  '/etc/ssh', '/etc/ssh/sshd_config', '/etc/hostname', '/etc/hosts', '/root/.ssh', '/root/.ssh/authorized_keys',
];

const under = (p, root) => p === root || p.startsWith(root.endsWith('/') ? root : root + '/');
const err = (msg, status = 400) => Object.assign(new Error(msg), { status });

// Тайните на панела не излизат през заобиколен път: „Копирай config.json в /tmp"
// или „Архивирай /etc/vps-dashboard", после „Свали" копието. Root терминалът пак
// може да ги прочете — това стеснява щетата от открадната сесия, не е граница.
function assertNotSecret(full, what) {
  if (isSecretFile(full)) throw err(`Този файл съдържа тайните на панела — не се ${what} оттук.`, 403);
  if (panelSecretDirs().some((d) => under(full, d) || under(d, full))) throw err(`Тук са тайните на панела — не се ${what} оттук.`, 403);
}

export function resolvePath(p) {
  const s = String(p ?? '');
  if (!s || s.includes('\0')) throw err('Невалиден път');
  if (!path.isAbsolute(s)) throw err('Пътят трябва да е абсолютен');
  return path.resolve(s);
}

function ownDirs(cfg) {
  // Кошчето също: записите в него се пипат само през „Кошче" (иначе meta.json и
  // съдържанието се разминават и „Върни" слага грешно нещо на грешно място).
  return [PANEL_DIR, path.dirname(path.resolve(CONFIG_PATH)), cfg?.paths?.stateDir, trashDir(cfg)].filter(Boolean).map((d) => path.resolve(d));
}

// Истинските форми на пътя. Проверката по ТЕКСТ на пътя не вижда символните
// връзки: папка на продукт с връзка към /etc прави `<връзка>/shadow` „обикновен"
// файл, а кошчето премества истинския /etc/shadow. Затова правилата важат и за
// пътя през връзките на ПАПКАТА; последното име не се следва (rename/кошче местят
// самата връзка, не целта) — освен при права и собственик (`follow`): chmod и
// chown минават през връзката до целта.
// `resolveLinks` минава и през висящи връзки и несъществуваща опашка — иначе път
// през връзка към още несъществуваща папка (`<връзка>/ssh/нов`) минава като текст.
function realForms(full, follow) {
  const out = [full, full === '/' ? '/' : path.join(resolveLinks(path.dirname(full)), path.basename(full))];
  if (follow) out.push(resolveLinks(full));
  return [...new Set(out)];
}

// Дял само за четене за процеса на панела — казва се ПРЕДИ опита. Грешката на fs
// не стига: `mkdirSync(…, {recursive: true})` на Node връща ENOENT вместо EROFS
// (видяно в лабораторията под новия unit), т.е. „Няма такъв път" за папка, която
// е пред очите ти. /home е такава по замисъл (unit-ът я връзва само за четене).
function assertWritableMount(full) {
  const mp = readOnlyMount(full);
  if (!mp) return;
  const why = mp === '/home' ? 'пясъчникът на unit-а — пазачът на SSH ключовете чете, не пипа' : 'дялът е монтиран „ro“';
  throw err(`${mp} е само за четене за панела (${why}) — промени по SSH.`, 409);
}

// Може ли това да се ТРИЕ/МЕСТИ/да му се сменят правата.
export function assertMutable(p, cfg, { follow = false } = {}) {
  const full = resolvePath(p);
  for (const f of realForms(full, follow)) {
    if (f.split('/').filter(Boolean).length < 2) throw err(`Папка от най-горно ниво (${f}) не се пипа оттук.`, 403);
    if (HARD_DENY.some((r) => under(f, r))) throw err(`Системен път (${f}) — не се пипа от панела.`, 403);
    // under(), не точно съвпадение: децата на /etc/ssh, /root/.ssh и /etc/sudoers.d
    // (частните ключове на хоста и на root, sudo редовете) минаваха — само
    // `create` ги пазеше с under() (червен екип, Разбивача 28.11).
    if (CRITICAL.some((r) => under(f, r))) throw err(`Критичен файл (${f}) — само редакция с копие, не триене, местене или права.`, 403);
    if (ownDirs(cfg).some((r) => under(f, r))) throw err(`Това са файловете на самия панел (${f}).`, 403);
    // И РОДИТЕЛИТЕ им: правилата пазеха само пътищата ПОД защитените, затова
    // „Изтрий завинаги" върху /var/lib пускаше `rm -rf /var/lib` — dpkg, apt,
    // docker, state и кошчето на панела наведнъж (Кодаджията 28.11).
    if ([...HARD_DENY, ...CRITICAL, ...ownDirs(cfg)].some((r) => r !== f && under(r, f))) {
      throw err(`Вътре в ${f} има защитен път — папката не се трие, мести и не ѝ се сменят правата оттук.`, 403);
    }
    assertWritableMount(f);
  }
  return full;
}

// Може ли тук да се СЪЗДАДЕ нещо (папка, качен файл, цел на копие/местене).
// Вътре в тези папки нов файл е промяна на достъпа до машината (нов SSH ключ, нов
// sudo ред) — за ключовете има отделна секция с проверки, качването не е пътят.
const CRITICAL_DIRS = ['/etc/sudoers.d', '/etc/ssh', '/root/.ssh'];

export function assertCreatable(p, cfg) {
  const full = resolvePath(p);
  if (full === '/') throw err('Коренът не е място за файлове.');
  for (const f of realForms(full, false)) {
    if (f === '/') throw err('Коренът не е място за файлове.');
    if (HARD_DENY.some((r) => under(f, r))) throw err(`Системен път (${f}) — не се пише от панела.`, 403);
    if (CRITICAL_DIRS.some((r) => under(f, r))) throw err(`Тук (${f}) нов файл променя достъпа до машината — не оттук.`, 403);
    if (ownDirs(cfg).some((r) => under(f, r))) throw err(`Това са файловете на самия панел (${f}).`, 403);
    assertWritableMount(f);
  }
  return full;
}

const NAME_RX = /^[^/\0]{1,255}$/;
export function assertName(name) {
  const s = String(name ?? '');
  if (!NAME_RX.test(s) || s === '.' || s === '..') throw err('Невалидно име');
  return s;
}

// ── Пясъчникът на unit-а ────────────────────────────────────────────────────
// Unit-ът слага ПРАЗЕН tmpfs върху /run/user (а по-старите версии — и върху
// /home, с ProtectHome=tmpfs). Файловият мениджър там вижда празна папка — а
// празна папка изглежда точно като „нищо няма", т.е. успокояващата нула. Казва се.
const SANDBOX_HIDDEN = ['/home', '/run/user'];

// Точката на монтиране, под която е пътят, ако е монтирана САМО ЗА ЧЕТЕНЕ за
// процеса на панела (/home — по замисъл на unit-а; дял, паднал в ro след грешки
// на диска). Иначе човекът разбира чак от провала на първото действие.
const unescapeMount = (s) => s.replace(/\\([0-7]{3})/g, (_m, o) => String.fromCharCode(parseInt(o, 8)));
export function readOnlyMount(p, mountinfo = null) {
  const full = path.resolve(String(p || '/'));
  let text = mountinfo;
  if (text == null) {
    try {
      text = fs.readFileSync('/proc/self/mountinfo', 'utf8');
    } catch {
      return null;
    }
  }
  let best = null;
  for (const line of text.split('\n')) {
    const f = line.split(' ');
    if (f.length < 6) continue;
    const mp = unescapeMount(f[4]);
    // Последното съвпадение печели при еднаква дължина: по-късният mount е отгоре.
    if (under(full, mp) && (!best || mp.length >= best.mp.length)) best = { mp, ro: f[5].split(',').includes('ro') };
  }
  return best?.ro ? best.mp : null;
}
export function sandboxNote(p, mountinfo = null) {
  const full = path.resolve(String(p || '/'));
  const root = SANDBOX_HIDDEN.find((r) => under(full, r));
  if (!root) return null;
  let text = mountinfo;
  if (text == null) {
    try {
      text = fs.readFileSync('/proc/self/mountinfo', 'utf8');
    } catch {
      return null;
    }
  }
  // Поле 5 е точката на монтиране, след „ - " идва типът на файловата система.
  const hit = text.split('\n').some((line) => {
    const [pre, post] = line.split(' - ');
    return pre && post && pre.split(' ')[4] === root && post.split(' ')[0] === 'tmpfs';
  });
  return hit ? root : null;
}

// ── Собственици ─────────────────────────────────────────────────────────────
function idMap(file) {
  const map = new Map();
  try {
    for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
      const [name, , id] = line.split(':');
      if (name && id !== undefined) map.set(Number(id), name);
    }
  } catch {
    /* няма файла — показват се числата */
  }
  return map;
}
export function owners() {
  return { users: idMap('/etc/passwd'), groups: idMap('/etc/group') };
}

// ── Информация ──────────────────────────────────────────────────────────────
function sha256File(full) {
  return new Promise((resolve, reject) => {
    const h = crypto.createHash('sha256');
    fs.createReadStream(full).on('data', (c) => h.update(c)).on('end', () => resolve(h.digest('hex'))).on('error', reject);
  });
}

export async function info(p, { hash = false } = {}) {
  const full = resolvePath(p);
  const st = fs.lstatSync(full);
  const { users, groups } = owners();
  const out = {
    path: full,
    type: st.isDirectory() ? 'dir' : st.isSymbolicLink() ? 'link' : st.isFile() ? 'file' : 'other',
    sizeBytes: st.size,
    mode: '0' + (st.mode & 0o777).toString(8),
    owner: users.get(st.uid) ?? String(st.uid),
    group: groups.get(st.gid) ?? String(st.gid),
    mtime: st.mtime.toISOString(),
    ctime: st.ctime.toISOString(),
  };
  if (out.type === 'link') {
    try {
      out.target = fs.readlinkSync(full);
    } catch {
      /* счупена връзка */
    }
  }
  // Хеш само при поискване и до таван: 20 GB образ на диск иначе държи заявката минути.
  if (hash && out.type === 'file' && st.size <= 4 * 1024 ** 3) out.sha256 = await sha256File(full);
  return out;
}

export async function dirSize(p) {
  const full = resolvePath(p);
  const r = await run('du', ['-sxb', '--', full], { timeout: 60000 });
  const n = Number(String(r.stdout).trim().split(/\s+/)[0]);
  if (!Number.isFinite(n)) throw err(`du не отговори: ${(r.stderr || '').slice(0, 120)}`);
  return { path: full, sizeBytes: n, partial: !r.ok };
}

// ── Създаване ───────────────────────────────────────────────────────────────
export function mkdir(p, cfg, audit, user) {
  const full = assertCreatable(p, cfg);
  if (fs.existsSync(full)) throw err('Вече съществува', 409);
  fs.mkdirSync(full, { recursive: true, mode: 0o755 });
  audit.log({ action: 'file.mkdir', path: full, user });
  return { path: full };
}

// Качване: суровото тяло (без multipart), стрийм към <име>.part, после rename.
// Съществуващ файл НЕ се презаписва тихо: или изрично `overwrite`, при което
// старият отива в кошчето (обратимо), или отказ.
export function receiveUpload(req, cfg, dir, name, { overwrite = false } = {}, audit, user) {
  const base = assertName(name);
  const parent = assertCreatable(dir, cfg);
  const finalPath = path.join(parent, base);
  // Случаен суфикс + `wx`: две паралелни качвания на едно име иначе пишеха в ЕДИН
  // временен файл и второто тихо презаписваше първото.
  const tmpPath = `${finalPath}.csd-part-${process.pid}-${crypto.randomBytes(6).toString('hex')}`;
  const maxBytes = Number(cfg.uploads?.maxBytes) || 3 * 1024 ** 3;
  if (!fs.existsSync(parent) || !fs.statSync(parent).isDirectory()) throw err('Папката не съществува');
  if (fs.existsSync(finalPath) && !overwrite) throw err('Файл с това име вече има — избери „замени", за да отиде старият в кошчето.', 409);
  return new Promise((resolve, reject) => {
    const out = fs.createWriteStream(tmpPath, { mode: 0o644, flags: 'wx' });
    const hash = crypto.createHash('sha256');
    let size = 0;
    let failed = false;
    const fail = (e) => {
      if (failed) return;
      failed = true;
      out.destroy();
      fs.rm(tmpPath, { force: true }, () => reject(e));
    };
    req.on('data', (c) => {
      size += c.length;
      if (size > maxBytes) {
        req.destroy();
        fail(err('Файлът е над тавана за качване', 413));
        return;
      }
      hash.update(c);
    });
    req.on('error', fail);
    out.on('error', fail);
    out.on('finish', () => {
      if (failed) return;
      try {
        let replaced = null;
        const sha256 = hash.digest('hex');
        const finish = (replaced) => {
          fs.renameSync(tmpPath, finalPath);
          audit.log({ action: 'file.upload', path: finalPath, sizeBytes: size, sha256, replaced, user });
          resolve({ path: finalPath, sizeBytes: size, sha256, replaced });
        };
        if (!fs.existsSync(finalPath)) return finish(null);
        toTrash(finalPath, cfg, audit, user, { reason: 'замяна при качване' }).then((m) => {
          try {
            finish(m.id);
          } catch (e) {
            fail(e);
          }
        }, fail);
      } catch (e) {
        fail(e);
      }
    });
    req.pipe(out);
  });
}

// ── Местене / копиране ──────────────────────────────────────────────────────
// `rename()` е мигновен, но само в рамките на ЕДНА точка на монтиране — а
// systemd прави всеки ReadWritePaths/BindPaths (`/root`, state папката…) ОТДЕЛНА
// точка дори върху същия диск. Хванато в лабораторията: кошчето отказваше ВСЕКИ
// файл от /opt с „друг дял", при зелени unit тестове (там няма bind mount).
// Затова при EXDEV: копие → изтриване на оригинала, с таван на размера и
// проверка за място ПРЕДИ първия байт. Над тавана — честен отказ с изход
// („Копирай" е фонова задача без таван), не HTTP заявка, която виси минути.
export function crossMaxBytes(cfg) {
  const n = Number(cfg?.files?.crossDeviceMaxBytes);
  return Number.isFinite(n) && n > 0 ? n : 2 * 1024 ** 3;
}

function freeBytes(dir) {
  try {
    const s = fs.statfsSync(dir);
    return s.bavail * s.bsize;
  } catch {
    return null;
  }
}

export async function moveAny(src, dst, cfg) {
  try {
    fs.renameSync(src, dst);
    return { crossDevice: false };
  } catch (e) {
    if (e.code !== 'EXDEV') throw e;
  }
  const st = fs.lstatSync(src);
  const size = st.isDirectory() ? (await dirSize(src)).sizeBytes : st.size;
  const max = crossMaxBytes(cfg);
  if (size > max) {
    throw err(`На друг дял и над ${Math.round(max / 1024 ** 3)} GB — ползвай „Копирай" (фонова задача), после изтрий оригинала.`, 409);
  }
  const free = freeBytes(path.dirname(dst));
  if (free != null && free < size + 64 * 1024 ** 2) throw err('Няма достатъчно място на целта.', 507);
  const cp = await run('cp', ['-a', '--no-target-directory', '--', src, dst], { timeout: 30 * 60 * 1000 });
  if (!cp.ok) {
    await run('rm', ['-rf', '--', dst], { timeout: 10 * 60 * 1000 });
    throw err(`cp не мина: ${(cp.stderr || '').slice(0, 160)}`, 500);
  }
  const rm = await run('rm', ['-rf', '--', src], { timeout: 10 * 60 * 1000 });
  // Копието е цяло, а от оригинала е останала ЧАСТ: `rm -rf` трие каквото може и
  // спира на първия упорит файл (`chattr +i`, зает mount). `copied` казва на
  // извикващия, че копието е ЕДИНСТВЕНОТО цяло — не се трие при отката.
  if (!rm.ok) throw Object.assign(err(`Копието е готово, но оригиналът не се изтри докрай: ${(rm.stderr || '').slice(0, 160)}`, 500), { copied: true });
  return { crossDevice: true, sizeBytes: size };
}

export async function rename(from, to, cfg, audit, user) {
  const src = assertMutable(from, cfg);
  const dst = assertCreatable(to, cfg);
  if (!fs.existsSync(src) && !isLink(src)) throw err('Няма такъв файл', 404);
  if (fs.existsSync(dst)) throw err('На целта вече има нещо — няма тихо презаписване.', 409);
  if (under(dst, src)) throw err('Папка не може да се премести в самата себе си.');
  const how = await moveAny(src, dst, cfg);
  audit.log({ action: 'file.rename', from: src, to: dst, crossDevice: how.crossDevice, user });
  return { from: src, to: dst, ...how };
}

export function copySpec(from, to, cfg) {
  const src = resolvePath(from);
  if (HARD_DENY.some((r) => under(src, r))) throw err('Системен път — не се копира оттук.', 403);
  assertNotSecret(src, 'копира');
  const dst = assertCreatable(to, cfg);
  if (!fs.existsSync(src)) throw err('Няма такъв файл', 404);
  if (fs.existsSync(dst)) throw err('На целта вече има нещо — няма тихо презаписване.', 409);
  if (under(dst, src)) throw err('Папка не може да се копира в самата себе си.');
  return { title: `Копиране → ${dst}`, cmd: 'cp', args: ['-a', '--', src, dst], timeoutMs: 6 * 3600 * 1000 };
}

function isLink(p) {
  try {
    return fs.lstatSync(p).isSymbolicLink();
  } catch {
    return false;
  }
}

// ── Кошче ───────────────────────────────────────────────────────────────────
// Живее ДО state папката (`/var/lib/vps-dashboard-trash`), не в нея — по две
// причини. (1) state е ReadWritePaths, тоест отделна точка на монтиране за
// процеса на панела: оттам `rename` от /opt, /etc, /srv, /var е EXDEV. Съседната
// папка е на основния mount и местенето е мигновено за всякакъв размер. (2) state
// влиза в нощния шифриран бекъп на панела — изтритите гигабайти нямат място там.
// От /root и от истински отделен дял минава през копие (`moveAny`, с таван).
export function trashDir(cfg) {
  if (cfg?.files?.trashDir) return path.resolve(String(cfg.files.trashDir));
  const state = path.resolve(cfg?.paths?.stateDir || '/var/lib/vps-dashboard');
  return path.join(path.dirname(state), path.basename(state) + '-trash');
}
const ID_RX = /^[a-z0-9]{8,40}$/;

export async function toTrash(p, cfg, audit, user, { reason = '', move = moveAny } = {}) {
  const full = assertMutable(p, cfg);
  if (!fs.existsSync(full) && !isLink(full)) throw err('Няма такъв файл', 404);
  const dir = trashDir(cfg);
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const id = Date.now().toString(36) + crypto.randomBytes(4).toString('hex');
  const slot = path.join(dir, id);
  fs.mkdirSync(slot, { mode: 0o700 });
  const st = fs.lstatSync(full);
  let how;
  let partial = null;
  try {
    how = await move(full, path.join(slot, 'item'), cfg);
  } catch (e) {
    // Цялото копие е вече в слота, а от оригинала е останала част: изтриването на
    // слота тук губеше ЕДИНСТВЕНОТО пълно копие (доказано с `chattr +i` през два
    // дяла). Записът остава в кошчето и се казва какво е останало на мястото.
    if (!e.copied) {
      fs.rmSync(slot, { recursive: true, force: true });
      throw e;
    }
    how = { crossDevice: true };
    partial = e.message;
  }
  const meta = { id, path: full, isDir: st.isDirectory(), sizeBytes: st.isDirectory() ? null : st.size, deletedAt: new Date().toISOString(), user, reason, crossDevice: how.crossDevice };
  if (partial) meta.warning = `Пълното копие е в кошчето, но част от оригинала остана на мястото — провери го (${partial.slice(0, 120)}).`;
  fs.writeFileSync(path.join(slot, 'meta.json'), JSON.stringify(meta), { mode: 0o600 });
  audit.log({ action: 'file.trash', path: full, id, partial: Boolean(partial), user });
  return meta;
}

export async function trashList(cfg) {
  const dir = trashDir(cfg);
  let ids = [];
  try {
    ids = fs.readdirSync(dir).filter((d) => ID_RX.test(d));
  } catch {
    return { items: [], totalBytes: 0, days: trashDays(cfg) };
  }
  const items = [];
  for (const id of ids.slice(0, 500)) {
    try {
      items.push(JSON.parse(fs.readFileSync(path.join(dir, id, 'meta.json'), 'utf8')));
    } catch {
      // Без meta.json няма `deletedAt` — без часа на папката такъв запис не
      // изтичаше НИКОГА и трупаше място вечно.
      let mtime = null;
      try {
        mtime = fs.statSync(path.join(dir, id)).mtime.toISOString();
      } catch {
        /* изчезнал междувременно */
      }
      items.push({ id, path: '?', broken: true, mtime });
    }
  }
  // Размерът на папките — с един `du` за всички, не по едно на ред.
  const dirs = items.filter((i) => i.isDir || i.broken);
  if (dirs.length) {
    const r = await run('du', ['-sxb', '--', ...dirs.map((i) => path.join(dir, i.id))], { timeout: 30000 });
    for (const line of r.stdout.split('\n')) {
      const m = /^(\d+)\s+(.+)$/.exec(line.trim());
      if (!m) continue;
      const it = dirs.find((i) => path.join(dir, i.id) === m[2]);
      if (it) it.sizeBytes = Number(m[1]);
    }
  }
  items.sort((a, b) => String(b.deletedAt).localeCompare(String(a.deletedAt)));
  return { items, totalBytes: items.reduce((s, i) => s + (i.sizeBytes || 0), 0), days: trashDays(cfg) };
}

export async function trashRestore(id, cfg, audit, user) {
  if (!ID_RX.test(String(id))) throw err('Невалиден запис');
  const slot = path.join(trashDir(cfg), id);
  const meta = JSON.parse(fs.readFileSync(path.join(slot, 'meta.json'), 'utf8'));
  const dst = assertMutable(meta.path, cfg);
  if (fs.existsSync(dst) || isLink(dst)) throw err('На старото място вече има нещо — премести го първо.', 409);
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  // Таванът не важи за връщането: веднъж прието в кошчето, не бива да остане там.
  await moveAny(path.join(slot, 'item'), dst, { files: { crossDeviceMaxBytes: Number.MAX_SAFE_INTEGER } });
  fs.rmSync(slot, { recursive: true, force: true });
  audit.log({ action: 'file.restore', path: dst, id, user });
  return { path: dst };
}

export async function trashPurge(id, cfg, audit, user) {
  const dir = trashDir(cfg);
  const targets = id === 'all' ? fs.readdirSync(dir).filter((d) => ID_RX.test(d)) : [String(id)];
  if (!targets.every((t) => ID_RX.test(t))) throw err('Невалиден запис');
  // `rm -rf` на несъществуващо излиза с 0 — иначе „изтрит 1" за запис, който го няма.
  if (id !== 'all' && !fs.existsSync(path.join(dir, targets[0]))) throw err('Няма такъв запис в кошчето.', 404);
  const r = await run('rm', ['-rf', '--', ...targets.map((t) => path.join(dir, t))], { timeout: 10 * 60 * 1000 });
  if (!r.ok) throw err(`rm не мина: ${(r.stderr || '').slice(0, 160)}`, 500);
  audit.log({ action: 'file.trashPurge', count: targets.length, scope: id === 'all' ? 'all' : 'one', user });
  return { purged: targets.length };
}

export function trashDays(cfg) {
  const n = Number(cfg?.files?.trashDays);
  return Number.isInteger(n) && n >= 1 && n <= 90 ? n : 7;
}

// Изтича само: записите, по-стари от `trashDays`. Вика се по каданс от server.js.
export async function trashExpire(cfg, audit, now = Date.now()) {
  const days = trashDays(cfg);
  const { items } = await trashList(cfg);
  const when = (i) => Date.parse(i.deletedAt || i.mtime || '');
  const old = items.filter((i) => Number.isFinite(when(i)) && now - when(i) > days * 86400000).map((i) => i.id);
  if (!old.length) return { purged: 0 };
  const dir = trashDir(cfg);
  const r = await run('rm', ['-rf', '--', ...old.map((t) => path.join(dir, t))], { timeout: 10 * 60 * 1000 });
  // Одитът пише какво СТАНА: провален rm не е „изтекли N".
  const left = old.filter((t) => fs.existsSync(path.join(dir, t))).length;
  audit?.log?.({ action: 'file.trashExpire', count: old.length - left, failed: left || undefined, days, ...(r.ok ? {} : { error: (r.stderr || '').slice(0, 160) }) });
  return { purged: old.length - left, failed: left };
}

// Окончателно — без кошче. За файлове на друг дял или когато мястото трябва СЕГА.
export async function removeForever(p, cfg, audit, user) {
  const full = assertMutable(p, cfg);
  if (!fs.existsSync(full) && !isLink(full)) throw err('Няма такъв файл', 404);
  audit.log({ action: 'file.deleteForever', path: full, user });
  const r = await run('rm', ['-rf', '--', full], { timeout: 30 * 60 * 1000 });
  if (!r.ok) throw err(`rm не мина: ${(r.stderr || '').slice(0, 160)}`, 500);
  return { path: full };
}

// ── Права и собственик ──────────────────────────────────────────────────────
// Без setuid/setgid (4xxx/2xxx): през панела това е готова врата към root.
const MODE_RX = /^[01]?[0-7]{3}$/;
const OWNER_RX = /^([a-z_][a-z0-9_.-]{0,31}|\d{1,10})$/;

export async function chmod(p, mode, { recursive = false } = {}, cfg, audit, user) {
  const full = assertMutable(p, cfg, { follow: true });
  const m = String(mode ?? '');
  if (!MODE_RX.test(m)) throw err('Правата са 3 цифри (напр. 644, 755); setuid/setgid не се дават оттук.');
  const r = await run('chmod', [...(recursive ? ['-R'] : []), m, '--', full], { timeout: 5 * 60 * 1000 });
  if (!r.ok) throw err(`chmod: ${(r.stderr || '').slice(0, 160)}`);
  audit.log({ action: 'file.chmod', path: full, mode: m, recursive: Boolean(recursive), user });
  return { path: full, mode: m };
}

export async function chown(p, owner, group, { recursive = false } = {}, cfg, audit, user) {
  const full = assertMutable(p, cfg, { follow: true });
  const o = String(owner ?? '');
  const g = String(group ?? '');
  if (!OWNER_RX.test(o) || (g && !OWNER_RX.test(g))) throw err('Невалиден потребител или група');
  const r = await run('chown', [...(recursive ? ['-R'] : []), g ? `${o}:${g}` : o, '--', full], { timeout: 5 * 60 * 1000 });
  if (!r.ok) throw err(`chown: ${(r.stderr || '').slice(0, 160)}`);
  audit.log({ action: 'file.chown', path: full, owner: o, group: g, recursive: Boolean(recursive), user });
  return { path: full, owner: o, group: g };
}

// ── Търсене ─────────────────────────────────────────────────────────────────
export async function search(root, q, { limit = 300 } = {}) {
  const base = resolvePath(root || '/');
  if (HARD_DENY.some((r) => under(base, r)) && base !== '/') throw err('Системен път — не се претърсва.', 403);
  const term = String(q ?? '').trim();
  if (term.length < 2 || term.length > 80 || term.includes('/')) throw err('Търсенето е по ИМЕ: 2–80 знака, без „/".');
  // `-xdev`: без /proc, /sys и монтирани томове. Масив аргументи — нула shell.
  const r = await run('find', [base, '-xdev', '-maxdepth', '10', '-iname', `*${term}*`, '-printf', '%y\t%s\t%T@\t%p\n'], { timeout: 25000, maxBuffer: 16 * 1024 * 1024 });
  const rows = r.stdout.split('\n').filter(Boolean);
  const hits = rows.slice(0, limit).map((l) => {
    const [t, s, m, ...rest] = l.split('\t');
    return { path: rest.join('\t'), isDir: t === 'd', isLink: t === 'l', sizeBytes: Number(s), mtime: new Date(Number(m) * 1000).toISOString() };
  });
  return { root: base, q: term, hits, truncated: rows.length > limit, partial: !r.ok };
}

// ── Големи стари файлове ────────────────────────────────────────────────────
// „Кой яде диска" показва папки; тук е другото: КОНКРЕТНИ файлове над N MB, които
// никой не е пипал от D дни — забравен дъмп, стар ISO, лог от 2024, архив,
// качен „временно". Решението е на човека (контекстът е пред очите му), а
// изтриването е през кошчето, тоест обратимо.
//
// Отворен файл НЕ освобождава място при изтриване — процесът го държи, докато
// не го затвори, и `df` не мърда. Затова всеки ред казва дали е отворен.
function openPaths(candidates) {
  const want = new Set(candidates);
  const open = new Set();
  let pids = [];
  try {
    pids = fs.readdirSync('/proc').filter((d) => /^\d+$/.test(d));
  } catch {
    return null; // не знаем — и го казваме (null ≠ „нищо не е отворено")
  }
  for (const pid of pids) {
    let fds = [];
    try {
      fds = fs.readdirSync(`/proc/${pid}/fd`);
    } catch {
      continue;
    }
    for (const fd of fds) {
      try {
        const t = fs.readlinkSync(`/proc/${pid}/fd/${fd}`);
        if (want.has(t)) open.add(t);
      } catch {
        /* затворен междувременно */
      }
    }
  }
  return open;
}

export async function bigFiles(root, { minMb = 100, days = 30, limit = 200 } = {}, cfg = null) {
  const base = resolvePath(root || '/');
  if (HARD_DENY.some((r) => under(base, r))) throw err('Системен път — не се претърсва.', 403);
  const mb = Number(minMb);
  const d = Number(days);
  if (!Number.isInteger(mb) || mb < 1 || mb > 1024 * 1024) throw err('Размерът е цяло число MB (1 и нагоре).');
  if (!Number.isInteger(d) || d < 0 || d > 3650) throw err('Дните са цяло число от 0 до 3650.');
  // Системните пътища и кошчето се режат (-prune), не се филтрират след това —
  // иначе find пак обхожда /usr и /var/lib/docker и отнема минути.
  const prune = [...HARD_DENY, trashDir(cfg)].flatMap((p, i) => (i ? ['-o', '-path', p] : ['-path', p]));
  const args = [base, '-xdev', '(', ...prune, ')', '-prune', '-o', '-type', 'f', '-size', `+${mb}M`];
  if (d > 0) args.push('-mtime', `+${d}`);
  args.push('-printf', '%s\t%T@\t%p\n');
  const r = await run('find', args, { timeout: 60000, maxBuffer: 16 * 1024 * 1024 });
  const rows = r.stdout
    .split('\n')
    .map((l) => /^(\d+)\t([\d.]+)\t(.+)$/.exec(l))
    .filter(Boolean)
    .map((m) => ({ path: m[3], sizeBytes: Number(m[1]), mtime: new Date(Number(m[2]) * 1000).toISOString() }))
    .sort((a, b) => b.sizeBytes - a.sizeBytes);
  const hits = rows.slice(0, limit);
  const open = openPaths(hits.map((h) => h.path));
  for (const h of hits) {
    h.open = open ? open.has(h.path) : null;
    try {
      assertMutable(h.path, cfg);
    } catch (e) {
      h.protected = e.message;
    }
  }
  return {
    root: base,
    minMb: mb,
    days: d,
    hits,
    totalBytes: rows.reduce((s, h) => s + h.sizeBytes, 0),
    count: rows.length,
    truncated: rows.length > limit,
    partial: !r.ok,
  };
}

// ── Архиви ──────────────────────────────────────────────────────────────────
export function archiveSpec(paths, cfg) {
  const list = (Array.isArray(paths) ? paths : [paths]).map(resolvePath);
  if (!list.length || list.length > 200) throw err('Избери между 1 и 200 неща.');
  const parent = path.dirname(list[0]);
  if (!list.every((p) => path.dirname(p) === parent)) throw err('Всички трябва да са в една папка.');
  for (const p of list) if (HARD_DENY.some((r) => under(p, r))) throw err('Системен път — не се архивира оттук.', 403);
  // Самите тайни — отказ; по-горна папка (/etc) — архивира се БЕЗ тях, като при сваляне.
  for (const p of list) {
    if (isSecretFile(p) || panelSecretDirs().some((d) => under(p, d))) throw err('Тук са тайните на панела — не се архивира оттук.', 403);
  }
  const excludes = panelSecretDirs()
    .filter((d) => list.some((p) => under(d, p) && d !== p))
    .map((d) => `--exclude=${path.relative(parent, d)}`);
  excludes.push('--exclude=desktop.env');
  const stem = list.length === 1 ? path.basename(list[0]) : `архив-${new Date().toISOString().slice(0, 10)}`;
  let dest = path.join(parent, `${stem}.tar.gz`);
  for (let i = 2; fs.existsSync(dest); i++) dest = path.join(parent, `${stem}-${i}.tar.gz`);
  assertCreatable(dest, cfg);
  return { title: `Архив → ${dest}`, cmd: 'tar', args: ['-czf', dest, ...excludes, '-C', parent, '--', ...list.map((p) => path.basename(p))], timeoutMs: 6 * 3600 * 1000, dest };
}

const ARCHIVE_RX = /\.(tar\.gz|tgz|tar\.xz|txz|tar\.bz2|tar|zip)$/i;
// Като root GNU tar пази режима ОТ АРХИВА: член с uid 0 и 4755 излиза setuid-root
// (`--no-same-owner` не помага — собственикът и без това е root), а блоково
// устройство излиза `666` — суров достъп до диска за всеки локален потребител
// (Кодаджията 28.11, проверено с tar 1.35). `--no-same-permissions` маха setuid;
// устройствата и FIFO се отказват ПРЕДИ първия байт по списъка (`tar -tv`: първият
// знак е типът). unzip маха setuid сам, устройства в zip няма.
export const TAR_SAFE_SH = [
  'if tar -tvf "$1" | grep -q "^[bcp]"; then',
  '  echo "✘ Архивът съдържа файлове на устройства или FIFO — не се разархивира оттук." >&2',
  '  exit 3',
  'fi',
  'exec tar -xf "$1" -C "$2" --no-same-owner --no-same-permissions',
].join('\n');

export function extractSpec(archive, cfg) {
  const src = resolvePath(archive);
  if (!ARCHIVE_RX.test(src)) throw err('Поддържани: .tar.gz .tgz .tar.xz .tar.bz2 .tar .zip');
  if (!fs.existsSync(src)) throw err('Няма такъв архив', 404);
  // ВИНАГИ в НОВА папка до архива — разархивиране върху съществуващо дърво
  // презаписва файлове тихо, а точно това човек не е видял, преди да натисне.
  const stem = path.basename(src).replace(ARCHIVE_RX, '');
  let dest = path.join(path.dirname(src), stem);
  for (let i = 2; fs.existsSync(dest); i++) dest = path.join(path.dirname(src), `${stem}-${i}`);
  assertCreatable(dest, cfg);
  const isZip = /\.zip$/i.test(src);
  // tar маха водещо „/" и „../" от имената сам; --no-same-owner — файловете са на
  // root, не на чужд uid от архива. Пътищата влизат като аргументи ($1 $2), не в скрипта.
  if (isZip) return { title: `Разархивиране → ${dest}`, cmd: 'unzip', args: ['-q', src, '-d', dest], timeoutMs: 6 * 3600 * 1000, dest, mkdirFirst: false };
  return { title: `Разархивиране → ${dest}`, cmd: 'bash', args: ['-c', TAR_SAFE_SH, 'extract', src, dest], timeoutMs: 6 * 3600 * 1000, dest, mkdirFirst: true };
}

// ── Сваляне ─────────────────────────────────────────────────────────────────
// Файл — поток; папка — tar.gz на движение (без временен файл на диска).
// ЕДИН план за сваляне — и за проверката (`check=1`), и за самия поток. Две
// отделни проверки се разминаха: `check` пускаше config.json, потокът го спираше,
// и браузърът записваше JSON грешката като „config.json". По-лошото: папката
// /etc/vps-dashboard минаваше цяла като .tar.gz — с всички тайни вътре.
const NO_DOWNLOAD = ['/proc', '/sys', '/dev', '/run'];
export function downloadPlan(p, { isSensitive = isSecretFile, secretDirs = panelSecretDirs() } = {}) {
  const full = resolvePath(p);
  const secrets = secretDirs.map((d) => path.resolve(d));
  // И през символна връзка: файлът се чете със `createReadStream`, който я
  // следва — връзка към config.json иначе изнася тайните под чуждо име.
  for (const f of realForms(full, true)) {
    if (f === '/' || NO_DOWNLOAD.some((r) => under(f, r))) throw err('Системен път — не се сваля оттук.', 403);
    if (isSensitive?.(f)) throw err('Този файл съдържа тайните на панела — не се сваля оттук.', 403);
    if (secrets.some((d) => under(f, d))) throw err('Тук са тайните на панела — не се сваля оттук.', 403);
  }
  const st = fs.statSync(full);
  if (st.isDirectory()) {
    // По-горна папка (/etc) — без тайните. tar сравнява с имената В архива, а те
    // са спрямо родителя (`-C`), затова изключването е относително.
    const excludes = secrets.filter((d) => under(d, full)).map((d) => path.relative(path.dirname(full), d));
    excludes.push('desktop.env');
    return { path: full, dir: true, name: path.basename(full), excludes };
  }
  if (!st.isFile()) throw err('Не е файл');
  return { path: full, dir: false, name: path.basename(full), sizeBytes: st.size };
}

export function streamDownload(plan, res) {
  const disp = (n) => `attachment; filename="${n.replace(/[^\w.-]/g, '_')}"; filename*=UTF-8''${encodeURIComponent(n)}`;
  if (plan.dir) {
    res.writeHead(200, { 'content-type': 'application/gzip', 'content-disposition': disp(`${plan.name}.tar.gz`), 'cache-control': 'no-store' });
    // --one-file-system: без /proc на контейнери, tmpfs и чужди дискове отдолу.
    const args = ['-czf', '-', '--one-file-system', ...plan.excludes.map((x) => `--exclude=${x}`), '-C', path.dirname(plan.path), '--', plan.name];
    const child = spawn('tar', args, { stdio: ['ignore', 'pipe', 'ignore'] });
    // Без слушател за 'error' липсващ tar ставаше uncaughtException → server.js
    // вика process.exit(1) и рестартът убива текущите задачи (apt по средата на
    // dpkg). Провал по средата РЯЗВА връзката: отрязан .tar.gz със статус 200
    // браузърът записва като успешно свален. Код 1 = „файлът се промени, докато
    // го четях" — безвреден.
    // `end: false` — краят на тялото го решава изходният код, не краят на потока:
    // иначе pipe() затваря отговора чисто, преди да знаем, че tar е паднал.
    child.on('error', () => res.destroy());
    child.on('close', (code) => {
      if (code === 0 || code === 1) res.end();
      else res.destroy();
    });
    child.stdout.pipe(res, { end: false });
    res.on('close', () => child.kill('SIGTERM'));
    return plan;
  }
  res.writeHead(200, { 'content-type': 'application/octet-stream', 'content-length': plan.sizeBytes, 'content-disposition': disp(plan.name), 'cache-control': 'no-store' });
  // Изтрит между stat и отварянето (ротация на лог), EIO от болен диск — само тази връзка пада.
  const rs = fs.createReadStream(plan.path);
  rs.on('error', () => res.destroy());
  rs.pipe(res);
  return plan;
}
