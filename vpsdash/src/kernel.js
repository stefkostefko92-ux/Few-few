// Сигнали направо от ядрото, които липсваха: steal time, PSI, диск I/O, inode-и,
// OOM убийства, мрежа по интерфейс, TCP състояния, файлови дескриптори.
//
// Доктрината (канонът на Наблюдателя): алармата трябва да е по СИМПТОМ
// („задачите чакат"), не по причина („CPU e 90%"). CPU 90% при доволни
// потребители не е проблем; PSI 40% при CPU 60% е. Затова тук първо стоят PSI и
// steal — те казват дали НЕЩО БОЛИ, а останалите казват КОЕ.
import fs from 'node:fs';
import { run } from './exec.js';

function readFile(p) {
  try {
    return fs.readFileSync(p, 'utf8');
  } catch {
    return null;
  }
}

// ── PSI: /proc/pressure/{cpu,io,memory} ───────────────────────────────────────
// Формат: „some avg10=0.00 avg60=0.00 avg300=0.00 total=0" (total е в микросекунди).
// cpu има само „some"; „full" е 0 от ядро 5.13 нататък.
export function parsePressure(text) {
  if (!text) return null;
  const out = {};
  for (const line of text.split('\n')) {
    const m = line.match(/^(some|full)\s+avg10=([\d.]+)\s+avg60=([\d.]+)\s+avg300=([\d.]+)\s+total=(\d+)/);
    if (m) out[m[1]] = { avg10: Number(m[2]), avg60: Number(m[3]), avg300: Number(m[4]), totalUs: Number(m[5]) };
  }
  return Object.keys(out).length ? out : null;
}

export function readPressure() {
  const cpu = parsePressure(readFile('/proc/pressure/cpu'));
  const io = parsePressure(readFile('/proc/pressure/io'));
  const memory = parsePressure(readFile('/proc/pressure/memory'));
  // Липсва при CONFIG_PSI=n или psi=0 на kernel cmdline — казваме го честно,
  // вместо да показваме нули, които изглеждат като „всичко е наред".
  if (!cpu && !io && !memory) return { available: false };
  return { available: true, cpu, io, memory };
}

// ── CPU по режими (вкл. steal — единственият сигнал, че бавното не е наша вина) ──
// /proc/stat, ред „cpu": user nice system idle iowait irq softirq steal guest guest_nice
export function parseCpuModes(text) {
  const line = (text || '').split('\n').find((l) => l.startsWith('cpu '));
  if (!line) return null;
  const n = line.trim().split(/\s+/).slice(1).map(Number);
  const [user = 0, nice = 0, system = 0, idle = 0, iowait = 0, irq = 0, softirq = 0, steal = 0] = n;
  return { user, nice, system, idle, iowait, irq, softirq, steal, total: user + nice + system + idle + iowait + irq + softirq + steal };
}

// Процентите се смятат от ДЕЛТАТА между две четения — иначе са средни от boot.
export function cpuModePercents(prev, curr) {
  if (!prev || !curr) return null;
  const dt = curr.total - prev.total;
  if (dt <= 0) return null;
  const pct = (k) => Math.max(0, Math.min(100, ((curr[k] - prev[k]) / dt) * 100));
  return {
    user: pct('user'),
    system: pct('system'),
    iowait: pct('iowait'),
    steal: pct('steal'),
    irq: pct('irq') + pct('softirq'),
    idle: pct('idle'),
  };
}

// Планировчик: колко процеса чакат CPU и колко висят в непрекъсваем I/O (D-state).
export function parseSchedStats(text) {
  const get = (key) => {
    const m = (text || '').match(new RegExp(`^${key}\\s+(\\d+)`, 'm'));
    return m ? Number(m[1]) : null;
  };
  return { ctxt: get('ctxt'), forks: get('processes'), running: get('procs_running'), blocked: get('procs_blocked') };
}

// ── Диск I/O: /proc/diskstats ─────────────────────────────────────────────────
// „major minor име" + полета; след split индексите са:
// 3=четения 5=сектори(×512) 6=ms четене 7=записи 9=сектори 10=ms запис
// 11=I/O в момента 12=io_ticks(ms активно) → util%
export function parseDiskstats(text) {
  const out = [];
  for (const line of (text || '').split('\n')) {
    const f = line.trim().split(/\s+/);
    if (f.length < 14) continue;
    const name = f[2];
    // Пропускаме loop/ram и дяловете (дялът няма своя директория в /sys/block).
    if (/^(loop|ram|sr|fd)\d/.test(name)) continue;
    if (!fs.existsSync(`/sys/block/${name}`)) continue;
    out.push({
      name,
      reads: Number(f[3]),
      readSectors: Number(f[5]),
      readMs: Number(f[6]),
      writes: Number(f[7]),
      writeSectors: Number(f[9]),
      writeMs: Number(f[10]),
      inFlight: Number(f[11]),
      ioTicksMs: Number(f[12]),
    });
  }
  return out;
}

// Производни: IOPS, MB/s, средно закъснение на операция и колко % от времето
// дискът е бил зает. Await над ~100ms устойчиво = дискът е тесното място.
export function diskRates(prev, curr, dtMs) {
  if (!prev || !curr || dtMs <= 0) return [];
  const prevByName = new Map(prev.map((d) => [d.name, d]));
  const out = [];
  for (const d of curr) {
    const p = prevByName.get(d.name);
    if (!p) continue;
    const dr = d.reads - p.reads;
    const dw = d.writes - p.writes;
    const dts = dtMs / 1000;
    out.push({
      name: d.name,
      readIops: dr / dts,
      writeIops: dw / dts,
      readBps: ((d.readSectors - p.readSectors) * 512) / dts,
      writeBps: ((d.writeSectors - p.writeSectors) * 512) / dts,
      readAwaitMs: dr > 0 ? (d.readMs - p.readMs) / dr : 0,
      writeAwaitMs: dw > 0 ? (d.writeMs - p.writeMs) / dw : 0,
      utilPct: Math.max(0, Math.min(100, ((d.ioTicksMs - p.ioTicksMs) / dtMs) * 100)),
      inFlight: d.inFlight,
    });
  }
  return out;
}

// ── Inode-и: диск с 30% свободно място, но нула inode-и, не приема нов файл ────
export function parseDfInodes(text) {
  const out = [];
  for (const line of (text || '').split('\n').slice(1)) {
    const f = line.trim().split(/\s+/);
    if (f.length < 6 || !f[0].startsWith('/dev/')) continue;
    out.push({
      fs: f[0],
      inodes: Number(f[1]),
      used: Number(f[2]),
      free: Number(f[3]),
      usePercent: Number(String(f[4]).replace('%', '')) || 0,
      mount: f.slice(5).join(' '),
    });
  }
  return out;
}

// Файлови системи, които са ro ПО ПРИРОДА — образ, не авария. Аларма за тях е
// чист шум (проверено на живо: squashfs образи и нарочно ro монтирания).
const INHERENTLY_RO = /^(squashfs|iso9660|erofs|cramfs)$/;

// Кандидати за „преминала в read-only" (ext4 прави така при I/O грешка) —
// приложенията умират тихо, а df изглежда спокоен.
export function readOnlyMounts(text) {
  const out = [];
  for (const line of (text || '').split('\n')) {
    const [dev, mount, type, opts] = line.split(/\s+/);
    if (!dev || !dev.startsWith('/dev/')) continue;
    if (INHERENTLY_RO.test(type || '')) continue; // образ, не авария
    if (/(^|,)ro(,|$)/.test(opts || '')) out.push({ dev, mount, type });
  }
  return out;
}

// Всички записваеми монтирания — базовата линия, спрямо която се засича преход.
export function writableMounts(text) {
  const out = [];
  for (const line of (text || '').split('\n')) {
    const [dev, mount, type, opts] = line.split(/\s+/);
    if (!dev || !dev.startsWith('/dev/')) continue;
    if (INHERENTLY_RO.test(type || '')) continue;
    if (/(^|,)rw(,|$)/.test(opts || '')) out.push(mount);
  }
  return out;
}

// Само ПРЕХОДЪТ rw → ro е авария. Дял, монтиран ro от самото начало, е нечие
// решение, не проблем.
export function roTransitions(previousWritable, currentRo) {
  if (!previousWritable) return [];
  return currentRo.filter((m) => previousWritable.has(m.mount));
}

// ── OOM: /proc/vmstat, монотонен брояч ────────────────────────────────────────
export function parseVmstat(text) {
  const get = (k) => {
    const m = (text || '').match(new RegExp(`^${k} (\\d+)`, 'm'));
    return m ? Number(m[1]) : 0;
  };
  return { oomKill: get('oom_kill'), pswpin: get('pswpin'), pswpout: get('pswpout'), pgmajfault: get('pgmajfault') };
}

// ── Мрежа по интерфейс (със сгрешени/изпуснати пакети) ────────────────────────
export function parseNetDevPerIface(text) {
  const out = [];
  for (const line of (text || '').split('\n')) {
    const m = line.match(/^\s*([\w.@-]+):\s*(.+)$/);
    if (!m || m[1] === 'lo') continue;
    const f = m[2].trim().split(/\s+/).map(Number);
    out.push({
      iface: m[1],
      rxBytes: f[0] || 0,
      rxPackets: f[1] || 0,
      rxErrs: f[2] || 0,
      rxDrop: f[3] || 0,
      txBytes: f[8] || 0,
      txPackets: f[9] || 0,
      txErrs: f[10] || 0,
      txDrop: f[11] || 0,
    });
  }
  return out;
}

// ── TCP: препълнена accept опашка = „сайтът се отваря понякога" ───────────────
export function parseSockstat(text) {
  const m = (text || '').match(/^TCP: inuse (\d+) orphan (\d+) tw (\d+) alloc (\d+) mem (\d+)/m);
  const used = (text || '').match(/^sockets: used (\d+)/m);
  return m
    ? { inuse: Number(m[1]), orphan: Number(m[2]), timeWait: Number(m[3]), alloc: Number(m[4]), socketsUsed: used ? Number(used[1]) : null }
    : null;
}

export function parseListenOverflows(text) {
  const lines = (text || '').split('\n');
  for (let i = 0; i < lines.length - 1; i++) {
    if (!lines[i].startsWith('TcpExt:')) continue;
    const keys = lines[i].split(/\s+/);
    const vals = lines[i + 1].split(/\s+/);
    const idxOverflow = keys.indexOf('ListenOverflows');
    const idxDrops = keys.indexOf('ListenDrops');
    if (idxOverflow > 0) {
      return { listenOverflows: Number(vals[idxOverflow]) || 0, listenDrops: Number(vals[idxDrops]) || 0 };
    }
  }
  return null;
}

// ── Файлови дескриптори: EMFILE вали Node приложение мигновено ────────────────
export function parseFileNr(text) {
  const f = (text || '').trim().split(/\s+/).map(Number);
  return f.length >= 3 ? { allocated: f[0], max: f[2], usePercent: f[2] ? (f[0] / f[2]) * 100 : 0 } : null;
}

// ── Ресурси по systemd unit (cgroup v2) — кой изяде паметта ───────────────────
export function readCgroupStats(unit) {
  const base = `/sys/fs/cgroup/system.slice/${unit}`;
  const memCurrent = Number(readFile(`${base}/memory.current`)) || null;
  if (memCurrent === null && !fs.existsSync(base)) return null;
  const events = readFile(`${base}/memory.events`) || '';
  const cpuStat = readFile(`${base}/cpu.stat`) || '';
  const num = (text, key) => {
    const m = text.match(new RegExp(`^${key} (\\d+)`, 'm'));
    return m ? Number(m[1]) : null;
  };
  return {
    unit,
    memoryBytes: memCurrent,
    memoryPeak: Number(readFile(`${base}/memory.peak`)) || null,
    oomKills: num(events, 'oom_kill'),
    cpuUsec: num(cpuStat, 'usage_usec'),
    throttledUsec: num(cpuStat, 'throttled_usec'),
    pids: Number(readFile(`${base}/pids.current`)) || null,
    pressure: parsePressure(readFile(`${base}/memory.pressure`)),
  };
}

// ── Събиране на всичко наведнъж ───────────────────────────────────────────────
export class KernelSampler {
  constructor() {
    this.prev = null;
    this.prevTs = 0;
    this.writableSeen = null; // базова линия: кои дялове са били записваеми
  }

  async sample() {
    const now = Date.now();
    const cpuModes = parseCpuModes(readFile('/proc/stat'));
    const disks = parseDiskstats(readFile('/proc/diskstats'));
    const nets = parseNetDevPerIface(readFile('/proc/net/dev'));
    const vmstat = parseVmstat(readFile('/proc/vmstat'));

    const dt = this.prevTs ? now - this.prevTs : 0;
    const out = {
      ts: now,
      pressure: readPressure(),
      cpuModes: cpuModePercents(this.prev?.cpuModes, cpuModes),
      sched: parseSchedStats(readFile('/proc/stat')),
      diskIo: diskRates(this.prev?.disks, disks, dt),
      net: nets.map((n) => {
        const p = (this.prev?.nets || []).find((x) => x.iface === n.iface);
        const dts = dt / 1000;
        return {
          iface: n.iface,
          rxBps: p && dts > 0 ? Math.max(0, (n.rxBytes - p.rxBytes) / dts) : 0,
          txBps: p && dts > 0 ? Math.max(0, (n.txBytes - p.txBytes) / dts) : 0,
          rxDrop: n.rxDrop,
          txDrop: n.txDrop,
          rxErrs: n.rxErrs,
          txErrs: n.txErrs,
          dropDelta: p ? n.rxDrop + n.txDrop - (p.rxDrop + p.txDrop) : 0,
        };
      }),
      oomKillDelta: this.prev ? vmstat.oomKill - this.prev.vmstat.oomKill : 0,
      oomKillTotal: vmstat.oomKill,
      swapRate: this.prev && dt > 0 ? ((vmstat.pswpout - this.prev.vmstat.pswpout) / dt) * 1000 : 0,
      tcp: parseSockstat(readFile('/proc/net/sockstat')),
      listen: parseListenOverflows(readFile('/proc/net/netstat')),
      fds: parseFileNr(readFile('/proc/sys/fs/file-nr')),
      readOnly: [],       // попълва се долу — само реалните преходи rw → ro
      readOnlyAll: [],    // всички ro (без образите) — за информация в интерфейса
      conntrack: conntrackUsage(),
    };

    // Преход rw → ro е авария; дял, ro от самото начало, не е.
    const mountsText = readFile('/proc/mounts');
    const roNow = readOnlyMounts(mountsText);
    out.readOnlyAll = roNow;
    out.readOnly = roTransitions(this.writableSeen, roNow);
    const writableNow = writableMounts(mountsText);
    this.writableSeen = this.writableSeen || new Set();
    for (const m of writableNow) this.writableSeen.add(m);

    this.prev = { cpuModes, disks, nets, vmstat };
    this.prevTs = now;

    const dfi = await run('df', ['-iP'], { timeout: 8000 });
    out.inodes = dfi.ok ? parseDfInodes(dfi.stdout) : [];
    return out;
  }
}

function conntrackUsage() {
  const count = Number(readFile('/proc/sys/net/netfilter/nf_conntrack_count'));
  const max = Number(readFile('/proc/sys/net/netfilter/nf_conntrack_max'));
  if (!Number.isFinite(count) || !max) return null;
  return { count, max, usePercent: (count / max) * 100 };
}
