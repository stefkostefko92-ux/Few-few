// Система: обзор, процеси, ъпдейти, сигурност, бекъпи, крон, захранване.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { run, runOk } from './exec.js';

// ── Обзор ─────────────────────────────────────────────────────────────────────
export async function systemInfo() {
  let osRelease = '';
  try {
    const m = fs.readFileSync('/etc/os-release', 'utf8').match(/^PRETTY_NAME="?([^"\n]+)"?/m);
    osRelease = m ? m[1] : '';
  } catch {
    /* ок */
  }
  const rebootRequired = fs.existsSync('/var/run/reboot-required');
  return {
    hostname: os.hostname(),
    os: osRelease || `${os.type()} ${os.release()}`,
    kernel: os.release(),
    arch: os.arch(),
    cpus: os.cpus().length,
    cpuModel: os.cpus()[0]?.model || '',
    uptimeSec: os.uptime(),
    bootTime: Date.now() - os.uptime() * 1000,
    rebootRequired,
    nodeVersion: process.version,
  };
}

// ── Процеси ───────────────────────────────────────────────────────────────────
export async function listProcesses(sort = 'cpu', limit = 60) {
  const key = sort === 'mem' ? '-%mem' : '-%cpu';
  const out = await runOk('ps', ['axo', 'pid,ppid,user,%cpu,%mem,rss,stat,etime,comm,args', '--sort', key], {
    maxBuffer: 16 * 1024 * 1024,
  });
  const lines = out.split('\n').slice(1).filter(Boolean).slice(0, limit);
  return lines.map((l) => {
    const m = l.trim().match(/^(\d+)\s+(\d+)\s+(\S+)\s+([\d.]+)\s+([\d.]+)\s+(\d+)\s+(\S+)\s+(\S+)\s+(\S+)\s*(.*)$/);
    if (!m) return null;
    return {
      pid: Number(m[1]),
      ppid: Number(m[2]),
      user: m[3],
      cpu: Number(m[4]),
      mem: Number(m[5]),
      rssBytes: Number(m[6]) * 1024,
      stat: m[7],
      etime: m[8],
      comm: m[9],
      args: m[10].slice(0, 200),
    };
  }).filter(Boolean);
}

export async function killProcess(pid, signal, audit, user) {
  const p = Number(pid);
  if (!Number.isInteger(p) || p <= 1) throw Object.assign(new Error('Невалиден PID'), { status: 400 });
  if (p === process.pid) throw Object.assign(new Error('Няма да убия самия панел'), { status: 400 });
  const sig = signal === 'SIGKILL' ? 'SIGKILL' : 'SIGTERM';
  audit.log({ action: 'process.kill', pid: p, signal: sig, user });
  try {
    process.kill(p, sig);
  } catch (err) {
    throw Object.assign(new Error(`kill: ${err.message}`), { status: 400 });
  }
  return { pid: p, signal: sig, ok: true };
}

// ── Ъпдейти (apt) ─────────────────────────────────────────────────────────────
export async function updatesInfo() {
  // "apt list" предупреждава за нестабилен CLI — но е най-лекият начин без deps;
  // parse-ваме дефанзивно и всичко е read-only.
  const r = await run('apt', ['list', '--upgradable'], {
    timeout: 30000,
    env: { LC_ALL: 'C' },
  });
  if (!r.ok) return { available: false, packages: [], error: (r.stderr || '').slice(0, 200) };
  const packages = r.stdout
    .split('\n')
    .filter((l) => l.includes('[upgradable from:'))
    .map((l) => {
      const m = l.match(/^([^/]+)\/(\S+)\s+(\S+)\s+(\S+)\s+\[upgradable from:\s*([^\]]+)\]/);
      return m ? { name: m[1], channel: m[2], candidate: m[3], arch: m[4], current: m[5] } : { name: l };
    });
  return {
    available: true,
    packages,
    rebootRequired: fs.existsSync('/var/run/reboot-required'),
  };
}

export function aptRefreshSpec() {
  return {
    title: 'apt update (опресни списъците)',
    cmd: 'apt-get',
    args: ['update', '-y'],
    // NEEDRESTART_MODE=a: на Ubuntu 22.04+ `needrestart` спира по средата с
    // пълноекранен въпрос „кои услуги да рестартирам". Няма кой да отговори —
    // задачата виси до таймаута и изглежда като заклещен apt. „a" = рестартирай
    // автоматично засегнатите услуги, което е и правилното на сървър.
    env: { DEBIAN_FRONTEND: 'noninteractive', NEEDRESTART_MODE: 'a' },
    exclusive: 'system',
    timeoutMs: 10 * 60 * 1000,
  };
}

export function aptUpgradeSpec(security = false) {
  // unattended-upgrade за security-only, пълен dist-upgrade иначе.
  return security
    ? {
        title: 'Security ъпдейти (unattended-upgrade)',
        cmd: 'unattended-upgrade',
        args: ['-v'],
        env: { DEBIAN_FRONTEND: 'noninteractive', NEEDRESTART_MODE: 'a' },
        exclusive: 'system',
        timeoutMs: 30 * 60 * 1000,
      }
    : {
        title: 'apt upgrade (всички пакети)',
        cmd: 'apt-get',
        args: ['upgrade', '-y'],
        env: { DEBIAN_FRONTEND: 'noninteractive', NEEDRESTART_MODE: 'a' },
        exclusive: 'system',
        timeoutMs: 45 * 60 * 1000,
      };
}

// ── Сигурност ────────────────────────────────────────────────────────────────
export async function securityInfo() {
  const [ufw, ports, logins, f2b, sshd] = await Promise.all([
    run('ufw', ['status', 'verbose'], { timeout: 10000 }),
    run('ss', ['-tlnp'], { timeout: 10000 }),
    run('last', ['-n', '15', '-w'], { timeout: 10000 }),
    run('fail2ban-client', ['status'], { timeout: 10000 }),
    run('sshd', ['-T'], { timeout: 10000 }),
  ]);
  let sshSummary = null;
  if (sshd.ok) {
    const grab = (k) => sshd.stdout.match(new RegExp(`^${k} (.+)$`, 'm'))?.[1] || null;
    sshSummary = {
      permitRootLogin: grab('permitrootlogin'),
      passwordAuthentication: grab('passwordauthentication'),
      port: grab('port'),
    };
  }
  return {
    ufw: ufw.ok ? ufw.stdout.trim() : null,
    listening: ports.ok ? parsePorts(ports.stdout) : [],
    lastLogins: logins.ok ? logins.stdout.trim().split('\n').slice(0, 15) : [],
    fail2ban: f2b.ok ? f2b.stdout.trim() : null,
    ssh: sshSummary,
    certs: await tlsCerts(),
  };
}

function parsePorts(text) {
  return text
    .split('\n')
    .slice(1)
    .filter(Boolean)
    .map((l) => {
      const f = l.trim().split(/\s+/);
      if (f.length < 4) return null;
      const proc = l.match(/users:\(\("([^"]+)"/)?.[1] || '';
      return { local: f[3], process: proc };
    })
    .filter(Boolean);
}

// Услуги в състояние failed — суровината за алармата „паднала услуга“.
// ВАЖНО: празен масив значи „няма паднали услуги", а провал на командата значи
// „не знам". Двете НЕ бива да се смесват: който ги смеси, резолвва алармата за
// паднала услуга точно когато systemctl е спрял да отговаря. Затова има и
// `failedServicesSafe()`, който казва кое от двете е.
export async function failedServicesSafe() {
  const r = await run('systemctl', ['list-units', '--state=failed', '--no-pager', '--output=json'], {
    timeout: 10000,
  });
  if (!r.ok) return { ok: false, error: (r.stderr || r.error || 'systemctl не отговори').slice(0, 200), units: [] };
  try {
    return { ok: true, units: JSON.parse(r.stdout).map((u) => u.unit) };
  } catch (err) {
    return { ok: false, error: `нечетим изход: ${err.message}`, units: [] };
  }
}

// (Тук стоеше `failedServices()` — „наивна" обвивка без извикващ. Махната е
// нарочно: тя връщаше само масива и с това СМЕСВАШЕ „няма паднали услуги" с
// „systemctl не отговори" — точно грешката, срещу която е написан коментарът
// над `failedServicesSafe`. Мъртъв код, който демонстрира антипатърна, е
// покана да бъде копиран. Git пази историята.)

// Липсваща папка = няма сертификати (нормално). Грешка при четене = не знам.
export async function tlsCertsSafe() {
  const out = [];
  const live = '/etc/letsencrypt/live';
  let domains = [];
  try {
    domains = fs.readdirSync(live).filter((d) => !d.startsWith('.') && !d.endsWith('README'));
  } catch (err) {
    // ENOENT е законно „няма Let's Encrypt тук"; всичко друго е незнание.
    if (err.code === 'ENOENT') return { ok: true, certs: [] };
    return { ok: false, error: err.message.slice(0, 200), certs: [] };
  }
  for (const d of domains) {
    const pem = path.join(live, d, 'fullchain.pem');
    const r = await run('openssl', ['x509', '-enddate', '-noout', '-in', pem], { timeout: 5000 });
    if (!r.ok) return { ok: false, error: `openssl се провали за ${d}`, certs: out };
    const m = r.stdout.match(/notAfter=(.+)/);
    const expires = m ? new Date(m[1]) : null;
    out.push({
      domain: d,
      expiresAt: expires ? expires.toISOString() : null,
      daysLeft: expires ? Math.round((expires.getTime() - Date.now()) / 86400000) : null,
    });
  }
  return { ok: true, certs: out };
}

export async function tlsCerts() {
  return (await tlsCertsSafe()).certs;
}

// ── Бекъпи ────────────────────────────────────────────────────────────────────
export async function backupsInfo(cfg) {
  const spots = [
    '/opt/few-few/shared/zabobovdol/backups',
    '/opt/medqr/data',
    '/opt/vizitka/data',
    '/opt/nexus/state/data',
  ];
  const found = [];
  for (const dir of spots) {
    try {
      const entries = fs.readdirSync(dir).slice(0, 500);
      const files = entries
        .map((name) => {
          try {
            const st = fs.statSync(path.join(dir, name));
            return { name, sizeBytes: st.size, mtime: st.mtime.toISOString(), isDir: st.isDirectory() };
          } catch {
            return null;
          }
        })
        .filter(Boolean)
        .sort((a, b) => b.mtime.localeCompare(a.mtime))
        .slice(0, 30);
      found.push({ dir, files });
    } catch {
      /* няма такава папка на този VPS */
    }
  }
  // releases + текущ release за контекст
  let releases = [];
  try {
    releases = fs
      .readdirSync(cfg.paths.releasesDir)
      .filter((d) => /^\d{8}-\d{6}$/.test(d))
      .sort()
      .reverse();
  } catch {
    /* ок */
  }
  return { spots: found, releases };
}

// ── Крон + таймери ────────────────────────────────────────────────────────────
export async function cronInfo() {
  const [crontab, timers] = await Promise.all([
    run('crontab', ['-l'], { timeout: 5000 }),
    run('systemctl', ['list-timers', '--all', '--no-pager', '--output=json'], { timeout: 10000 }),
  ]);
  let timerList = [];
  if (timers.ok) {
    try {
      timerList = JSON.parse(timers.stdout).map((t) => ({
        unit: t.unit,
        activates: t.activates,
        next: t.next || null,
        last: t.last || null,
      }));
    } catch {
      /* стар systemd — таблицата остава празна */
    }
  }
  let etcCron = [];
  try {
    etcCron = fs
      .readFileSync('/etc/crontab', 'utf8')
      .split('\n')
      .filter((l) => l.trim() && !l.trim().startsWith('#'));
  } catch {
    /* ок */
  }
  return {
    rootCrontab: crontab.ok ? crontab.stdout.trim() : null,
    etcCrontab: etcCron,
    timers: timerList,
  };
}

// ── Захранване ────────────────────────────────────────────────────────────────
export async function powerAction(action, audit, user) {
  if (action !== 'reboot' && action !== 'poweroff') {
    throw Object.assign(new Error('Невалидно действие'), { status: 400 });
  }
  audit.log({ action: `power.${action}`, user });
  // Отложено с 5s — отговорът да стигне до браузъра преди сървърът да падне.
  setTimeout(() => run('systemctl', [action], { timeout: 10000 }), 5000);
  return { ok: true, action, note: 'Изпълнява се след 5 секунди.' };
}
