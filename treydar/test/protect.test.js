// protect.test.js — отказан стоп след изпълнена покупка не бива да губи позицията (Трейдъра + Изпитателя,
// 2026-09-24). Фалшива борса: истински ccxt.binance (закръгляне), подменени само мрежовите методи.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import ccxt from 'ccxt';

process.env.TREYDAR_DATA_DIR = mkdtempSync(join(tmpdir(), 'treydar-protect-'));
const { runOnce } = await import('../src/bot.js');
const { runOnceMulti } = await import('../src/multibot.js');

const SYMBOL = 'BTC/USDT';
const MARKET = { limits: { cost: { min: 10 }, amount: { min: 0.0001 } }, precision: { amount: 6, price: 2 } };

function cfg(over = {}) {
  return {
    apiKey: 'x', apiSecret: 'y', testnet: true, live: true, realMoney: false,
    symbol: SYMBOL, timeframe: '1h', strategy: 'sma', smaFast: 2, smaSlow: 3,
    emaFast: 1, emaSlow: 1, emaTrend: 1, rsiPeriod: 14, rsiOverbought: 75,
    atrPeriod: 14, atrMult: 2.5, useTrailing: false, adxPeriod: 14, adxMin: 0,
    maxTradesPerDay: 0, cooldownMinutes: 0,
    riskPctPerTrade: 1, stopLossPct: 2, takeProfitPct: 4,
    dailyLossLimitPct: 50, maxDrawdownPct: 50, maxPositionPct: 100,
    loopSeconds: 60, paperEquity: 10000,
    symbols: [], maxConcurrent: 3, maxPortfolioRiskPct: 100, maxGroupRiskPct: 100, corrThreshold: 0.9,
    ...over,
  };
}

// Възходящ скок на последната свещ → SMA кръстоска → сигнал за вход.
function exchange({ stopFails = true, filled = 0.05 } = {}) {
  const ex = new ccxt.binance({ apiKey: 'x', secret: 'y' });
  ex.market = () => MARKET;
  const t0 = Date.UTC(2026, 0, 1);
  const raw = Array.from({ length: 61 }, (_, i) => {
    const c = i >= 59 ? 110 : 100;
    return [t0 + i * 3600_000, c, c, c, c, 1];
  });
  ex.fetchOHLCV = async () => raw;
  ex.fetchTicker = async () => ({ last: 110 });
  ex.fetchBalance = async () => ({ USDT: { free: 10000, used: 0, total: 10000 }, BTC: { free: 0, used: 0, total: 0 } });
  ex.fetchOpenOrders = async () => [];
  ex.fetchClosedOrders = async () => [];
  ex.cancelOrder = async () => ({});
  ex.stops = 0;
  ex.createOrder = async (_s, type) => {
    if (/STOP/i.test(type)) {
      if (stopFails) throw new Error('-2010 insufficient balance (симулиран отказ)');
      ex.stops++;
      return { id: 'stop-1' };
    }
    return { id: 'buy-1', filled, average: 110, status: filled > 0 ? 'closed' : 'expired' };
  };
  return ex;
}

const fresh = () => ({ equityPeak: null, dayStartEquity: null, dayKey: null, killed: false, position: null, positions: {}, paperPnl: 0, dayTradeCount: 0, lastLossMs: null });

test('един символ: отказан стоп → позицията остава, отбелязана unprotected, kill-switch ВКЛ.', async () => {
  const s = await runOnce(exchange(), cfg(), MARKET, fresh());
  assert.ok(s.position, 'позицията не бива да изчезне');
  assert.equal(s.position.unprotected, true);
  assert.equal(s.killed, true, 'без нови входове, докато позицията е гола');
});

test('един символ: успешен стоп → позицията е защитена, без флаг', async () => {
  const ex = exchange({ stopFails: false });
  const s = await runOnce(ex, cfg(), MARKET, fresh());
  assert.ok(s.position);
  assert.equal(s.position.unprotected, undefined);
  assert.equal(s.killed, false);
  assert.equal(ex.stops, 1);
});

test('един символ: filled 0 (expired) → няма фантомна позиция и брояч', async () => {
  const s = await runOnce(exchange({ filled: 0 }), cfg(), MARKET, fresh());
  assert.equal(s.position, null);
  assert.equal(s.dayTradeCount, 0);
});

test('портфейл: отказан стоп → символът остава в state.positions (портфейлните лимити го виждат)', async () => {
  const s = fresh();
  await runOnceMulti(exchange(), cfg({ symbols: [SYMBOL] }), { [SYMBOL]: MARKET }, s);
  assert.ok(s.positions[SYMBOL], 'символът не бива да изчезне');
  assert.equal(s.positions[SYMBOL].unprotected, true);
  assert.equal(s.killed, true);
});
