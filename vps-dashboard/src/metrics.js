// Системни метрики — direto от /proc и df, без агенти и без зависимости.
// Пази 24ч история в паметта (снимка на 30s) за графиките.
import fs from 'node:fs';
import os from 'node:os';
import { run } from './exec.js';

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
    return m ? Number(m[1]) * 1024 : 0;
  };
  const total = get('MemTotal');
  const available = get('MemAvailable');
  return {
    total,
    available,
    used: total - available,
    swapTotal: get('SwapTotal'),
    swapUsed: get('SwapTotal') - get('SwapFree'),
  };
}

// ── Мрежа: /proc/net/dev делта (bytes/s), без lo ──────────────────────────────
export function parseNetDev(text) {
  let rx = 0;
  let tx = 0;
  for (const line of text.split('\n')) {
    const m = line.match(/^\s*([\w.@-]+):\s*(.+)$/);
    if (!m || m[1] === 'lo') continue;
    const f = m[2].trim().split(/\s+/).map(Number);
    rx += f[0] || 0;
    tx += f[8] || 0;
  }
  return { rx, tx };
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

    const cpuPct = cpuPercent(this.prevCpu, cpu);
    const netRate =
      this.prevNet && dtSec > 0
        ? {
            rxBps: Math.max(0, (net.rx - this.prevNet.rx) / dtSec),
            txBps: Math.max(0, (net.tx - this.prevNet.tx) / dtSec),
          }
        : { rxBps: 0, txBps: 0 };

    this.prevCpu = cpu;
    this.prevNet = net;
    this.prevTs = now;

    const mem = parseMeminfo(readProc('/proc/meminfo'));
    const df = await run('df', ['-kP']);
    const disks = df.ok ? parseDf(df.stdout) : [];

    return {
      ts: now,
      hostname: os.hostname(),
      uptimeSec: os.uptime(),
      load: os.loadavg(),
      cpus: os.cpus().length,
      cpuPct: cpuPct ?? 0,
      mem,
      net: netRate,
      disks,
      temperatureC: readTemperature(),
    };
  }

  getHistory() {
    return this.history;
  }
}

function compact(snap) {
  return {
    ts: snap.ts,
    cpu: Math.round(snap.cpuPct * 10) / 10,
    memUsed: snap.mem.used,
    memTotal: snap.mem.total,
    load1: Math.round(snap.load[0] * 100) / 100,
    rxBps: Math.round(snap.net.rxBps),
    txBps: Math.round(snap.net.txBps),
    diskMax: Math.max(0, ...snap.disks.map((d) => d.usePercent)),
  };
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
