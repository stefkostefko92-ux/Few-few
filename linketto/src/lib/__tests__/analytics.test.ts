import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  conversionRate,
  ctr,
  fillDailySeries,
  seriesMax,
} from '../analytics';

test('fillDailySeries допълва липсващите дни с нули', () => {
  const now = new Date('2026-07-09T15:00:00Z');
  const series = fillDailySeries(
    [
      { day: '2026-07-09', views: 10, clicks: 4 },
      { day: '2026-07-07', views: 5, clicks: 1 },
    ],
    3,
    now,
  );
  assert.equal(series.length, 3);
  assert.deepEqual(
    series.map((p) => p.date),
    ['2026-07-07', '2026-07-08', '2026-07-09'],
  );
  assert.deepEqual(series[0], { date: '2026-07-07', views: 5, clicks: 1 });
  assert.deepEqual(series[1], { date: '2026-07-08', views: 0, clicks: 0 });
  assert.deepEqual(series[2], { date: '2026-07-09', views: 10, clicks: 4 });
});

test('fillDailySeries приема и Date обекти', () => {
  const now = new Date('2026-07-09T00:00:00Z');
  const series = fillDailySeries(
    [{ day: new Date('2026-07-09T09:30:00Z'), views: 2, clicks: 0 }],
    1,
    now,
  );
  assert.equal(series[0].views, 2);
});

test('ctr = кликове/посещения в проценти', () => {
  assert.equal(ctr(0, 0), 0);
  assert.equal(ctr(100, 25), 25);
  assert.equal(ctr(3, 1), 33);
});

test('seriesMax намира най-голямата стойност', () => {
  assert.equal(
    seriesMax([
      { date: 'a', views: 3, clicks: 7 },
      { date: 'b', views: 9, clicks: 2 },
    ]),
    9,
  );
  assert.equal(seriesMax([]), 0);
});

test('conversionRate с 1 знак след запетаята', () => {
  assert.equal(conversionRate(0, 0), 0);
  assert.equal(conversionRate(1000, 15), 1.5);
  assert.equal(conversionRate(200, 1), 0.5);
});
