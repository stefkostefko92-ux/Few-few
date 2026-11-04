import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildChart, SEED_COLORS } from '../src/domain/chart.js';
import type { BatchLike } from '../src/domain/alerts.js';
import { HOUR_MS } from '../src/domain/decay.js';

const now = new Date('2026-11-04T10:00:00Z'); // 12:00 в София
const rate = { decayPercent: 0.6, decayMinutes: 60 };
const labels = {
  amnesia: 'Amnesia',
  ak: 'AK',
  ogkush: 'OG Kush',
  purple: 'Purple',
  skunk: 'Skunk',
};

function batch(id: number, seedTypeKey: string, percent: number, anchoredAt = now): BatchLike {
  return { id, seedTypeKey, count: 3, percent, anchoredAt, rate };
}

function build(batches: BatchLike[], thresholds: number[] = []) {
  return buildChart({ batches, labels, thresholds, now, timezone: 'Europe/Sofia' });
}

test('хоризонтът стига до последното изтичане, закръглен до ден, между 1 и 14 дни', () => {
  assert.equal(build([]).hours, 24);
  assert.equal(build([batch(1, 'ak', 3)]).hours, 24); // 5 ч
  assert.equal(build([batch(1, 'ak', 30)]).hours, 72); // 50 ч → 3 цели дни
  assert.equal(build([batch(1, 'ak', 100)]).hours, 7 * 24); // 166,7 ч
  const slow = { decayPercent: 0.1, decayMinutes: 60 }; // 1000 ч
  assert.equal(build([{ ...batch(1, 'ak', 100), rate: slow }]).hours, 14 * 24);
});

test('линията тръгва от текущия % сега; отвъд 14-дневния таван се реже на ръба', () => {
  const slow = { decayPercent: 0.1, decayMinutes: 60 }; // 30% → 300 ч, хоризонт 14 д = 336 ч
  const m = build([
    { ...batch(7, 'amnesia', 30), rate: slow },
    { ...batch(8, 'ak', 50), rate: slow },
  ]);
  assert.equal(m.hours, 14 * 24);
  const cut = m.series.find((x) => x.id === 8); // 500 ч > 336 ч
  assert.ok(cut);
  assert.equal(cut.x0, m.plot.x);
  assert.ok(Math.abs(cut.y0 - (m.plot.y + m.plot.h * 0.5)) < 1e-6);
  assert.ok(Math.abs(cut.x1 - (m.plot.x + m.plot.w)) < 1e-6);
  assert.ok(cut.y1 < m.plot.y + m.plot.h);
  assert.equal(cut.endsInside, false);
  const s = m.series.find((x) => x.id === 7);
  assert.ok(s);
  assert.equal(s.endsInside, true);
  assert.equal(s.color, SEED_COLORS.amnesia);
  assert.match(s.title, /#7/);
  assert.match(s.title, /Amnesia/);
  assert.match(s.title, /30,00%/);
});

test('изтичащата в хоризонта линия свършва на 0% в момента на изтичане', () => {
  const m = build([batch(1, 'ak', 100), batch(2, 'skunk', 12)]); // 2: изтича след 20 ч
  const s = m.series.find((x) => x.id === 2);
  assert.ok(s);
  assert.ok(Math.abs(s.y1 - (m.plot.y + m.plot.h)) < 1e-6);
  const expectedX = m.plot.x + (20 / m.hours) * m.plot.w;
  assert.ok(Math.abs(s.x1 - expectedX) < 1e-6);
});

test('изтеклите не се чертаят, броят им се връща', () => {
  const old = new Date(now.getTime() - 10 * HOUR_MS);
  const m = build([batch(1, 'ak', 3, old), batch(2, 'ak', 50)]);
  assert.deepEqual(
    m.series.map((s) => s.id),
    [2],
  );
  assert.equal(m.expired, 1);
});

test('праговете: уникални, подредени, с етикет и в графиката', () => {
  const m = build([batch(1, 'ak', 50)], [20, 10, 20, 0]);
  assert.deepEqual(
    m.thresholds.map((t) => t.label),
    ['≤ 20%', '≤ 10%', '≤ 0%'],
  );
  for (const t of m.thresholds) assert.ok(t.y >= m.plot.y && t.y <= m.plot.y + m.plot.h);
});

test('легендата: само видовете с партиди, по реда на видовете, с броя семки', () => {
  const m = build([batch(1, 'skunk', 50), batch(2, 'amnesia', 40), batch(3, 'amnesia', 30)]);
  assert.deepEqual(
    m.legend.map((l) => [l.key, l.count]),
    [
      ['amnesia', 6],
      ['skunk', 3],
    ],
  );
});

test('делениeта по времето: полунощ местно време, вътре в графиката', () => {
  const m = build([batch(1, 'ak', 100)]);
  assert.ok(m.xTicks.length >= 6);
  for (const t of m.xTicks) {
    assert.ok(t.x >= m.plot.x && t.x <= m.plot.x + m.plot.w);
    assert.match(t.label, /\d{2}\.\d{2}/);
  }
  // първата полунощ след 12:00 София на 04.11 е 05.11 00:00 = 04.11 22:00 UTC, след 12 ч
  const first = m.xTicks[0];
  assert.ok(first);
  const expected = m.plot.x + (12 / m.hours) * m.plot.w;
  assert.ok(Math.abs(first.x - expected) < 1e-6);
  assert.deepEqual(
    m.yTicks.map((t) => t.label),
    ['0%', '25%', '50%', '75%', '100%'],
  );
});

test('данните за посочването са без HTML', () => {
  const m = build([batch(1, 'amnesia', 50)]);
  const json = m.clientJson;
  assert.doesNotMatch(json, /</);
  const data = JSON.parse(json) as { series: Array<{ id: number }> };
  assert.equal(data.series[0]?.id, 1);
});

test('делението до самото „сега“ е без надпис (не се застъпва)', () => {
  const late = new Date('2026-11-04T21:00:00Z'); // 23:00 София — полунощ след 1 ч
  const m = buildChart({
    batches: [batch(1, 'ak', 100, late)],
    labels,
    thresholds: [],
    now: late,
    timezone: 'Europe/Sofia',
  });
  assert.equal(m.xTicks[0]?.label, '');
  assert.ok((m.xTicks[1]?.label ?? '').length > 0);
});
