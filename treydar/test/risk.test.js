// test/risk.test.js — unit тестове за риск математиката (най-критичното). node --test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  positionSize, stopFromPct, takeProfitFromPct, checkRiskGates, updateEquityPeak,
} from '../src/risk.js';

test('positionSize: рискува точно riskPct от капитала при попадение на стопа', () => {
  // капитал 10000, риск 1% = $100 риск; вход 100, стоп 90 → загуба $10/единица → 10 единици
  const qty = positionSize({ equity: 10000, riskPct: 1, entry: 100, stopPrice: 90, maxPositionPct: 100 });
  assert.equal(qty, 10);
  assert.equal(qty * (100 - 90), 100); // рискът в пари = 1% от капитала
});

test('positionSize: капва до maxPositionPct', () => {
  // без таван qty би било голямо; таван 10% от 10000 = $1000 notional → 10 единици @100
  const qty = positionSize({ equity: 10000, riskPct: 50, entry: 100, stopPrice: 99, maxPositionPct: 10 });
  assert.equal(qty * 100 <= 1000 + 1e-9, true);
});

test('positionSize: хвърля при невалиден стоп (≥ вход)', () => {
  assert.throws(() => positionSize({ equity: 10000, riskPct: 1, entry: 100, stopPrice: 100, maxPositionPct: 100 }));
});

test('stopFromPct / takeProfitFromPct', () => {
  assert.equal(stopFromPct(100, 2), 98);
  assert.equal(takeProfitFromPct(100, 4), 104);
  assert.equal(takeProfitFromPct(100, 0), null);
});

test('checkRiskGates: max drawdown пали kill-switch', () => {
  const state = { equityPeak: 10000, dayStartEquity: 9000, killed: false };
  const r = checkRiskGates({ equity: 8000, state, dailyLossLimitPct: 50, maxDrawdownPct: 15 });
  assert.equal(r.allowed, false);
  assert.equal(r.kill, true); // 20% DD ≥ 15%
});

test('checkRiskGates: дневен лимит спира входа, но НЕ пали kill', () => {
  const state = { equityPeak: 10000, dayStartEquity: 10000, killed: false };
  const r = checkRiskGates({ equity: 9600, state, dailyLossLimitPct: 3, maxDrawdownPct: 50 });
  assert.equal(r.allowed, false);
  assert.equal(r.kill, false); // -4% ден ≤ -3%, но DD само 4% < 50%
});

test('checkRiskGates: пропуска при здрав капитал', () => {
  const state = { equityPeak: 10000, dayStartEquity: 10000, killed: false };
  const r = checkRiskGates({ equity: 10050, state, dailyLossLimitPct: 3, maxDrawdownPct: 15 });
  assert.equal(r.allowed, true);
});

test('checkRiskGates: вече убит остава убит', () => {
  const r = checkRiskGates({ equity: 10000, state: { killed: true }, dailyLossLimitPct: 3, maxDrawdownPct: 15 });
  assert.equal(r.allowed, false);
  assert.equal(r.kill, true);
});

test('updateEquityPeak качва само нагоре', () => {
  const s = { equityPeak: 100 };
  updateEquityPeak(s, 150); assert.equal(s.equityPeak, 150);
  updateEquityPeak(s, 120); assert.equal(s.equityPeak, 150);
});
