// Постоянна история на метриките — JSONL на диск, за да преживее рестарт.
// Пази 7 дни при стъпка 30s (~20k реда/ден). Пренаписва файла при прекомерен
// растеж вместо да трие ред по ред (евтино и просто).
import fs from 'node:fs';
import path from 'node:path';

const STEP_MS = 30_000;
const KEEP_MS = 7 * 24 * 3600 * 1000;

export class MetricsHistory {
  constructor(stateDir) {
    this.file = path.join(stateDir, 'metrics.jsonl');
    this.lastWrite = 0;
    this.sinceCompact = 0;
  }

  // Записва точка не по-често от STEP_MS (пази стъпката постоянна).
  maybeAppend(snap) {
    const now = Date.now();
    if (now - this.lastWrite < STEP_MS) return false;
    this.lastWrite = now;
    const p = compact(snap);
    try {
      fs.appendFileSync(this.file, JSON.stringify(p) + '\n', { mode: 0o600 });
      if (++this.sinceCompact >= 2000) {
        this.sinceCompact = 0;
        this.compact();
      }
    } catch {
      return false;
    }
    return true;
  }

  // Изхвърля точките по-стари от KEEP_MS (атомарно: tmp + rename).
  compact() {
    try {
      const cutoff = Date.now() - KEEP_MS;
      const kept = this.read().filter((p) => p.ts >= cutoff);
      const tmp = `${this.file}.tmp`;
      fs.writeFileSync(tmp, kept.map((p) => JSON.stringify(p)).join('\n') + (kept.length ? '\n' : ''), {
        mode: 0o600,
      });
      fs.renameSync(tmp, this.file);
    } catch {
      /* компактирането е best-effort */
    }
  }

  read(sinceMs = 0) {
    let raw = '';
    try {
      raw = fs.readFileSync(this.file, 'utf8');
    } catch {
      return [];
    }
    const out = [];
    for (const line of raw.split('\n')) {
      if (!line) continue;
      try {
        const p = JSON.parse(line);
        if (p.ts >= sinceMs) out.push(p);
      } catch {
        /* повреден ред — прескачаме */
      }
    }
    return out;
  }

  // Точки за даден прозорец, прередени до най-много `max` (за графиките).
  range(rangeMs, max = 720) {
    const points = this.read(Date.now() - rangeMs);
    if (points.length <= max) return points;
    const stride = Math.ceil(points.length / max);
    return points.filter((_, i) => i % stride === 0);
  }
}

// ЕДИН източник на истината за формата на точката (по-рано беше дублиран и в
// metrics.js). `v` е версия на схемата — старите редове нямат новите полета и
// четците трябва да го знаят, вместо да четат undefined като нула.
export function compact(snap) {
  return {
    v: 2,
    ts: snap.ts,
    cpu: Math.round(snap.cpuPct * 10) / 10,
    memUsed: snap.mem.used,
    memTotal: snap.mem.total,
    memAvail: snap.mem.available,
    swapUsed: snap.mem.swapUsed,
    load1: Math.round(snap.load[0] * 100) / 100,
    rxBps: Math.round(snap.net.rxBps),
    txBps: Math.round(snap.net.txBps),
    diskMax: Math.max(0, ...(snap.disks || []).map((d) => d.usePercent)),
    // Per-дял: прогнозата за пълнене иска НЕПРЕКЪСНАТ ред за всеки дял. Максимумът
    // през всички дялове скача, когато се смени кой е максимумът → фалшив тренд.
    disks: (snap.disks || []).map((d) => [d.mount, d.usePercent, d.availBytes]),
    // Симптомите (ако ядрото ги подава) — за анализ по-късно.
    psi: snap.kernel?.pressure?.available
      ? {
          cpu: snap.kernel.pressure.cpu?.some?.avg60 ?? null,
          io: snap.kernel.pressure.io?.some?.avg60 ?? null,
          mem: snap.kernel.pressure.memory?.some?.avg60 ?? null,
        }
      : null,
    steal: snap.kernel?.cpuModes ? Math.round(snap.kernel.cpuModes.steal * 10) / 10 : null,
  };
}

// Реда за конкретен дял през историята — вход за прогнозата.
export function diskSeries(points, mount) {
  const out = [];
  for (const p of points) {
    if (Array.isArray(p.disks)) {
      const hit = p.disks.find((d) => d[0] === mount);
      if (hit) out.push({ x: p.ts, y: hit[1], avail: hit[2] });
    }
  }
  return out;
}

// Кои дялове изобщо се срещат в историята.
export function knownMounts(points) {
  const set = new Set();
  for (const p of points) for (const d of p.disks || []) set.add(d[0]);
  return [...set];
}

export const RANGES = {
  '1h': 3600 * 1000,
  '6h': 6 * 3600 * 1000,
  '24h': 24 * 3600 * 1000,
  '7d': 7 * 24 * 3600 * 1000,
};
