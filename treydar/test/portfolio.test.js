// test/portfolio.test.js — корелация, групиране и портфейлните лимити.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { correlation, groupByCorrelation, canOpenPosition, toReturns } from '../src/portfolio.js';

test('correlation: идентични редове → 1; противоположни → −1', () => {
  const a = [1, 2, 3, 4, 5];
  assert.ok(Math.abs(correlation(a, a) - 1) < 1e-9);
  assert.ok(Math.abs(correlation(a, [5, 4, 3, 2, 1]) + 1) < 1e-9);
});

test('groupByCorrelation: силно корелирани → една група', () => {
  const rets = {
    'BTC/USDT': [0.01, -0.02, 0.03, -0.01, 0.02],
    'ETH/USDT': [0.011, -0.019, 0.031, -0.009, 0.021], // ~BTC
    'XAU/USDT': [-0.01, 0.02, -0.03, 0.01, -0.02],     // обратно
  };
  const g = groupByCorrelation(['BTC/USDT', 'ETH/USDT', 'XAU/USDT'], rets, 0.7);
  assert.equal(g['BTC/USDT'], g['ETH/USDT']); // заедно
});

test('canOpenPosition: блокира при вече отворен символ', () => {
  const r = canOpenPosition({
    openPositions: [{ symbol: 'BTC/USDT', riskPct: 0.5 }], proposed: { symbol: 'BTC/USDT', riskPct: 0.5 },
    groups: { 'BTC/USDT': 0 }, maxConcurrent: 3, maxPortfolioRiskPct: 2, maxGroupRiskPct: 1,
  });
  assert.equal(r.allowed, false);
});

test('canOpenPosition: блокира при надвишен общ риск', () => {
  const r = canOpenPosition({
    openPositions: [{ symbol: 'A', riskPct: 1 }, { symbol: 'B', riskPct: 0.8 }],
    proposed: { symbol: 'C', riskPct: 0.5 }, groups: { A: 0, B: 1, C: 2 },
    maxConcurrent: 5, maxPortfolioRiskPct: 2, maxGroupRiskPct: 2,
  });
  assert.equal(r.allowed, false); // 1+0.8+0.5=2.3 > 2
});

test('canOpenPosition: блокира при надвишен риск в корелирана група', () => {
  const r = canOpenPosition({
    openPositions: [{ symbol: 'BTC/USDT', riskPct: 0.8 }],
    proposed: { symbol: 'ETH/USDT', riskPct: 0.5 },
    groups: { 'BTC/USDT': 0, 'ETH/USDT': 0 }, // същата група
    maxConcurrent: 5, maxPortfolioRiskPct: 5, maxGroupRiskPct: 1,
  });
  assert.equal(r.allowed, false); // 0.8+0.5=1.3 > 1 в групата
});

test('canOpenPosition: позволява разумна нова некорелирана позиция', () => {
  const r = canOpenPosition({
    openPositions: [{ symbol: 'BTC/USDT', riskPct: 0.5 }],
    proposed: { symbol: 'XAU/USDT', riskPct: 0.5 },
    groups: { 'BTC/USDT': 0, 'XAU/USDT': 1 }, maxConcurrent: 3, maxPortfolioRiskPct: 2, maxGroupRiskPct: 1,
  });
  assert.equal(r.allowed, true);
});

test('toReturns смята правилно', () => {
  const r = toReturns([100, 110, 99]);
  assert.ok(Math.abs(r[0] - 0.1) < 1e-9);
  assert.ok(Math.abs(r[1] + 0.1) < 1e-9);
});
