import { test } from 'node:test';
import assert from 'node:assert/strict';
import { expiresAt, HOUR_MS, msLeft, percentAt, rebase } from '../src/domain/decay.js';

const rate = { decayPercent: 0.6, decayMinutes: 60 };
const t0 = new Date('2026-11-03T10:00:00Z');
const at = (h: number) => new Date(t0.getTime() + h * HOUR_MS);

test('пада с 0,6% на час, линейно', () => {
  const b = { percent: 100, anchoredAt: t0 };
  assert.equal(percentAt(b, rate, t0), 100);
  assert.ok(Math.abs(percentAt(b, rate, at(1)) - 99.4) < 1e-9);
  assert.ok(Math.abs(percentAt(b, rate, at(0.5)) - 99.7) < 1e-9);
  assert.ok(Math.abs(percentAt(b, rate, at(100)) - 40) < 1e-9);
});

test('не пада под 0%', () => {
  const b = { percent: 3, anchoredAt: t0 };
  assert.equal(percentAt(b, rate, at(1000)), 0);
});

test('100% изтича за 166 ч 40 мин', () => {
  const b = { percent: 100, anchoredAt: t0 };
  const ms = expiresAt(b, rate).getTime() - t0.getTime();
  assert.equal(Math.round(ms / 60_000), 166 * 60 + 40);
});

test('оставащото време е 0 след изтичане', () => {
  const b = { percent: 0.6, anchoredAt: t0 };
  assert.equal(Math.round(msLeft(b, rate, t0) / 60_000), 60);
  assert.equal(msLeft(b, rate, at(2)), 0);
});

test('друга скорост: 1% на 30 мин', () => {
  const fast = { decayPercent: 1, decayMinutes: 30 };
  const b = { percent: 50, anchoredAt: t0 };
  assert.ok(Math.abs(percentAt(b, fast, at(1)) - 48) < 1e-9);
  assert.equal(expiresAt(b, fast).getTime() - t0.getTime(), 25 * HOUR_MS);
});

test('rebase пази текущия % и мести началото', () => {
  const b = { percent: 80, anchoredAt: t0 };
  const r = rebase(b, rate, at(10));
  assert.ok(Math.abs(r.percent - 74) < 1e-9);
  assert.equal(r.anchoredAt.getTime(), at(10).getTime());
});
