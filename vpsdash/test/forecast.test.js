// Тестове за прогнозата и аномалиите — чиста математика, без система.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  median, mad, robustZ, ewma, theilSen, mannKendall, forecastToLimit, detectAnomaly, changePoint, fmtDuration,
} from '../src/forecast.js';
import {
  parsePressure, parseCpuModes, cpuModePercents, parseDiskstats, diskRates,
  parseDfInodes, readOnlyMounts, parseVmstat, parseNetDevPerIface, parseSockstat,
  parseListenOverflows, parseFileNr, parseSchedStats,
} from '../src/kernel.js';

test('медиана и MAD', () => {
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([4, 1, 2, 3]), 2.5);
  assert.equal(median([]), null);
  assert.equal(mad([1, 1, 1, 1]), 0);
  assert.equal(mad([1, 2, 3, 4, 5]), 1);
});

test('robustZ: намира отскока, но не дели на нула', () => {
  const calm = [10, 10.2, 9.8, 10.1, 9.9, 10, 10.1];
  assert.ok(Math.abs(robustZ(10, calm)) < 1, 'нормална стойност → малък z');
  assert.ok(Math.abs(robustZ(40, calm)) > 3.5, 'отскокът трябва да е аномалия');
  // Константен ред: MAD=0 → null, а НЕ Infinity (fail-closed).
  assert.equal(robustZ(5, [1, 1, 1, 1]), null);
});

test('Theil–Sen е устойчив на изброс, за разлика от МНК', () => {
  // Прав ред y = 2x, но с един див изброс по средата.
  const pts = [];
  for (let i = 0; i < 20; i++) pts.push({ x: i, y: 2 * i });
  pts[10].y = 500; // временен архив
  const fit = theilSen(pts);
  assert.ok(Math.abs(fit.slope - 2) < 0.2, `наклонът трябва да остане ~2, беше ${fit.slope}`);
});

test('Mann–Kendall гейтва шума', () => {
  const rising = Array.from({ length: 30 }, (_, i) => i + (i % 3));
  assert.equal(mannKendall(rising).significant, true);
  // Редуващ се ред без посока
  const flat = Array.from({ length: 30 }, (_, i) => (i % 2 ? 10 : 10.1));
  assert.equal(mannKendall(flat).significant, false);
  assert.equal(mannKendall([1, 2, 3]).significant, false, 'малко точки → без присъда');
});

test('прогноза за пълнене на диск', () => {
  const t0 = 1_700_000_000_000;
  const hour = 3600000;
  // Пълни се с 1% на час, тръгва от 50%.
  const pts = Array.from({ length: 24 }, (_, i) => ({ x: t0 + i * hour, y: 50 + i }));
  const f = forecastToLimit(pts, 100);
  assert.equal(f.ok, true);
  // От 73% (последна точка) до 100% при 1%/час ≈ 27 часа.
  assert.ok(Math.abs(f.etaMs / hour - 27) < 2, `ETA беше ${f.etaMs / hour} часа`);
  assert.ok(f.slopePerDay > 20 && f.slopePerDay < 28);

  // Стабилен ред → без прогноза (мълчание вместо фалшива аларма).
  const flat = Array.from({ length: 24 }, (_, i) => ({ x: t0 + i * hour, y: 50 + (i % 2) * 0.1 }));
  assert.equal(forecastToLimit(flat, 100).ok, false);
  // Намаляващ ред → без прогноза.
  const falling = Array.from({ length: 24 }, (_, i) => ({ x: t0 + i * hour, y: 80 - i }));
  assert.equal(forecastToLimit(falling, 100).ok, false);
  // Малко данни → честно „не знам".
  assert.equal(forecastToLimit(pts.slice(0, 3), 100).ok, false);
});

test('аномалия иска съгласие на два детектора', () => {
  const calm = Array.from({ length: 40 }, () => 10 + Math.sin(Math.random()) * 0.1);
  assert.equal(detectAnomaly([...calm, 10.05]).anomaly, false, 'нормалното не бива да пали');
  const spike = detectAnomaly([...calm, 95]);
  assert.equal(spike.anomaly, true, 'явният отскок трябва да пали');
  assert.equal(spike.votes, 2);
});

test('CUSUM намира МОМЕНТА на промяната', () => {
  const t0 = 1_700_000_000_000;
  const pts = [];
  for (let i = 0; i < 60; i++) pts.push({ x: t0 + i * 60000, y: i < 40 ? 10 + (i % 2) * 0.2 : 25 });
  const cp = changePoint(pts);
  assert.ok(cp, 'трябва да намери промяна');
  assert.ok(cp.index >= 35 && cp.index <= 45, `моментът беше index ${cp.index}, очакван ~40`);
});

test('PSI парсване (и липсата му се разпознава)', () => {
  const p = parsePressure('some avg10=0.50 avg60=1.25 avg300=0.30 total=1234567\nfull avg10=0.00 avg60=0.10 avg300=0.05 total=42\n');
  assert.equal(p.some.avg60, 1.25);
  assert.equal(p.full.totalUs, 42);
  assert.equal(parsePressure(''), null);
  assert.equal(parsePressure(null), null);
});

test('CPU режими: steal се измерва (важен на VPS)', () => {
  const a = parseCpuModes('cpu  100 0 100 700 0 0 0 100\n');
  const b = parseCpuModes('cpu  200 0 200 1300 0 0 0 300\n');
  assert.equal(a.steal, 100);
  const pct = cpuModePercents(a, b);
  // delta: user 100, system 100, idle 600, steal 200 → total 1000
  assert.ok(Math.abs(pct.steal - 20) < 0.01, `steal беше ${pct.steal}`);
  assert.ok(Math.abs(pct.user - 10) < 0.01);
});

test('diskstats и производните му', () => {
  const txt = '254       0 vda 100 0 2000 500 50 0 800 250 0 400 750\n   7       0 loop0 1 0 1 1 1 0 1 1 0 1 1\n';
  const disks = parseDiskstats(txt);
  // loop0 се отсява; vda влиза само ако /sys/block/vda съществува на машината.
  assert.ok(!disks.some((d) => d.name === 'loop0'), 'loop устройствата се пропускат');

  const prev = [{ name: 'vda', reads: 100, readSectors: 2000, readMs: 500, writes: 50, writeSectors: 800, writeMs: 250, ioTicksMs: 400, inFlight: 0 }];
  const curr = [{ name: 'vda', reads: 200, readSectors: 4000, readMs: 1500, writes: 50, writeSectors: 800, writeMs: 250, ioTicksMs: 900, inFlight: 2 }];
  const [r] = diskRates(prev, curr, 1000);
  assert.equal(r.readIops, 100); // 100 четения за 1s
  assert.equal(r.readAwaitMs, 10); // 1000ms / 100 операции
  assert.equal(r.utilPct, 50); // 500ms заето от 1000ms
  assert.equal(r.writeAwaitMs, 0); // няма записи → нула, не NaN
});

test('inode-и и read-only монтиране', () => {
  const inodes = parseDfInodes('Filesystem Inodes IUsed IFree IUse% Mounted on\n/dev/vda1 1000 950 50 95% /\ntmpfs 100 0 100 0% /run\n');
  assert.equal(inodes.length, 1);
  assert.equal(inodes[0].usePercent, 95);
  const ro = readOnlyMounts('/dev/vda1 / ext4 ro,relatime 0 0\n/dev/vdb /data ext4 rw,relatime 0 0\n');
  assert.equal(ro.length, 1);
  assert.equal(ro[0].mount, '/');
});

test('vmstat, мрежа по интерфейс, TCP, fd, планировчик', () => {
  const vm = parseVmstat('oom_kill 3\npswpin 10\npswpout 20\npgmajfault 7\n');
  assert.equal(vm.oomKill, 3);
  const nets = parseNetDevPerIface('  eth0: 1000 10 1 2 0 0 0 0 2000 20 3 4 0 0 0 0\n    lo: 5 5 0 0 0 0 0 0 5 5 0 0 0 0 0 0\n');
  assert.equal(nets.length, 1);
  assert.equal(nets[0].rxDrop, 2);
  assert.equal(nets[0].txErrs, 3);
  const ss = parseSockstat('sockets: used 120\nTCP: inuse 22 orphan 1 tw 5 alloc 22 mem 0\n');
  assert.equal(ss.timeWait, 5);
  assert.equal(ss.socketsUsed, 120);
  const lo = parseListenOverflows('TcpExt: SyncookiesSent ListenOverflows ListenDrops\nTcpExt: 0 7 9\n');
  assert.equal(lo.listenOverflows, 7);
  const fd = parseFileNr('93 0 1644441\n');
  assert.equal(fd.allocated, 93);
  assert.ok(fd.usePercent < 1);
  const sched = parseSchedStats('cpu 1 2 3\nctxt 226118\nprocesses 500\nprocs_running 2\nprocs_blocked 1\n');
  assert.equal(sched.blocked, 1);
  assert.equal(sched.ctxt, 226118);
});

test('fmtDuration чете на български', () => {
  assert.match(fmtDuration(3 * 86400000), /дни/);
  assert.match(fmtDuration(5 * 3600000), /часа/);
  assert.match(fmtDuration(90000), /мин/);
});

test('ro монтиране: образите не са авария, преходът rw→ro е', async () => {
  const { readOnlyMounts, writableMounts, roTransitions } = await import('../src/kernel.js');
  const mounts = [
    '/dev/vda / ext4 rw,relatime 0 0',
    '/dev/vdb /opt/tools squashfs ro,relatime 0 0', // образ — НЕ е авария
    '/dev/vdc /opt/ro-data ext4 ro,relatime 0 0', // нарочно ro от старта
  ].join('\n');
  const ro = readOnlyMounts(mounts);
  assert.equal(ro.length, 1, 'squashfs образът се пропуска');
  assert.equal(ro[0].mount, '/opt/ro-data');
  assert.deepEqual(writableMounts(mounts), ['/']);

  // Без базова линия няма аларма (не знаем какво е било преди).
  assert.equal(roTransitions(null, ro).length, 0);
  // Дял, който никога не е бил записваем → мълчание.
  assert.equal(roTransitions(new Set(['/']), ro).length, 0);
  // Коренът пада в ro → ТОВА е аварията.
  const broken = readOnlyMounts('/dev/vda / ext4 ro,relatime 0 0');
  assert.equal(roTransitions(new Set(['/']), broken).length, 1);
});
