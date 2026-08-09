#!/usr/bin/env node
// Одит „числата не лъжат" — сверява панела с истината на операционната система.
//
// Защо отделен одит: това е мястото, където табло лъже НАЙ-ТИХО. Счупена секция
// се вижда веднага; грешно число изглежда точно като вярно число. Никой не се
// усъмнява в „42%", докато не се окаже, че знаменателят е бил друг.
//
// Две нива, нарочно:
//   1. срещу МАШИНАТА (`free`, `df`, /proc) — хваща грешна единица, грешен
//      знаменател, разминато закръгляне;
//   2. срещу СИНТЕТИЧЕН вход — хваща правила, които на тази машина не се
//      задействат (напр. двойното броене на docker0/veth: контейнерът, в който
//      се пуска гейтът, няма Docker, значи проверката би минала празна и щеше
//      да мълчи за реалния сървър, който има).
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { parseCpuStat, cpuPercent, parseMeminfo, parseNetDev, parseDf, MetricsCollector } from '../src/metrics.js';
import { compact } from '../src/history.js';
import { monthKey } from '../src/traffic.js';

const bad = [];
const ok = (cond, what, detail = '') => {
  console.log(`${cond ? '✔' : '✘'} ${what}${detail ? ' — ' + detail : ''}`);
  if (!cond) bad.push(`${what}${detail ? ': ' + detail : ''}`);
};

// ── 1. Памет срещу `free -b` ─────────────────────────────────────────────────
const mem = parseMeminfo(fs.readFileSync('/proc/meminfo', 'utf8'));
try {
  const f = execFileSync('free', ['-b']).toString().split('\n').find((l) => /^Mem:/.test(l)).trim().split(/\s+/);
  ok(Math.abs(mem.total - Number(f[1])) < 1024 * 1024, 'MemTotal съвпада с free', `${mem.total} ≈ ${f[1]}`);
  ok(Math.abs(mem.available - Number(f[6])) / mem.total < 0.02, 'MemAvailable съвпада с free', `${mem.available} ≈ ${f[6]}`);
} catch {
  console.log('  (free липсва — сравнението с машината се пропуска)');
}
ok(mem.used >= 0 && mem.used <= mem.total, 'заетата памет е в границите', `${((mem.used / mem.total) * 100).toFixed(1)}%`);

// Липсващ MemAvailable: НЕ бива да дава „100% заета" — това е критична аларма
// на здрава машина. Резервата е сметката отпреди ядро 3.14.
{
  const m = parseMeminfo('MemTotal:       4000000 kB\nMemFree:        3000000 kB\nBuffers: 100000 kB\nCached: 500000 kB\n');
  const pct = (m.used / m.total) * 100;
  ok(pct < 50, 'липсващ MemAvailable не дава фалшиви 100% заета памет', `${pct.toFixed(0)}%`);
  ok(m.availableEstimated === true, 'и се ПРИЗНАВА, че е оценка, не измерване');
}
// Съвсем празен /proc: отговорът е „не знам", не най-страшното число.
{
  const m = parseMeminfo('');
  ok(m.used === null && m.total === null, 'празен /proc/meminfo дава null, не нула', JSON.stringify(m.used));
}

// ── 2. Дискове срещу `df -kP` ────────────────────────────────────────────────
const dfOut = execFileSync('df', ['-kP']).toString();
const disks = parseDf(dfOut);
ok(disks.length > 0, 'поне един дял е разпознат', disks.map((d) => d.mount).join(', '));
for (const d of disks) {
  ok(d.usePercent >= 0 && d.usePercent <= 100, `процентът на ${d.mount} е в границите`, String(d.usePercent));
  // `Use%` на df е used/(used+avail) — БЕЗ запазените за root блокове. Сметката
  // used/total дава друго число и точно тук се бърка (на този контейнер: 22% срещу 3%).
  const calc = (d.usedBytes + d.availBytes) ? (d.usedBytes / (d.usedBytes + d.availBytes)) * 100 : 0;
  ok(Math.abs(calc - d.usePercent) <= 1, `процентът на ${d.mount} е used/(used+avail), както в df`,
    `df ${d.usePercent}% · сметнато ${calc.toFixed(1)}%`);
  ok(d.availBytes >= 0 && d.usedBytes >= 0, `байтовете на ${d.mount} не са отрицателни`);
}

// ── 3. CPU ───────────────────────────────────────────────────────────────────
const c1 = parseCpuStat(fs.readFileSync('/proc/stat', 'utf8'));
await new Promise((r) => setTimeout(r, 500));
const c2 = parseCpuStat(fs.readFileSync('/proc/stat', 'utf8'));
const pct = cpuPercent(c1, c2);
ok(pct !== null && pct >= 0 && pct <= 100, 'CPU процентът е в границите', String(pct?.toFixed(1)));
ok(cpuPercent(null, c2) === null, 'без предишна проба CPU е null, не 0');
ok(cpuPercent(c1, c1) === null, 'нулева делта е null, не 0');
// Върнат назад брояч (снапшот на ВМ, миграция) не бива да дава число.
ok(cpuPercent(c2, c1) === null, 'брояч, тръгнал назад, е null, не отрицателен процент');

// ── 4. Мрежа: синтетичен вход, за да не мълчи на машина без Docker ───────────
{
  const synthetic = [
    'Inter-|   Receive                    |  Transmit',
    ' face |bytes packets errs drop fifo frame compressed multicast|bytes packets errs drop fifo colls carrier compressed',
    '    lo: 1000 1 0 0 0 0 0 0 1000 1 0 0 0 0 0 0',
    '  eth0: 5000 5 0 0 0 0 0 0 7000 7 0 0 0 0 0 0',
    'docker0: 3000 3 0 0 0 0 0 0 4000 4 0 0 0 0 0 0',
    'veth9a1f2: 3000 3 0 0 0 0 0 0 4000 4 0 0 0 0 0 0',
    ' br-abc: 3000 3 0 0 0 0 0 0 4000 4 0 0 0 0 0 0',
  ].join('\n');
  const n = parseNetDev(synthetic);
  ok(n.rx === 5000 && n.tx === 7000, 'броят се САМО физическите интерфейси (нула двойно броене)',
    `rx=${n.rx} tx=${n.tx} · брои: ${n.ifaces.join(', ')}`);
  ok(!n.ifaces.some((i) => /^(docker|veth|br-|lo$)/.test(i)), 'нито един виртуален интерфейс не влиза в сбора',
    n.ifaces.join(', '));
}
{
  const real = parseNetDev(fs.readFileSync('/proc/net/dev', 'utf8'));
  ok(real.rx >= 0 && real.tx >= 0, 'броячите на живата машина не са отрицателни', `rx=${real.rx} tx=${real.tx}`);
}

// ── 5. Първата проба след рестарт ────────────────────────────────────────────
{
  const mc = new MetricsCollector();
  const first = await mc.sample();
  ok(first.cpuPct === null, 'първата проба казва „не знам" за CPU, а не 0%', JSON.stringify(first.cpuPct));
  ok(first.net.rxBps === null, 'първата проба казва „не знам" за мрежата, а не 0 B/s', JSON.stringify(first.net.rxBps));
  // И най-важното: това НЕЗНАНИЕ не бива да влезе в историята като нула —
  // оттам храни прогнозата, аномалиите и откриването на промяна в поведението.
  const point = compact(first);
  ok(point.cpu === null, 'незнанието влиза в историята като null, не като 0', JSON.stringify(point.cpu));
  ok(point.rxBps === null, 'същото за мрежата в историята', JSON.stringify(point.rxBps));
  const second = await mc.sample();
  ok(typeof second.cpuPct === 'number', 'втората проба вече дава число', String(second.cpuPct?.toFixed(1)));
}

// ── 6. Границите на месеца са в UTC (хостерът таксува така) ──────────────────
{
  ok(monthKey(Date.UTC(2026, 0, 1, 0, 0, 0)) === '2026-01', 'първата секунда на януари е в януари');
  ok(monthKey(Date.UTC(2025, 11, 31, 23, 59, 59)) === '2025-12', 'последната секунда на декември е в декември');
  // Мястото, където локална часова зона би преместила байтове в грешен месец.
  ok(monthKey(Date.UTC(2026, 1, 28, 23, 30, 0)) === '2026-02', 'краят на февруари не изтича в март');
  ok(monthKey(Date.UTC(2024, 1, 29, 12, 0, 0)) === '2024-02', '29 февруари във високосна година съществува');
}

console.log(bad.length ? `\n✘ ${bad.length} находки:\n  · ${bad.join('\n  · ')}` : '\n✔ Числата съвпадат с машината и не лъжат по границите.');
process.exit(bad.length ? 1 : 0);
