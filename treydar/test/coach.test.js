// test/coach.test.js — тренерът маркира правилните грешки; журналът смята R коректно; Kelly е разумен.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyzeTrades } from '../src/coach.js';
import { fractionalKelly } from '../src/risk.js';
import { tradeRecord } from '../src/journal.js';

function trade(entry, exit, stop, exitReason = 'signal') {
  return tradeRecord({ symbol: 'BTC/USDT', entry, exit, qty: 1, stopPrice: stop, exitReason });
}

test('tradeRecord смята R-multiple коректно', () => {
  const t = trade(100, 130, 90); // риск 10, печалба 30 → +3R
  assert.equal(t.rMultiple, 3);
  assert.equal(t.win, true);
  const l = trade(100, 90, 90);  // удари стопа → −1R
  assert.equal(l.rMultiple, -1);
});

test('празен дневник → n=0', () => {
  const r = analyzeTrades([]);
  assert.equal(r.n, 0);
});

test('отрицателна expectancy се хваща', () => {
  // много малки печалби, редки големи загуби → win-rate висок, E[R] < 0
  const trades = [];
  for (let i = 0; i < 8; i++) trades.push(trade(100, 105, 90));  // +0.5R
  for (let i = 0; i < 4; i++) trades.push(trade(100, 90, 90));   // −1R
  const r = analyzeTrades(trades);
  assert.ok(r.stats.expectancyR < 0);
  assert.ok(r.mistakes.some((m) => m.code === 'negative-expectancy'));
});

test('лоша асиметрия (средна загуба > средна печалба) се маркира', () => {
  const trades = [];
  for (let i = 0; i < 6; i++) trades.push(trade(100, 105, 95));   // +1R
  for (let i = 0; i < 6; i++) trades.push(trade(100, 90, 95));    // −2R (загуба > печалба)
  const r = analyzeTrades(trades);
  assert.ok(r.mistakes.some((m) => m.code === 'bad-asymmetry'));
});

test('fractionalKelly: положителен едж → положителен, капнат риск%', () => {
  // W=0.5, avgWin=2R, avgLoss=-1R → payoff 2 → f*=0.5-0.5/2=0.25; ¼-Kelly=0.0625 → 6.25% → cap 2%
  const rp = fractionalKelly({ winRate: 0.5, avgWinR: 2, avgLossR: -1, fraction: 0.25, cap: 2, trades: 40 });
  assert.ok(rp > 0 && rp <= 2);
});

test('fractionalKelly: няма едж → 0', () => {
  const rp = fractionalKelly({ winRate: 0.3, avgWinR: 1, avgLossR: -1, trades: 40 }); // f*=0.3-0.7= -0.4
  assert.equal(rp, 0);
});

test('fractionalKelly: малка извадка → 0 (не оразмерявай на шум)', () => {
  const rp = fractionalKelly({ winRate: 0.6, avgWinR: 2, avgLossR: -1, trades: 5 });
  assert.equal(rp, 0);
});
