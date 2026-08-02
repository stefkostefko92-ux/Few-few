// SLO и бюджет за грешки върху пробите на продуктите.
//
// Канонът на Google SRE: аларма по СКОРОСТТА, с която гориш бюджета, не по
// „има ли грешка сега". Две прозорчета (дълго + късо) — дългото казва, че
// проблемът е сериозен, късото гаси алармата бързо след като спре.
//
// Таблица 5-8 от SRE Workbook:
//   страница: 14.4× за [1ч + 5мин]  (изгорени 2% от бюджета)
//   страница:    6× за [6ч + 30мин] (5%)
//   тикет:       1× за [3дни + 6ч]  (10%)
//
// Капан, който спазваме: при каданс 60s късият 5-минутен прозорец има само 5
// проби → една лоша = 20% грешки = burn 200×. Затова искаме и МИНИМАЛЕН БРОЙ
// лоши проби, иначе всяко мигване вдига страница.
import fs from 'node:fs';
import path from 'node:path';

const BUCKETS = [100, 200, 400, 800, 1600, 3200, Infinity];

export class SloStore {
  constructor(stateDir) {
    this.file = path.join(stateDir, 'slo.jsonl');
    this.current = new Map(); // "минута|име" → агрегат
  }

  // Записва проба в минутен агрегат — по един ред на продукт на минута
  // (43k реда за 30 дни на продукт, ~4 MB; всяка проба поотделно е излишна).
  record(name, { up, ms, latencyTargetMs = 800 }) {
    const minute = Math.floor(Date.now() / 60000) * 60000;
    const key = `${minute}|${name}`;
    let a = this.current.get(key);
    if (!a) {
      a = { ts: minute, name, total: 0, bad: 0, slow: 0, sumMs: 0, maxMs: 0, buckets: new Array(BUCKETS.length).fill(0) };
      this.current.set(key, a);
    }
    a.total++;
    if (!up) a.bad++;
    const dur = Number(ms) || 0;
    // „Бавно" е ОТДЕЛЕН SLI от „недостъпно" — не ги смесвай в един процент.
    if (up && dur > latencyTargetMs) a.slow++;
    a.sumMs += dur;
    a.maxMs = Math.max(a.maxMs, dur);
    a.buckets[BUCKETS.findIndex((b) => dur <= b)]++;
    this.flushOld(minute);
  }

  flushOld(currentMinute) {
    const done = [];
    for (const [key, a] of this.current) {
      if (a.ts < currentMinute) done.push(key);
    }
    if (!done.length) return;
    const lines = done.map((k) => JSON.stringify(this.current.get(k))).join('\n');
    try {
      fs.appendFileSync(this.file, lines + '\n', { mode: 0o600 });
    } catch {
      /* дискът не бива да чупи пробите */
    }
    for (const k of done) this.current.delete(k);
  }

  read(sinceMs = 0) {
    let raw = '';
    try {
      raw = fs.readFileSync(this.file, 'utf8');
    } catch {
      return [...this.current.values()].filter((a) => a.ts >= sinceMs);
    }
    const out = [];
    for (const line of raw.split('\n')) {
      if (!line) continue;
      try {
        const a = JSON.parse(line);
        if (a.ts >= sinceMs) out.push(a);
      } catch {
        /* повреден ред */
      }
    }
    // Текущата (недописана) минута също влиза — иначе последната минута липсва.
    for (const a of this.current.values()) if (a.ts >= sinceMs) out.push(a);
    return out;
  }

  // Компактиране: пази 35 дни (30-дневният прозорец + запас).
  compact(keepDays = 35) {
    const cutoff = Date.now() - keepDays * 86400000;
    try {
      const kept = this.read(cutoff);
      const tmp = `${this.file}.tmp`;
      fs.writeFileSync(tmp, kept.map((a) => JSON.stringify(a)).join('\n') + (kept.length ? '\n' : ''), { mode: 0o600 });
      fs.renameSync(tmp, this.file);
    } catch {
      /* best-effort */
    }
  }
}

// Сумира агрегатите за прозорец и продукт.
export function windowStats(rows, name, windowMs, now = Date.now()) {
  const since = now - windowMs;
  let total = 0;
  let bad = 0;
  let slow = 0;
  let sumMs = 0;
  const buckets = new Array(BUCKETS.length).fill(0);
  for (const a of rows) {
    if (a.name !== name || a.ts < since) continue;
    total += a.total;
    bad += a.bad;
    slow += a.slow || 0;
    sumMs += a.sumMs;
    for (let i = 0; i < buckets.length; i++) buckets[i] += (a.buckets || [])[i] || 0;
  }
  return {
    total,
    bad,
    slow,
    errorRate: total ? bad / total : 0,
    slowRate: total ? slow / total : 0,
    avgMs: total ? sumMs / total : null,
    p95Ms: approxPercentile(buckets, 0.95),
  };
}

// Приблизителен персентил от фиксирани кофи — точният иска всяка проба.
export function approxPercentile(buckets, q) {
  const total = buckets.reduce((a, b) => a + b, 0);
  if (!total) return null;
  const target = total * q;
  let acc = 0;
  for (let i = 0; i < buckets.length; i++) {
    acc += buckets[i];
    if (acc >= target) return BUCKETS[i] === Infinity ? BUCKETS[i - 1] : BUCKETS[i];
  }
  return null;
}

// Скорост на изгаряне: колко пъти по-бързо от допустимото харчим бюджета.
export function burnRate(errorRate, slo) {
  const budget = 1 - slo;
  if (budget <= 0) return 0;
  return errorRate / budget;
}

export const BURN_RULES = [
  { severity: 'critical', longMs: 3600_000, shortMs: 300_000, factor: 14.4, label: 'изгаряш 2% от бюджета за час' },
  { severity: 'critical', longMs: 6 * 3600_000, shortMs: 1800_000, factor: 6, label: 'изгаряш 5% от бюджета за 6 часа' },
  { severity: 'warning', longMs: 3 * 86400_000, shortMs: 6 * 3600_000, factor: 1, label: 'изгаряш 10% от бюджета за 3 дни' },
];

// Оценява правилата за един продукт. Пламва само когато И ДВАТА прозореца
// надхвърлят прага — късият гаси алармата ~5 мин след като проблемът спре.
// `metric` избира КОЙ SLI гори бюджета:
//   'bad'  — недостъпност (по подразбиране)
//   'slow' — латентност над целта
// Второто съществуваше като данни (slo.js записва `slow`), но никога не се
// оценяваше — тоест сайт, минал от 200 ms на 9 секунди и останал там, не будеше
// никого. А точно това е сигналът ПРЕДИ срива.
export function evaluateBurn(rows, name, slo, { now = Date.now(), minBadShort = 3, metric = 'bad' } = {}) {
  const out = [];
  const rate = (w) => (metric === 'slow' ? w.slowRate : w.errorRate);
  const count = (w) => (metric === 'slow' ? w.slow : w.bad);
  for (const rule of BURN_RULES) {
    const long = windowStats(rows, name, rule.longMs, now);
    const short = windowStats(rows, name, rule.shortMs, now);
    if (!long.total || !short.total) continue;
    const longBurn = burnRate(rate(long), slo);
    const shortBurn = burnRate(rate(short), slo);
    // Защитата от „една лоша проба = аларма": искаме МИНИМАЛЕН БРОЙ лоши проби в
    // късия прозорец, независимо колко проби има. (Условието беше „и малко проби
    // общо" — при 360 проби на прозорец това никога не се задействаше и една
    // мигнала проба вдигаше тикет. Цената е забавяне: при каданс 60s трябват 3
    // минути престой, преди да пламне — съзнателна размяна срещу шума.)
    if (count(short) < minBadShort) continue;
    if (longBurn >= rule.factor && shortBurn >= rule.factor) {
      out.push({
        severity: rule.severity,
        factor: rule.factor,
        label: rule.label,
        metric,
        longBurn: Math.round(longBurn * 10) / 10,
        shortBurn: Math.round(shortBurn * 10) / 10,
        longWindowMs: rule.longMs,
        badLong: count(long),
        totalLong: long.total,
      });
    }
  }
  // Само най-тежкото правило — иначе три аларми за един проблем.
  return out.sort((a, b) => b.factor - a.factor)[0] || null;
}

// Колко от 30-дневния бюджет е останал.
export function budgetRemaining(rows, name, slo, windowMs = 30 * 86400000, now = Date.now()) {
  const w = windowStats(rows, name, windowMs, now);
  if (!w.total) return { total: 0, remainingPct: 100, spentPct: 0 };
  const allowed = (1 - slo) * w.total;
  const spentPct = allowed > 0 ? Math.min(100, (w.bad / allowed) * 100) : 100;
  return {
    total: w.total,
    bad: w.bad,
    errorRate: w.errorRate,
    availabilityPct: (1 - w.errorRate) * 100,
    allowedBad: Math.floor(allowed),
    spentPct: Math.round(spentPct * 10) / 10,
    remainingPct: Math.round((100 - spentPct) * 10) / 10,
    p95Ms: w.p95Ms,
    slowRate: w.slowRate,
  };
}

export { BUCKETS };
