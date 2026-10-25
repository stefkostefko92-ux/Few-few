import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CHART,
  PERF_KEY,
  RedisPerfSource,
  parsePerf,
  perfChart,
  summarize,
} from '../src/admin/perf.js';

const row = (ts: number, extra: Record<string, unknown> = {}) =>
  JSON.stringify({
    ts,
    ticks: 3840,
    late: 10,
    maxMs: 30,
    avgMs: 15.7,
    players: 12,
    mode: 'All Weapons',
    budgetMs: 15.625,
    ...extra,
  });

test('здраве на тика: невалиден, повторен или невъзможен ред се пропуска, редът е по време', () => {
  const rows = parsePerf([
    row(3000),
    row(1000),
    row(1000),
    'не е json',
    row(2000, { late: 5000 }),
    row(4000, { players: 999 }),
    'x'.repeat(5000),
    row(2500, { mode: 7 }),
  ]);
  assert.deepEqual(
    rows.map((r) => r.ts),
    [1000, 3000],
  );
});

test('обобщение: дял закъснели в последната минута, най-лошото за прозореца', () => {
  assert.equal(summarize([]), null);
  const rows = parsePerf([row(2000, { late: 96, maxMs: 61.5 }), row(1000, { maxMs: 80 })]);
  const s = summarize(rows)!;
  assert.equal(s.last.ts, 2000);
  assert.equal(s.lateShare, 2.5);
  assert.equal(s.worstMs, 80);
  assert.equal(s.lateTotal, 106);
});

test('графиката: 24 ч назад от „сега“, прекъсва се при сън над 2 минути, линията на прага', () => {
  const now = 1_792_828_391_000;
  const rows = parsePerf([
    row(now - 25 * 3_600_000),
    row(now - 120_000),
    row(now - 60_000),
    row(now - 10 * 60_000),
  ]);
  const chart = perfChart(rows, now);
  assert.equal(chart.viewBox, `0 0 ${CHART.width} ${CHART.height}`);
  // Три реда в прозореца; между −10 мин и −2 мин е празно → ново „M“.
  assert.equal((chart.gap.match(/M/g) ?? []).length, 2);
  assert.equal((chart.gap.match(/L/g) ?? []).length, 1);
  // Последната точка (−1 мин) е почти в десния край.
  assert.match(chart.gap, /L719\.5 /);
  // Мащабът е поне 3 × нормата; прагът (1,5 ×) е по средата на височината.
  assert.equal(chart.scale.gapMs, 47);
  assert.equal(chart.lateLineY, 90);
  assert.equal(perfChart([], now).gap, '');
});

test('Redis: чете cs2dm:perf до 1440 реда; бавен или паднал Redis → null', async () => {
  let asked: unknown[] = [];
  const ok = new RedisPerfSource({
    lrange: (async (...args: unknown[]) => {
      asked = args;
      return [row(2000), row(1000)];
    }) as never,
  });
  assert.equal((await ok.read())?.length, 2);
  assert.deepEqual(asked, [PERF_KEY, 0, 1439]);
  const down = new RedisPerfSource({
    lrange: (async () => {
      throw new Error('ECONNREFUSED');
    }) as never,
  });
  assert.equal(await down.read(), null);
  const slow = new RedisPerfSource({ lrange: (() => new Promise(() => {})) as never }, 20);
  assert.equal(await slow.read(), null);
});
