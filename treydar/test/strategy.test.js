// test/strategy.test.js — стратегията дава разумни сигнали и НЕ гледа бъдеще.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { prepare, signalAt, stopDistance } from '../src/strategy.js';

const cfg = {
  strategy: 'trend', emaFast: 3, emaSlow: 6, emaTrend: 10,
  rsiPeriod: 5, rsiOverbought: 90, atrPeriod: 5, atrMult: 2, stopLossPct: 2,
};

// Строим свещи: дълъг възход → EMA cross нагоре над тренда.
function candlesFrom(closes) {
  return closes.map((c, i) => [i, c, c + 0.5, c - 0.5, c, 1]);
}

test('signalAt не хвърля и връща валиден сигнал', () => {
  const closes = Array.from({ length: 40 }, (_, i) => 100 + i); // стабилен възход
  const ctx = prepare(candlesFrom(closes), cfg);
  const s = signalAt(ctx, closes.length - 1);
  assert.ok(s === 'long' || s === 'exit' || s === null);
});

test('стоп разстоянието е положително (ATR-базирано)', () => {
  const closes = Array.from({ length: 40 }, (_, i) => 100 + Math.sin(i) * 3 + i);
  const ctx = prepare(candlesFrom(closes), cfg);
  const d = stopDistance(ctx, closes.length - 1, 120);
  assert.ok(d > 0);
});

test('no look-ahead: сигнал на i не зависи от свещи след i', () => {
  const base = Array.from({ length: 40 }, (_, i) => 100 + i);
  const ctxA = prepare(candlesFrom(base), cfg);
  const sA = signalAt(ctxA, 30);
  const tampered = base.slice();
  for (let j = 31; j < tampered.length; j++) tampered[j] = 1; // срутваме бъдещето
  const ctxB = prepare(candlesFrom(tampered), cfg);
  const sB = signalAt(ctxB, 30);
  assert.equal(sA, sB); // сигналът на индекс 30 трябва да е същият
});

test('sma режим работи', () => {
  const smaCfg = { ...cfg, strategy: 'sma', smaFast: 3, smaSlow: 6 };
  const closes = Array.from({ length: 20 }, (_, i) => 100 + i);
  const ctx = prepare(candlesFrom(closes), smaCfg);
  const s = signalAt(ctx, 19);
  assert.ok(s === 'long' || s === 'exit' || s === null);
});
