// „Машина" — нещата, за които досега трябваше SSH: SSH ключовете на root,
// пакетите по име, swap и часовникът.
//
// Всяко от тях е контрол над ДОСТЪПА или над ЦЕЛОСТТА на машината, затова
// правилата са твърди и стоят тук, не в интерфейса:
//  · Ключ = root достъп. Добавя се само ЧИСТ ключ (без `command=`, `from=` и пр. —
//    опциите са място за скрит ефект), с проверено съдържание и сила (RSA ≥ 2048).
//    Последният ключ не се маха, когато входът с парола е изключен — иначе
//    бутонът заключва собственика навън. „Не знам" (sshd -T не отговори) затяга.
//  · Пакет се маха по ПЛАН: първо симулация (`apt-get -s`), човекът вижда кои
//    още пакети тръгват с него, и заявката носи същия списък. Ако между прегледа
//    и натискането планът се е сменил — отказ (същият капан като номерата на ufw).
//    Пакетите, без които машината или самият панел не живеят, не се махат оттук.
//  · Swap е файл `/swapfile` (не дял): създаване с проверка за място, запис в
//    fstab с копие преди това, махане само ако паметта поема изпразването.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { run } from './exec.js';

const err = (msg, status = 400) => Object.assign(new Error(msg), { status });

// ── SSH ключове на root ─────────────────────────────────────────────────────
export const AUTH_KEYS = '/root/.ssh/authorized_keys';
const KEY_TYPES = new Set([
  'ssh-ed25519', 'ssh-rsa', 'ecdsa-sha2-nistp256', 'ecdsa-sha2-nistp384', 'ecdsa-sha2-nistp521',
  'sk-ssh-ed25519@openssh.com', 'sk-ecdsa-sha2-nistp256@openssh.com',
]);

function readSshString(buf, off) {
  if (off + 4 > buf.length) return null;
  const len = buf.readUInt32BE(off);
  if (off + 4 + len > buf.length) return null;
  return { value: buf.subarray(off + 4, off + 4 + len), next: off + 4 + len };
}

// Силата на RSA ключа — от модула n (третият низ в блоба: тип, e, n).
function rsaBits(blob) {
  const t = readSshString(blob, 0);
  const e = t && readSshString(blob, t.next);
  const n = e && readSshString(blob, e.next);
  if (!n) return null;
  let bytes = n.value;
  while (bytes.length && bytes[0] === 0) bytes = bytes.subarray(1);
  return bytes.length * 8;
}

export function fingerprintOf(blob) {
  return 'SHA256:' + crypto.createHash('sha256').update(blob).digest('base64').replace(/=+$/, '');
}

// Един ред от authorized_keys: [опции] тип base64 [коментар].
export function parseKeyLine(line) {
  const s = String(line ?? '').trim();
  if (!s || s.startsWith('#')) return null;
  const toks = s.split(/\s+/);
  const i = toks.findIndex((x) => KEY_TYPES.has(x));
  if (i < 0) return { invalid: true, raw: s.slice(0, 60) };
  const type = toks[i];
  const b64 = toks[i + 1] || '';
  if (!/^[A-Za-z0-9+/]+={0,3}$/.test(b64)) return { invalid: true, raw: s.slice(0, 60) };
  const blob = Buffer.from(b64, 'base64');
  const inner = readSshString(blob, 0);
  // Типът ВЪТРЕ в блоба трябва да съвпада с написания — иначе редът лъже какъв е.
  if (!inner || inner.value.toString() !== type) return { invalid: true, raw: s.slice(0, 60) };
  const out = {
    type,
    fingerprint: fingerprintOf(blob),
    comment: toks.slice(i + 2).join(' ').slice(0, 200),
    options: i > 0 ? toks.slice(0, i).join(' ') : '',
  };
  if (type === 'ssh-rsa') out.bits = rsaBits(blob);
  if (out.bits != null && out.bits < 2048) out.weak = true;
  return out;
}

// Кой ключ кога е влизал — от журнала на sshd („Accepted publickey … SHA256:…").
export function lastUsedFromJournal(text) {
  const map = new Map();
  for (const line of String(text || '').split('\n')) {
    const m = /^(\S+)\s.*Accepted publickey for (\S+) from (\S+).*?(SHA256:[A-Za-z0-9+/]+)/.exec(line);
    if (m) map.set(m[4], { at: m[1], user: m[2] });
  }
  return map;
}

export async function sshdState() {
  const r = await run('sshd', ['-T'], { timeout: 8000 });
  if (!r.ok) return { known: false };
  const kv = Object.fromEntries(
    r.stdout.split('\n').map((l) => l.trim().split(/\s+/)).filter((p) => p.length >= 2).map(([k, ...v]) => [k.toLowerCase(), v.join(' ')])
  );
  return { known: true, passwordAuth: kv.passwordauthentication === 'yes', permitRootLogin: kv.permitrootlogin || null };
}

export async function listKeys({ file = AUTH_KEYS, journal = true } = {}) {
  let text = '';
  let exists = true;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch (e) {
    if (e.code !== 'ENOENT') throw e;
    exists = false;
  }
  const keys = text.split('\n').map(parseKeyLine).filter(Boolean);
  let used = new Map();
  // null = журналът не отговори (не знаем); true = прочетен — тогава липсата на
  // запис значи „не е ползван 90 дни", не „не знам".
  let journalRead = null;
  if (journal) {
    const j = await run('journalctl', ['--since', '-90d', '-o', 'short-iso', '--no-pager', '-q', '-g', 'Accepted publickey'], { timeout: 8000 });
    // journalctl -g без съвпадение излиза с 1 и празен изход — това е прочетено.
    if (j.ok || (j.code === 1 && !j.stderr.trim())) {
      journalRead = true;
      used = lastUsedFromJournal(j.stdout);
    }
  }
  for (const k of keys) if (k.fingerprint) k.lastUsed = used.get(k.fingerprint) || null;
  return { file, exists, keys, journal: journalRead };
}

// Атомарен запис с копие: копието е в state на панела (не в /root/.ssh — там
// ВСЕКИ файл е потенциален вход), последните 10.
function writeKeys(file, lines, backupDir) {
  const dir = path.dirname(file);
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  fs.chmodSync(dir, 0o700);
  if (fs.existsSync(file) && backupDir) {
    fs.mkdirSync(backupDir, { recursive: true, mode: 0o700 });
    fs.copyFileSync(file, path.join(backupDir, `authorized_keys.${new Date().toISOString().replace(/[:.]/g, '-')}`));
    const old = fs.readdirSync(backupDir).filter((f) => f.startsWith('authorized_keys.')).sort();
    for (const f of old.slice(0, Math.max(0, old.length - 10))) fs.rmSync(path.join(backupDir, f), { force: true });
  }
  const tmp = `${file}.csd-${process.pid}`;
  fs.writeFileSync(tmp, lines.join('\n').replace(/\n*$/, '\n'), { mode: 0o600 });
  fs.renameSync(tmp, file);
}

export function keyBackupDir(cfg) {
  return path.join(cfg?.paths?.stateDir || '/var/lib/vps-dashboard', 'ssh-keys');
}

export async function addKey(line, cfg, audit, user, { file = AUTH_KEYS } = {}) {
  const s = String(line ?? '').trim();
  if (!s || s.includes('\n') || s.includes('\r') || s.length > 16384) throw err('Един ключ на един ред (както е в .pub файла).');
  if (/[\x00-\x1f\x7f]/.test(s)) throw err('Ключът съдържа управляващи знаци.');
  const k = parseKeyLine(s);
  if (!k || k.invalid) throw err('Това не е валиден публичен SSH ключ (ssh-ed25519 / ssh-rsa / ecdsa…).');
  if (k.options) throw err('Ключ с опции (command=, from=…) се добавя от терминала — оттук само чист ключ.');
  if (k.weak) throw err(`RSA ключ от ${k.bits} бита е слаб — нужни са поне 2048 (по-добре ed25519).`);
  let text = '';
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch (e) {
    if (e.code !== 'ENOENT') throw e;
  }
  const lines = text.split('\n').filter((l) => l.trim());
  if (lines.some((l) => parseKeyLine(l)?.fingerprint === k.fingerprint)) throw err('Този ключ вече е добавен.', 409);
  writeKeys(file, [...lines, s], keyBackupDir(cfg));
  // В одита — отпечатъкът и типът; коментарът често е имейл (лични данни).
  audit.log({ action: 'ssh.keyAdd', fingerprint: k.fingerprint, type: k.type, user });
  return { fingerprint: k.fingerprint, type: k.type };
}

export async function removeKey(fingerprint, cfg, audit, user, { file = AUTH_KEYS, sshd = sshdState } = {}) {
  const fp = String(fingerprint ?? '');
  if (!/^SHA256:[A-Za-z0-9+/]{43}$/.test(fp)) throw err('Невалиден отпечатък.');
  const lines = fs.readFileSync(file, 'utf8').split('\n').filter((l) => l.trim());
  const keep = lines.filter((l) => parseKeyLine(l)?.fingerprint !== fp);
  if (keep.length === lines.length) throw err('Няма такъв ключ.', 404);
  const validLeft = keep.map(parseKeyLine).filter((k) => k && !k.invalid).length;
  if (!validLeft) {
    const st = await sshd();
    // „Не знам" затяга: без отговор от sshd не приемаме, че паролата ще спаси.
    if (!st.known) throw err('Това е последният ключ, а не мога да проверя дали входът с парола е включен (sshd -T не отговори). Добави друг ключ първо.', 409);
    if (!st.passwordAuth) throw err('Това е последният ключ, а входът с парола е изключен — ще заключиш машината. Добави друг ключ първо.', 409);
  }
  writeKeys(file, keep, keyBackupDir(cfg));
  audit.log({ action: 'ssh.keyRemove', fingerprint: fp, left: validLeft, user });
  return { removed: fp, left: validLeft };
}

// ── Пакети ──────────────────────────────────────────────────────────────────
export const PKG_RX = /^[a-z0-9][a-z0-9+.-]{1,62}$/;
// Без тях машината не се вдига, не пуска никого или панелът умира. Махат се (ако
// изобщо) по SSH, съзнателно — не с бутон.
const PROTECTED_PKGS = new Set([
  'openssh-server', 'openssh-sftp-server', 'sudo', 'systemd', 'systemd-sysv', 'init', 'dpkg', 'apt', 'libc6', 'bash',
  'coreutils', 'util-linux', 'login', 'passwd', 'procps', 'iproute2', 'netbase', 'ca-certificates', 'nodejs',
  'linux-image-generic', 'linux-generic', 'grub-pc', 'grub-efi-amd64', 'grub-efi-amd64-signed', 'shim-signed', 'base-files',
]);
const APT_ENV = { DEBIAN_FRONTEND: 'noninteractive', NEEDRESTART_MODE: 'a' };

function assertPkg(name) {
  const s = String(name ?? '').trim();
  if (!PKG_RX.test(s)) throw err('Невалидно име на пакет (малки букви, цифри, + . -).');
  return s;
}

export function parseDpkgList(text) {
  return String(text || '')
    .split('\n')
    .filter(Boolean)
    .map((l) => {
      const [name, version, status, size, priority, essential] = l.split('\t');
      return { name, version, installed: /^ii/.test(status || ''), status: (status || '').trim(), sizeKb: Number(size) || null, priority, essential: essential === 'yes' };
    })
    .filter((p) => p.name);
}

export async function listPackages(q = '', { limit = 300 } = {}) {
  const term = String(q || '').trim().toLowerCase();
  if (term.length > 60) throw err('Търсенето е до 60 знака.');
  const r = await run('dpkg-query', ['-W', '-f', '${Package}\t${Version}\t${db:Status-Abbrev}\t${Installed-Size}\t${Priority}\t${Essential}\n'], { timeout: 20000, maxBuffer: 32 * 1024 * 1024 });
  if (!r.ok && !r.stdout) return { available: false, reason: (r.stderr || 'dpkg-query не отговори').slice(0, 160), packages: [] };
  const all = parseDpkgList(r.stdout).filter((p) => p.installed);
  const manual = await run('apt-mark', ['showmanual'], { timeout: 15000, maxBuffer: 8 * 1024 * 1024 });
  const manualSet = manual.ok ? new Set(manual.stdout.split('\n').map((s) => s.trim()).filter(Boolean)) : null;
  const hits = all.filter((p) => !term || p.name.includes(term));
  for (const p of hits) {
    p.manual = manualSet ? manualSet.has(p.name) : null;
    p.protected = PROTECTED_PKGS.has(p.name) || p.essential || p.priority === 'required';
  }
  return { available: true, total: all.length, count: hits.length, packages: hits.slice(0, limit), truncated: hits.length > limit };
}

export async function searchAvailable(q) {
  const term = String(q || '').trim();
  if (!/^[a-z0-9][a-z0-9+.-]{1,40}$/.test(term)) throw err('Търсенето е по име на пакет: 2–40 знака (малки букви, цифри, + . -).');
  const r = await run('apt-cache', ['search', '--names-only', '--', term], { timeout: 20000, maxBuffer: 8 * 1024 * 1024 });
  if (!r.ok) return { available: false, reason: (r.stderr || 'apt-cache не отговори').slice(0, 160), results: [] };
  const results = r.stdout
    .split('\n')
    .map((l) => /^(\S+) - (.*)$/.exec(l))
    .filter(Boolean)
    .map((m) => ({ name: m[1], description: m[2].slice(0, 160) }))
    .slice(0, 60);
  return { available: true, results };
}

export function installSpec(name) {
  const pkg = assertPkg(name);
  return {
    title: `apt install ${pkg}`,
    cmd: 'apt-get',
    args: ['install', '-y', '--no-install-recommends', '--', pkg],
    env: APT_ENV,
    exclusive: 'system',
    timeoutMs: 30 * 60 * 1000,
  };
}

export function parseRemovePlan(text) {
  return [...String(text || '').matchAll(/^Remv (\S+)/gm)].map((m) => m[1]).sort();
}

export async function removePlan(name) {
  const pkg = assertPkg(name);
  if (PROTECTED_PKGS.has(pkg)) throw err(`„${pkg}" е част от основата на машината (или на самия панел) — не се маха оттук.`, 403);
  const info = await run('dpkg-query', ['-W', '-f', '${db:Status-Abbrev}\t${Priority}\t${Essential}', '--', pkg], { timeout: 10000 });
  // Липсващ dpkg не е „пакетът не е инсталиран" — не знаем нищо.
  if (info.code === 'ENOENT') throw Object.assign(err('dpkg-query липсва на тази машина — пакетите не могат да се управляват оттук.', 503), { safe: true });
  if (!info.ok || !/^ii/.test(info.stdout)) throw err('Пакетът не е инсталиран.', 404);
  const [, priority, essential] = info.stdout.split('\t');
  if (essential?.trim() === 'yes' || priority === 'required') throw err(`„${pkg}" е основен пакет (Essential/required) — не се маха оттук.`, 403);
  const sim = await run('apt-get', ['-s', 'remove', '--', pkg], { timeout: 30000, env: APT_ENV });
  if (!sim.ok) throw err(`apt не може да направи план: ${(sim.stderr || sim.stdout).slice(0, 200)}`, 409);
  const removes = parseRemovePlan(sim.stdout);
  const hit = removes.filter((p) => PROTECTED_PKGS.has(p.replace(/:\w+$/, '')));
  if (hit.length) throw err(`С „${pkg}" тръгват и основни пакети: ${hit.join(', ')} — не се маха оттук.`, 403);
  return { name: pkg, removes };
}

// Изпълнението СВЕРЯВА плана с видения: друг списък = отказ, не „почти същото".
export async function removeSpec(name, expect) {
  const plan = await removePlan(name);
  const seen = (Array.isArray(expect) ? expect.map(String) : []).sort();
  if (plan.removes.join(' ') !== seen.join(' ')) {
    throw err('Планът за махане се промени, откакто го видя — прегледай го пак.', 409);
  }
  return {
    title: `apt remove ${plan.name}`,
    cmd: 'apt-get',
    args: ['remove', '-y', '--', plan.name],
    env: APT_ENV,
    exclusive: 'system',
    timeoutMs: 20 * 60 * 1000,
  };
}

// ── Swap ────────────────────────────────────────────────────────────────────
export const SWAPFILE = '/swapfile';

export function parseSwaps(text) {
  return String(text || '')
    .split('\n')
    .slice(1)
    .map((l) => l.trim().split(/\s+/))
    .filter((c) => c.length >= 5)
    .map(([file, type, size, used, prio]) => ({ file, type, sizeKb: Number(size), usedKb: Number(used), priority: Number(prio) }));
}

function meminfo() {
  const out = {};
  try {
    for (const l of fs.readFileSync('/proc/meminfo', 'utf8').split('\n')) {
      const m = /^(\w+):\s+(\d+)/.exec(l);
      if (m) out[m[1]] = Number(m[2]);
    }
  } catch {
    /* без /proc — празно */
  }
  return out;
}

export function swapInfo() {
  let swaps = [];
  let known = true;
  try {
    swaps = parseSwaps(fs.readFileSync('/proc/swaps', 'utf8'));
  } catch {
    known = false;
  }
  let swappiness = null;
  try {
    swappiness = Number(fs.readFileSync('/proc/sys/vm/swappiness', 'utf8').trim());
  } catch {
    /* няма */
  }
  const mem = meminfo();
  let diskFree = null;
  try {
    const s = fs.statfsSync('/');
    diskFree = s.bavail * s.bsize;
  } catch {
    /* няма */
  }
  return {
    known,
    swaps,
    totalKb: mem.SwapTotal ?? null,
    freeKb: mem.SwapFree ?? null,
    memTotalKb: mem.MemTotal ?? null,
    memAvailableKb: mem.MemAvailable ?? null,
    swappiness,
    swapfileExists: fs.existsSync(SWAPFILE),
    diskFreeBytes: diskFree,
  };
}

export function createSwapSpec(sizeMb, info = swapInfo()) {
  const mb = Number(sizeMb);
  if (!Number.isInteger(mb) || mb < 256 || mb > 32768) throw err('Размерът е цяло число MB от 256 до 32768.');
  if (info.swapfileExists) throw err(`${SWAPFILE} вече съществува — махни го първо или го ползвай както е.`, 409);
  if (info.diskFreeBytes != null && info.diskFreeBytes < mb * 1024 * 1024 + 2 * 1024 ** 3) {
    throw err('Няма място: след swap файла на диска трябва да останат поне 2 GB.', 409);
  }
  // fallocate е мигновен, но на някои файлови системи оставя „дупки" и swapon
  // отказва — тогава наново с dd. Провал по пътя чисти след себе си (trap).
  const shell = [
    'set -e',
    `cleanup() { swapoff ${SWAPFILE} 2>/dev/null || true; rm -f ${SWAPFILE}; }`,
    'trap \'echo "✘ Прекъснато — чистя"; cleanup\' ERR',
    `fallocate -l ${mb}M ${SWAPFILE} || dd if=/dev/zero of=${SWAPFILE} bs=1M count=${mb} status=none`,
    `chmod 600 ${SWAPFILE}`,
    `mkswap ${SWAPFILE} >/dev/null`,
    `if ! swapon ${SWAPFILE} 2>/dev/null; then echo "fallocate не става за swap тук — пиша с dd"; rm -f ${SWAPFILE}; dd if=/dev/zero of=${SWAPFILE} bs=1M count=${mb} status=none; chmod 600 ${SWAPFILE}; mkswap ${SWAPFILE} >/dev/null; swapon ${SWAPFILE}; fi`,
    'trap - ERR',
    'cp -a /etc/fstab "/etc/fstab.преди-swap-$(date +%Y%m%d-%H%M%S)"',
    `grep -qE '^[[:space:]]*${SWAPFILE}[[:space:]]' /etc/fstab || echo '${SWAPFILE} none swap sw 0 0' >> /etc/fstab`,
    'swapon --show',
    'echo "✔ Готово — swap е включен и ще оцелее след рестарт"',
  ].join('\n');
  return { title: `Създавам swap ${mb} MB`, shell, exclusive: 'system', timeoutMs: 20 * 60 * 1000 };
}

export function removeSwapSpec(info = swapInfo()) {
  const active = info.swaps.find((s) => s.file === SWAPFILE);
  if (!active && !info.swapfileExists) throw err(`Няма ${SWAPFILE}.`, 404);
  // swapoff връща всичко от swap в RAM — без място там ядрото почва да убива процеси.
  if (active && info.memAvailableKb != null && info.memAvailableKb < active.usedKb + 256 * 1024) {
    throw err('Няма достатъчно свободна памет, за да се изпразни swap — махането би пуснало OOM убиеца.', 409);
  }
  const shell = [
    'set -e',
    `swapoff ${SWAPFILE} 2>/dev/null || true`,
    'cp -a /etc/fstab "/etc/fstab.преди-swap-$(date +%Y%m%d-%H%M%S)"',
    `sed -i '\\#^[[:space:]]*${SWAPFILE}[[:space:]]#d' /etc/fstab`,
    `rm -f ${SWAPFILE}`,
    'echo "✔ Swap файлът е махнат"',
  ].join('\n');
  return { title: 'Махам swap файла', shell, exclusive: 'system', timeoutMs: 20 * 60 * 1000 };
}

export async function setSwappiness(n, audit, user) {
  const v = Number(n);
  if (!Number.isInteger(v) || v < 0 || v > 100) throw err('swappiness е цяло число от 0 до 100.');
  const r = await run('sysctl', ['-w', `vm.swappiness=${v}`], { timeout: 8000 });
  if (!r.ok) throw err(`sysctl не мина: ${(r.stderr || '').slice(0, 160)}`, 500);
  // Да оцелее след рестарт — собствен файл, не редакция на чужд.
  fs.writeFileSync('/etc/sysctl.d/99-vps-dashboard-swap.conf', `# Управлява се от VPS Dashboard („Машина" → Swap)\nvm.swappiness = ${v}\n`, { mode: 0o644 });
  audit.log({ action: 'machine.swappiness', value: v, user });
  return { swappiness: v };
}

// ── Часовник ────────────────────────────────────────────────────────────────
export async function timeInfo() {
  const r = await run('timedatectl', ['show'], { timeout: 8000 });
  if (!r.ok) return { known: false };
  const kv = Object.fromEntries(r.stdout.split('\n').map((l) => l.split('=')).filter((p) => p.length >= 2).map(([k, ...v]) => [k, v.join('=')]));
  return { known: true, timezone: kv.Timezone || null, ntp: kv.NTP === 'yes', synchronized: kv.NTPSynchronized === 'yes', localRtc: kv.LocalRTC === 'yes', now: new Date().toISOString() };
}

export async function listTimezones() {
  const r = await run('timedatectl', ['list-timezones'], { timeout: 8000, maxBuffer: 2 * 1024 * 1024 });
  // null = не знаем (timedatectl липсва) — не празен списък, който изглежда като „няма зони".
  return r.ok ? r.stdout.split('\n').map((s) => s.trim()).filter(Boolean) : null;
}

const TZ_RX = /^[A-Za-z_]+(?:\/[A-Za-z0-9_+-]+){0,2}$/;
export async function setTime({ ntp, timezone } = {}, audit, user) {
  const done = {};
  if (timezone != null) {
    const tz = String(timezone);
    const zones = await listTimezones();
    if (!zones) throw err('timedatectl не отговори — не мога да проверя зоната.', 503);
    if (!TZ_RX.test(tz) || !zones.includes(tz)) throw err('Непозната часова зона.');
    const r = await run('timedatectl', ['set-timezone', tz], { timeout: 10000 });
    if (!r.ok) throw err(`timedatectl не мина: ${(r.stderr || '').slice(0, 160)}`, 500);
    done.timezone = tz;
  }
  if (ntp != null) {
    if (typeof ntp !== 'boolean') throw err('ntp е true или false.');
    const r = await run('timedatectl', ['set-ntp', ntp ? 'true' : 'false'], { timeout: 10000 });
    if (!r.ok) throw err(`timedatectl не мина: ${(r.stderr || '').slice(0, 160)}`, 500);
    done.ntp = ntp;
  }
  if (!Object.keys(done).length) throw err('Нищо за промяна (очаквам timezone и/или ntp).');
  audit.log({ action: 'machine.time', ...done, user });
  return done;
}

export async function daemonReload(audit, user) {
  const r = await run('systemctl', ['daemon-reload'], { timeout: 30000 });
  if (!r.ok) throw err(`daemon-reload не мина: ${(r.stderr || '').slice(0, 160)}`, 500);
  audit.log({ action: 'machine.daemonReload', user });
  return { ok: true };
}
