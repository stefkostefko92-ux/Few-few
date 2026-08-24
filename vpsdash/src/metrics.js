// Системни метрики — direto от /proc и df, без агенти и без зависимости.
// Пази 24ч история в паметта (снимка на 30s) за графиките.
import fs from 'node:fs';
import os from 'node:os';
import { run } from './exec.js';
import { compact } from './history.js';
import { KernelSampler } from './kernel.js';
import { isBilledIface } from './traffic.js';

const HISTORY_STEP_MS = 30_000;
const HISTORY_CAP = (24 * 3600 * 1000) / HISTORY_STEP_MS; // 24 часа

function readProc(file) {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch {
    return '';
  }
}

// ── CPU: делта между две четения на /proc/stat ────────────────────────────────
export function parseCpuStat(text) {
  const line = text.split('\n').find((l) => l.startsWith('cpu '));
  if (!line) return null;
  const n = line.trim().split(/\s+/).slice(1).map(Number);
  const [user, nice, system, idle, iowait = 0, irq = 0, softirq = 0, steal = 0] = n;
  const idleAll = idle + iowait;
  const total = user + nice + system + idle + iowait + irq + softirq + steal;
  return { total, idle: idleAll };
}

export function cpuPercent(prev, curr) {
  if (!prev || !curr) return null;
  const dt = curr.total - prev.total;
  const di = curr.idle - prev.idle;
  if (dt <= 0) return null;
  return Math.max(0, Math.min(100, ((dt - di) / dt) * 100));
}

// ── Памет: /proc/meminfo (MemAvailable е истината, не MemFree) ────────────────
export function parseMeminfo(text) {
  const get = (key) => {
    const m = text.match(new RegExp(`^${key}:\\s+(\\d+) kB`, 'm'));
    return m ? Number(m[1]) * 1024 : null;
  };
  const total = get('MemTotal');
  let available = get('MemAvailable');
  // `MemAvailable` е от ядро 3.14 нагоре, но /proc може да е и орязан или
  // нечетим. Липсата му даваше `available = 0` → `used = total` → панелът
  // твърдеше 100% заета памет и вдигаше КРИТИЧНА аларма на здрава машина.
  // Резервата е класическата сметка отпреди MemAvailable; ако и тя липсва,
  // отговорът е „не знам", а не най-страшното число.
  let estimated = false;
  if (available === null) {
    const free = get('MemFree');
    const buffers = get('Buffers') ?? 0;
    const cached = get('Cached') ?? 0;
    if (free !== null) {
      available = free + buffers + cached;
      estimated = true;
    }
  }
  const swapTotal = get('SwapTotal');
  const swapFree = get('SwapFree');
  return {
    total,
    available,
    // `null` се разпространява нарочно: „не знам" не бива да се закръгля до 0.
    used: total !== null && available !== null ? total - available : null,
    availableEstimated: estimated, // интерфейсът го казва, вместо да мълчи
    swapTotal,
    swapUsed: swapTotal !== null && swapFree !== null ? swapTotal - swapFree : null,
  };
}

// ── Мрежа: /proc/net/dev делта (bytes/s) ──────────────────────────────────────
// Броят се само ФИЗИЧЕСКИТЕ интерфейси — същото правило като при месечния
// трафик, и по същата причина: байт от контейнер минава И през `docker0`/`veth`,
// И през `eth0`. Сборът от всички го брои двойно.
//
// Дотук „без lo" беше единственият филтър, значи живата скорост на обзора
// показваше ~двойно на машина с Docker (а нашата е точно такава) — при това
// СЪСЕДНО на месечния трафик, който брои правилно. Две числа на един екран,
// разминати двукратно, са по-лоши от едно грешно: човек не знае кое да вярва.
export function parseNetDev(text, counted = isBilledIface) {
  let rx = 0;
  let tx = 0;
  const ifaces = [];
  for (const line of text.split('\n')) {
    const m = line.match(/^\s*([\w.@-]+):\s*(.+)$/);
    if (!m || m[1] === 'lo' || !counted(m[1])) continue;
    const f = m[2].trim().split(/\s+/).map(Number);
    rx += f[0] || 0;
    tx += f[8] || 0;
    ifaces.push(m[1]);
  }
  return { rx, tx, ifaces };
}

// ── Дискове: df -kP (POSIX формат — стабилен за парсване) ─────────────────────
export function parseDf(text) {
  const out = [];
  for (const line of text.split('\n').slice(1)) {
    const f = line.trim().split(/\s+/);
    if (f.length < 6 || !f[0].startsWith('/dev/')) continue;
    out.push({
      fs: f[0],
      totalBytes: Number(f[1]) * 1024,
      usedBytes: Number(f[2]) * 1024,
      availBytes: Number(f[3]) * 1024,
      usePercent: Number(String(f[4]).replace('%', '')),
      mount: f.slice(5).join(' '),
    });
  }
  return out;
}

export class MetricsCollector {
  constructor() {
    this.prevCpu = null;
    this.prevNet = null;
    this.prevTs = 0;
    this.history = [];
    this.listeners = new Set();
    this.latest = null;
    this.kernel = new KernelSampler();
  }

  startSampling() {
    // 5s жива снимка (SSE), на всеки 30s влиза в историята.
    let lastHist = 0;
    const tick = async () => {
      try {
        const snap = await this.sample();
        this.latest = snap;
        for (const l of this.listeners) l(snap);
        if (Date.now() - lastHist >= HISTORY_STEP_MS) {
          lastHist = Date.now();
          this.history.push(compact(snap));
          if (this.history.length > HISTORY_CAP) this.history.shift();
        }
      } catch {
        /* следващият tick опитва пак */
      }
    };
    tick();
    this.timer = setInterval(tick, 5000);
    this.timer.unref?.();
  }

  async sample() {
    const now = Date.now();
    const cpu = parseCpuStat(readProc('/proc/stat'));
    const net = parseNetDev(readProc('/proc/net/dev'));
    const dtSec = this.prevTs ? (now - this.prevTs) / 1000 : 0;

    // И двете са ДЕЛТИ: първата проба (при всеки старт на панела) няма от какво
    // да ги смята. `?? 0` превръщаше това незнание в „0% CPU · 0 B/s" — число,
    // което изглежда като нормално число и влиза в историята, в прогнозата и в
    // откриването на аномалии. Първата точка след всеки рестарт беше фалшива
    // нула. `null` значи „не знам" по целия път и се показва като „—".
    const cpuPct = cpuPercent(this.prevCpu, cpu);
    const netRate =
      this.prevNet && dtSec > 0
        ? {
            rxBps: Math.max(0, (net.rx - this.prevNet.rx) / dtSec),
            txBps: Math.max(0, (net.tx - this.prevNet.tx) / dtSec),
          }
        : { rxBps: null, txBps: null };

    this.prevCpu = cpu;
    this.prevNet = net;
    this.prevTs = now;

    const mem = parseMeminfo(readProc('/proc/meminfo'));
    const df = await run('df', ['-kP']);
    const disks = df.ok ? parseDf(df.stdout) : [];
    // Сигналите от ядрото (PSI, steal, диск I/O, OOM…) — те казват дали БОЛИ,
    // докато процентите горе казват само колко е заето.
    const kernel = await this.kernel.sample().catch(() => null);

    return {
      ts: now,
      hostname: os.hostname(),
      uptimeSec: os.uptime(),
      load: os.loadavg(),
      cpus: os.cpus().length,
      cpuPct,
      mem,
      net: netRate,
      disks,
      kernel,
      temperatureC: readTemperature(),
    };
  }

  getHistory() {
    return this.history;
  }
}


function readTemperature() {
  // Best-effort: първата термална зона; на VPS често липсва → null.
  try {
    const zones = fs.readdirSync('/sys/class/thermal').filter((z) => z.startsWith('thermal_zone'));
    for (const z of zones) {
      const v = Number(fs.readFileSync(`/sys/class/thermal/${z}/temp`, 'utf8'));
      if (Number.isFinite(v) && v > 0) return Math.round(v / 100) / 10;
    }
  } catch {
    /* няма сензори */
  }
  return null;
}
