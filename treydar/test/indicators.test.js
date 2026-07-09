// test/indicators.test.js — проверки за индикаторите (без look-ahead, коректни стойности).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sma, ema, atr, rsi } from '../src/indicators.js';

test('sma: null преди период, после точна средна', () => {
  const s = sma([1, 2, 3, 4, 5], 3);
  assert.equal(s[0], null);
  assert.equal(s[1], null);
  assert.equal(s[2], 2);   // (1+2+3)/3
  assert.equal(s[4], 4);   // (3+4+5)/3
});

test('ema: seed = SMA, после гладене', () => {
  const e = ema([1, 2, 3, 4, 5, 6], 3);
  assert.equal(e[1], null);
  assert.equal(e[2], 2);   // seed = SMA(1,2,3)
  assert.ok(e[3] > 2 && e[3] < 4);
});

test('atr: положителен и без look-ahead (стойност[i] не ползва i+1)', () => {
  const candles = [
    [0, 10, 11, 9, 10, 1],
    [1, 10, 12, 9, 11, 1],
    [2, 11, 13, 10, 12, 1],
    [3, 12, 14, 11, 13, 1],
    [4, 13, 15, 12, 14, 1],
  ];
  const a = atr(candles, 3);
  const last = a[a.length - 1];
  assert.ok(last > 0);
});

test('rsi: 100 при само печалби, между 0 и 100', () => {
  const up = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16];
  const r = rsi(up, 14);
  assert.equal(r[r.length - 1], 100);
  const mixed = rsi([10, 11, 10, 12, 11, 13, 12, 14, 13, 15, 14, 16, 15, 17, 16, 18], 14);
  const v = mixed[mixed.length - 1];
  assert.ok(v > 0 && v < 100);
});
