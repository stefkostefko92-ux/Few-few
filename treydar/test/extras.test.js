// test/extras.test.js — ADX, честотни спирачки, Monte Carlo risk-of-ruin, precision floor.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import ccxt from 'ccxt';
import { adx } from '../src/indicators.js';
import { tradingAllowedByFrequency } from '../src/risk.js';
import { monteCarloRuin } from '../src/metrics.js';

// Поука от CCXT Manual (проверена на живо): amountToPrecision ползва борсовия rounding режим и МОЖЕ
// да закръгли НАГОРЕ. execute.js затова ползва decimalToPrecision с изричен TRUNCATE — доказваме,
// че реалната ccxt примитива при Binance (TICK_SIZE) реже строго надолу, никога нагоре.
test('ccxt: Binance е TICK_SIZE и decimalToPrecision(TRUNCATE) никога не закръгля нагоре', () => {
  const ex = new ccxt.binance();
  assert.equal(ex.precisionMode, ccxt.TICK_SIZE);
  assert.equal(ex.decimalToPrecision('0.12349999', ccxt.TRUNCATE, 0.0001, ex.precisionMode, ccxt.NO_PADDING), '0.1234');
  assert.equal(ex.decimalToPrecision('1.9999', ccxt.TRUNCATE, 0.001, ex.precisionMode, ccxt.NO_PADDING), '1.999');
  assert.equal(ex.decimalToPrecision('7', ccxt.TRUNCATE, 0.5, ex.precisionMode, ccxt.NO_PADDING), '7');
});

test('adx: висок при силен тренд, между 0 и 100', () => {
  const candles = Array.from({ length: 60 }, (_, i) => {
    const c = 100 + i * 2;                       // силен постоянен възход
    return [i, c - 1, c + 1, c - 1.5, c, 1];
  });
  const a = adx(candles, 14);
  const last = a[a.length - 1];
  assert.ok(last !== null && last >= 0 && last <= 100);
  assert.ok(last > 25); // силен тренд → висок ADX
});

test('честота: дневен лимит сделки блокира', () => {
  const r = tradingAllowedByFrequency({ state: { dayTradeCount: 3 }, maxTradesPerDay: 3, cooldownMinutes: 0, nowMs: 1000 });
  assert.equal(r.allowed, false);
});

test('честота: cooldown след загуба блокира, после пуска', () => {
  const state = { dayTradeCount: 0, lastLossMs: 1_000_000 };
  const blocked = tradingAllowedByFrequency({ state, maxTradesPerDay: 0, cooldownMinutes: 60, nowMs: 1_000_000 + 30 * 60000 });
  assert.equal(blocked.allowed, false);
  const ok = tradingAllowedByFrequency({ state, maxTradesPerDay: 0, cooldownMinutes: 60, nowMs: 1_000_000 + 61 * 60000 });
  assert.equal(ok.allowed, true);
});

test('честота: без ограничения → позволено', () => {
  const r = tradingAllowedByFrequency({ state: { dayTradeCount: 100 }, maxTradesPerDay: 0, cooldownMinutes: 0, nowMs: 1 });
  assert.equal(r.allowed, true);
});

test('monteCarloRuin: по-голям риск/сделка → по-голяма вероятност за разоряване', () => {
  const rMultiples = [];
  for (let i = 0; i < 20; i++) rMultiples.push(2);   // печеливши
  for (let i = 0; i < 20; i++) rMultiples.push(-1);  // губещи
  let seed = 42;
  const rng = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  const low = monteCarloRuin(rMultiples, { sims: 300, riskFraction: 0.01, ruinDrawdown: 0.5, rng });
  const high = monteCarloRuin(rMultiples, { sims: 300, riskFraction: 0.25, ruinDrawdown: 0.5, rng });
  assert.ok(high.ruinProbPct >= low.ruinProbPct);
  assert.ok(low.medianMaxDDPct >= 0 && low.medianMaxDDPct <= 100);
});

test('monteCarloRuin: празен вход → нули', () => {
  const r = monteCarloRuin([], {});
  assert.equal(r.ruinProbPct, 0);
});
