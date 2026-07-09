// test/config.test.js — тройната спирачка и валидациите на конфига (сърцето на безопасността).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig, describeMode } from '../src/config.js';

test('по подразбиране: testnet + dry-run, НЕ реални пари', () => {
  const cfg = loadConfig({});
  assert.equal(cfg.testnet, true);
  assert.equal(cfg.live, false);
  assert.equal(cfg.realMoney, false);
  assert.match(describeMode(cfg), /DRY-RUN/);
});

test('TRADING_LIVE=true без ключове → отказ', () => {
  assert.throws(() => loadConfig({ TRADING_LIVE: 'true' }), /BINANCE_API_KEY/);
});

test('реални пари БЕЗ потвърждение → отказ (тройната спирачка)', () => {
  assert.throws(
    () => loadConfig({ BINANCE_TESTNET: 'false', TRADING_LIVE: 'true', BINANCE_API_KEY: 'k', BINANCE_API_SECRET: 's' }),
    /РАЗБИРАМ-РИСКА/
  );
});

test('реални пари С потвърждение → разрешено и ясно обозначено', () => {
  const cfg = loadConfig({
    BINANCE_TESTNET: 'false', TRADING_LIVE: 'true',
    BINANCE_API_KEY: 'k', BINANCE_API_SECRET: 's',
    I_UNDERSTAND_THE_RISK: 'РАЗБИРАМ-РИСКА',
  });
  assert.equal(cfg.realMoney, true);
  assert.match(describeMode(cfg), /РЕАЛНИ ПАРИ/);
});

test('TRADING_LIVE с каквото и да е освен "true" → dry-run', () => {
  for (const v of ['1', 'yes', 'TRUE', 'True', 'on']) {
    const cfg = loadConfig({ TRADING_LIVE: v });
    assert.equal(cfg.live, false, `"${v}" не трябва да е live`);
  }
});

test('невалидна SMA/EMA конфигурация → отказ', () => {
  assert.throws(() => loadConfig({ STRATEGY: 'sma', SMA_FAST: '50', SMA_SLOW: '20' }), /SMA_FAST/);
  assert.throws(() => loadConfig({ EMA_FAST: '26', EMA_SLOW: '12' }), /EMA_FAST/);
});

test('SYMBOLS: различни quote валути → отказ; еднакви → ок', () => {
  assert.throws(() => loadConfig({ SYMBOLS: 'BTC/USDT,ETH/EUR' }), /една quote валута/);
  assert.throws(() => loadConfig({ SYMBOLS: 'BTCUSDT' }), /невалиден символ/);
  const cfg = loadConfig({ SYMBOLS: 'BTC/USDT, ETH/USDT ,SOL/USDT' });
  assert.deepEqual(cfg.symbols, ['BTC/USDT', 'ETH/USDT', 'SOL/USDT']);
});

test('число извън граници → отказ; невалидно число → отказ', () => {
  assert.throws(() => loadConfig({ RISK_PCT_PER_TRADE: '50' }), /макс/);
  assert.throws(() => loadConfig({ ATR_MULT: 'abc' }), /не е число/);
});
