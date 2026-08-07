// Оценка на сигурността — какво е нагласено ЗЛЕ на тази машина, подредено по
// това колко реално боли.
//
// Мисълта е като на Lynis, но нарочно тясна: вместо 200 проверки, които никой не
// изчита, тук стоят малкото, които при VPS с публичен IP наистина решават дали
// някой влиза. Всяка проверка носи КОНКРЕТНА команда за поправка — оценка без
// „ето как се оправя" е само чувство за вина.
//
// Оценката е ориентир, не сертификат: 100/100 не значи неуязвим сървър.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { run } from './exec.js';
import { plural } from './text.js';

const WEIGHTS = { critical: 25, high: 12, medium: 6, low: 2 };

function grab(text, key) {
  return text.match(new RegExp(`^${key} (.+)$`, 'm'))?.[1] || null;
}

export async function posture() {
  const findings = [];
  const add = (f) => findings.push(f);

  const [sshd, ufw, unattended, listen, f2b, sudoers, passwd] = await Promise.all([
    run('sshd', ['-T'], { timeout: 10000 }),
    run('ufw', ['status'], { timeout: 8000 }),
    run('systemctl', ['is-enabled', 'unattended-upgrades'], { timeout: 8000 }),
    run('ss', ['-tlnpH'], { timeout: 8000 }),
    run('fail2ban-client', ['status'], { timeout: 8000 }),
    run('grep', ['-rh', 'NOPASSWD', '/etc/sudoers', '/etc/sudoers.d/'], { timeout: 8000 }),
    run('awk', ['-F:', '($2 == "" ) { print $1 }', '/etc/shadow'], { timeout: 8000 }),
  ]);

  // ── SSH: входната врата ────────────────────────────────────────────────────
  if (sshd.ok) {
    const rootLogin = grab(sshd.stdout, 'permitrootlogin');
    const passAuth = grab(sshd.stdout, 'passwordauthentication');
    const port = grab(sshd.stdout, 'port');
    if (passAuth === 'yes') {
      add({
        id: 'ssh-password',
        severity: 'critical',
        title: 'SSH приема пароли',
        why: 'Ботовете налучкват пароли денонощно. С ключове това просто не е възможно.',
        fix: 'Сложи си ключ (ssh-copy-id), после в /etc/ssh/sshd_config: PasswordAuthentication no; systemctl restart ssh',
        // Изричното предупреждение е важно: изключено преди работещ ключ = заключен навън.
        note: 'Първо провери, че влизаш с ключ в ВТОРА сесия — иначе се заключваш отвън.',
      });
    }
    if (rootLogin === 'yes') {
      add({
        id: 'ssh-root',
        severity: 'high',
        title: 'SSH пуска root директно',
        why: 'Всеки бот знае името „root" — остава му само паролата/ключа. Отделен потребител + sudo оставя и следа кой какво е направил.',
        fix: '/etc/ssh/sshd_config: PermitRootLogin prohibit-password (или no)',
      });
    } else if (rootLogin === 'prohibit-password') {
      add({ id: 'ssh-root-key', severity: 'low', ok: true, title: 'root влиза само с ключ', why: 'Разумна настройка.', fix: '' });
    }
    if (port === '22') {
      add({
        id: 'ssh-port',
        severity: 'low',
        title: 'SSH е на порт 22',
        why: 'Не е дупка — само шум. Друг порт маха 99% от автоматичните опити от журнала.',
        fix: '/etc/ssh/sshd_config: Port <друг>; отвори го в ufw ПРЕДИ рестарта.',
      });
    }
  } else {
    add({ id: 'ssh-unknown', severity: 'medium', title: 'SSH конфигът не можа да се прочете', why: '`sshd -T` не върна нищо — не знаем как е нагласена входната врата.', fix: 'Пусни `sshd -T` на сървъра и виж грешката.' });
  }

  // ── Firewall ───────────────────────────────────────────────────────────────
  if (!ufw.ok) {
    add({ id: 'ufw-missing', severity: 'high', title: 'Няма ufw', why: 'Без защитна стена всяка услуга, която случайно се върже на 0.0.0.0, е публична.', fix: 'apt install ufw && ufw allow OpenSSH && ufw enable' });
  } else if (/Status:\s*inactive/i.test(ufw.stdout)) {
    add({ id: 'ufw-inactive', severity: 'high', title: 'Защитната стена е изключена', why: 'Същото — всеки отворен порт е достъпен отвън.', fix: 'ufw allow OpenSSH && ufw enable  (първо SSH, после enable!)' });
  } else {
    add({ id: 'ufw-ok', severity: 'low', ok: true, title: 'Защитната стена работи', why: '', fix: '' });
  }

  // ── Автоматични кръпки за сигурност ────────────────────────────────────────
  if (!unattended.ok || !/enabled/.test(unattended.stdout)) {
    add({
      id: 'unattended',
      severity: 'high',
      title: 'Няма автоматични ъпдейти за сигурност',
      why: 'Повечето пробиви минават през дупка, за която кръпка е излязла преди месеци. Ръчното „ще го направя утре" е измама.',
      fix: 'apt install unattended-upgrades && dpkg-reconfigure -plow unattended-upgrades',
    });
  } else {
    add({ id: 'unattended-ok', severity: 'low', ok: true, title: 'Кръпките за сигурност се слагат автоматично', why: '', fix: '' });
  }

  // ── Услуги, вързани на всички интерфейси ───────────────────────────────────
  const exposed = [];
  if (listen.ok) {
    for (const line of listen.stdout.split('\n')) {
      const f = line.trim().split(/\s+/);
      if (f.length < 4) continue;
      const local = f[3];
      const proc = line.match(/users:\(\("([^"]+)"/)?.[1] || '?';
      // 0.0.0.0 / [::] значи „всеки интерфейс" — 127.0.0.1 е безопасно.
      if (/^(0\.0\.0\.0|\*|\[::\]):/.test(local)) exposed.push({ local, proc });
    }
  }
  const notExpected = exposed.filter((e) => !/^(ssh|sshd|nginx|caddy|systemd-resolve)$/.test(e.proc));
  if (notExpected.length) {
    add({
      id: 'exposed-ports',
      severity: 'high',
      title: `${plural(notExpected.length, 'услуга', 'услуги')} слушат на всички интерфейси`,
      why: `${notExpected.map((e) => `${e.proc} на ${e.local}`).join(', ')}. Приложение, вързано на 0.0.0.0, е достъпно отвън дори да мислиш, че е зад Nginx.`,
      fix: 'Върни ги на 127.0.0.1 (в конфига на приложението/compose: „127.0.0.1:3000:3000") и ги пускай само през reverse proxy.',
    });
  }

  // ── fail2ban ───────────────────────────────────────────────────────────────
  if (!f2b.ok) {
    add({ id: 'fail2ban', severity: 'medium', title: 'Няма fail2ban', why: 'Не е задължителен при SSH само с ключове, но реже шума и блокира упорити скенери.', fix: 'apt install fail2ban && systemctl enable --now fail2ban' });
  } else {
    add({ id: 'fail2ban-ok', severity: 'low', ok: true, title: 'fail2ban работи', why: '', fix: '' });
  }

  // ── sudo без парола ────────────────────────────────────────────────────────
  if (sudoers.ok && sudoers.stdout.trim()) {
    const lines = sudoers.stdout.split('\n').filter((l) => l.trim() && !l.trim().startsWith('#'));
    if (lines.length) {
      add({
        id: 'nopasswd',
        severity: 'medium',
        title: 'Има sudo без парола (NOPASSWD)',
        why: `${plural(lines.length, 'правило', 'правила')}. Всеки процес на този потребител става root без нито едно доказване.`,
        fix: 'Прегледай /etc/sudoers.d/ и махни NOPASSWD, където не е нужно (typично остава само за конкретна команда).',
      });
    }
  }

  // ── Празни пароли ──────────────────────────────────────────────────────────
  if (passwd.ok && passwd.stdout.trim()) {
    add({
      id: 'empty-password',
      severity: 'critical',
      title: 'Има акаунт с ПРАЗНА парола',
      why: `Засегнати: ${passwd.stdout.trim().split('\n').join(', ')}. Това е вход без нищо.`,
      fix: 'passwd -l <потребител>  (или задай парола)',
    });
  }

  // ── Права на чувствителни файлове ──────────────────────────────────────────
  for (const [file, maxMode] of [['/etc/shadow', 0o640], ['/root/.ssh/authorized_keys', 0o600], ['/etc/vps-dashboard/config.json', 0o600]]) {
    try {
      const st = fs.statSync(file);
      const mode = st.mode & 0o777;
      if (mode & ~maxMode & 0o777) {
        add({
          id: `perm-${path.basename(file)}`,
          severity: file === '/etc/shadow' ? 'critical' : 'high',
          title: `Твърде широки права: ${file}`,
          why: `Сега 0${mode.toString(8)}, очаквано най-много 0${maxMode.toString(8)}. Всеки на машината го чете.`,
          fix: `chmod 0${maxMode.toString(8)} ${file}`,
        });
      }
    } catch {
      /* липсващият файл не е находка */
    }
  }

  const problems = findings.filter((f) => !f.ok);
  const lost = problems.reduce((sum, f) => sum + (WEIGHTS[f.severity] || 0), 0);
  const score = Math.max(0, 100 - lost);
  return {
    score,
    grade: score >= 90 ? 'A' : score >= 75 ? 'B' : score >= 60 ? 'C' : score >= 40 ? 'D' : 'F',
    checks: findings.length,
    problems: problems.sort((a, b) => WEIGHTS[b.severity] - WEIGHTS[a.severity]),
    good: findings.filter((f) => f.ok),
    note: 'Оценката е ориентир, не сертификат. Покрива входните точки, които при публичен VPS най-често решават изхода — не заменя пълен одит.',
  };
}

// ── Отпечатък на /etc: „какво се е променило, откакто беше наред" ────────────
//
// Не е откриване на прониквания (root може да пренапише и базата). Целта е
// друга и много по-честа: „вчера работеше, днес не" — кой файл е мръднал.
const BASELINE_FILE = 'etc-baseline.json';
const WATCHED = [
  '/etc/ssh/sshd_config',
  '/etc/sudoers',
  '/etc/passwd',
  '/etc/group',
  '/etc/hosts',
  '/etc/fstab',
  '/etc/crontab',
  '/etc/nginx/nginx.conf',
  '/etc/systemd/system',
  '/etc/sudoers.d',
  '/etc/nginx/sites-enabled',
  '/etc/cron.d',
];
const MAX_FILES = 2000;

function hashFile(p) {
  try {
    const st = fs.statSync(p);
    if (!st.isFile() || st.size > 4 * 1024 * 1024) return null;
    return {
      sha256: crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex').slice(0, 32),
      mode: '0' + (st.mode & 0o777).toString(8),
      size: st.size,
    };
  } catch {
    return null;
  }
}

function walk(target, out, depth = 0) {
  if (out.size >= MAX_FILES || depth > 3) return;
  let st;
  try {
    st = fs.statSync(target);
  } catch {
    return;
  }
  if (st.isFile()) {
    const h = hashFile(target);
    if (h) out.set(target, h);
    return;
  }
  if (!st.isDirectory()) return;
  let entries = [];
  try {
    entries = fs.readdirSync(target);
  } catch {
    return;
  }
  for (const name of entries) {
    if (out.size >= MAX_FILES) return;
    walk(path.join(target, name), out, depth + 1);
  }
}

export function snapshotEtc() {
  const files = new Map();
  for (const t of WATCHED) walk(t, files);
  return { takenAt: new Date().toISOString(), files: Object.fromEntries(files) };
}

export function saveBaseline(stateDir, snap) {
  const file = path.join(stateDir, BASELINE_FILE);
  fs.writeFileSync(file, JSON.stringify(snap), { mode: 0o600 });
  return { file, count: Object.keys(snap.files).length, takenAt: snap.takenAt };
}

export function loadBaseline(stateDir) {
  try {
    return JSON.parse(fs.readFileSync(path.join(stateDir, BASELINE_FILE), 'utf8'));
  } catch {
    return null;
  }
}

export function diffEtc(stateDir) {
  const base = loadBaseline(stateDir);
  if (!base) return { hasBaseline: false, note: 'Още няма отпечатък. Направи го, когато сървърът е в изправно състояние — оттам нататък всяка промяна се вижда.' };
  const now = snapshotEtc();
  const added = [];
  const removed = [];
  const changed = [];
  for (const [p, h] of Object.entries(now.files)) {
    const b = base.files[p];
    if (!b) added.push({ path: p, mode: h.mode });
    else if (b.sha256 !== h.sha256) changed.push({ path: p, sizeBefore: b.size, sizeAfter: h.size });
    else if (b.mode !== h.mode) changed.push({ path: p, modeBefore: b.mode, modeAfter: h.mode, onlyMode: true });
  }
  for (const p of Object.keys(base.files)) if (!now.files[p]) removed.push({ path: p });
  return {
    hasBaseline: true,
    takenAt: base.takenAt,
    tracked: Object.keys(base.files).length,
    added,
    removed,
    changed,
    clean: !added.length && !removed.length && !changed.length,
  };
}

// ── fail2ban: преглед и действия ─────────────────────────────────────────────
const JAIL_RX = /^[\w.-]{1,64}$/;
const IP_RX = /^[0-9a-f.:]{3,45}$/i;

export async function fail2banStatus() {
  const r = await run('fail2ban-client', ['status'], { timeout: 8000 });
  if (!r.ok) return { available: false, jails: [] };
  const names = (r.stdout.match(/Jail list:\s*(.*)/)?.[1] || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const jails = [];
  for (const name of names.slice(0, 30)) {
    const j = await run('fail2ban-client', ['status', name], { timeout: 8000 });
    if (!j.ok) continue;
    const num = (k) => Number(j.stdout.match(new RegExp(`${k}:\\s*(\\d+)`))?.[1] ?? 0);
    const banned = (j.stdout.match(/Banned IP list:\s*(.*)/)?.[1] || '').split(/\s+/).filter(Boolean);
    jails.push({
      name,
      currentlyFailed: num('Currently failed'),
      totalFailed: num('Total failed'),
      currentlyBanned: num('Currently banned'),
      totalBanned: num('Total banned'),
      banned: banned.slice(0, 200),
    });
  }
  return { available: true, jails };
}

export async function fail2banAction(jail, ip, action, audit, user) {
  if (!JAIL_RX.test(String(jail || ''))) throw Object.assign(new Error('Невалидно име на jail'), { status: 400 });
  if (!IP_RX.test(String(ip || ''))) throw Object.assign(new Error('Невалиден IP адрес'), { status: 400 });
  if (action !== 'banip' && action !== 'unbanip') throw Object.assign(new Error('Невалидно действие'), { status: 400 });
  audit.log({ action: `fail2ban.${action}`, jail, ip, user });
  const r = await run('fail2ban-client', ['set', jail, action, ip], { timeout: 10000 });
  if (!r.ok) throw Object.assign(new Error(r.stderr || r.stdout || 'fail2ban-client се провали'), { status: 400 });
  return { ok: true, jail, ip, action, output: r.stdout.trim() };
}
