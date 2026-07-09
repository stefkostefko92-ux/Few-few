// portfolio-backtest.js — `npm run portfolio`. Демонстрира Dalio „Holy Grail“: комбинирането на
// НЕкорелирани стратегийни потоци сваля риска/просадката при ~същата доходност. Публични данни.
//   SYMBOLS="BTC/USDT,ETH/USDT,BNB/USDT,SOL/USDT" npm run portfolio
// Такси (fee) + slippage се прилагат на всяка сделка вътре в engine.js (виж simulate).
// ⚠ Не е инвестиционен съвет; диверсификацията сваля риска, не гарантира печалба.
import ccxt from 'ccxt';
import { loadConfig } from './config.js';
import { prepare } from './strategy.js';
import { simulate } from './engine.js';
import { maxDrawdown } from './metrics.js';
import { correlation, groupByCorrelation } from './portfolio.js';

const cfg = loadConfig({ ...process.env, TRADING_LIVE: 'false', BINANCE_TESTNET: 'true' });
const TIMEFRAME = process.env.TIMEFRAME || '1h';
const SYMBOLS = cfg.symbols.length ? cfg.symbols : ['BTC/USDT', 'ETH/USDT', 'BNB/USDT', 'SOL/USDT'];

async function load(symbol) {
  const ex = new ccxt.binance({ enableRateLimit: true });
  let all = [];
  let since = ex.parse8601('2023-01-01T00:00:00Z');
  for (let p = 0; p < 20; p++) {
    const b = await ex.fetchOHLCV(symbol, TIMEFRAME, since, 1000);
    if (!b.length) break;
    all = all.concat(b); since = b[b.length - 1][0] + 1;
    if (b.length < 1000) break;
  }
  return all.slice(0, -1);
}

function curveReturns(curve) {
  const r = [];
  for (let i = 1; i < curve.length; i++) r.push(curve[i] / curve[i - 1] - 1);
  return r;
}
function std(a) { const m = a.reduce((x, y) => x + y, 0) / a.length; return Math.sqrt(a.reduce((x, y) => x + (y - m) ** 2, 0) / a.length); }

console.log(`Портфейлен бектест · ${TIMEFRAME} · символи: ${SYMBOLS.join(', ')}`);
const per = {};
for (const s of SYMBOLS) {
  try {
    const candles = await load(s);
    const warmup = Math.max(cfg.emaTrend, cfg.emaSlow, cfg.atrPeriod, cfg.rsiPeriod) + 2;
    if (candles.length < warmup + 200) { console.log(`  ${s}: твърде малко данни, пропускам.`); continue; }
    const ctx = prepare(candles, cfg);
    const res = simulate(ctx, warmup, candles.length);
    per[s] = { ret: res.totalReturnPct, dd: res.maxDrawdownPct, curve: res.equityCurve, rets: curveReturns(res.equityCurve) };
    console.log(`  ${s.padEnd(10)} ret ${res.totalReturnPct.toFixed(1).padStart(7)}%  maxDD ${res.maxDrawdownPct.toFixed(1)}%  Sharpe ${res.sharpe.toFixed(2)}  trades ${res.trades}`);
  } catch (e) { console.log(`  ${s}: грешка (${e.message})`); }
}

const symbols = Object.keys(per);
if (symbols.length < 2) { console.log('\nНужни са ≥2 символа с данни за портфейлен анализ.'); process.exit(0); }

// Изравни дължините на return потоците (по общата опашка).
const minLen = Math.min(...symbols.map((s) => per[s].rets.length));
const retsBySym = {};
for (const s of symbols) retsBySym[s] = per[s].rets.slice(per[s].rets.length - minLen);

// Корелационна матрица на СТРАТЕГИЙНИТЕ потоци (не суровите цени).
console.log(`\n=== Корелация на стратегийните потоци ===`);
console.log('           ' + symbols.map((s) => s.split('/')[0].padStart(7)).join(''));
for (const a of symbols) {
  const row = symbols.map((b) => correlation(retsBySym[a], retsBySym[b]).toFixed(2).padStart(7)).join('');
  console.log(`  ${a.split('/')[0].padEnd(9)}${row}`);
}

// Групиране по корелация (кои са „едно и също“).
const groups = groupByCorrelation(symbols, retsBySym, cfg.corrThreshold);
const byGroup = {};
for (const s of symbols) (byGroup[groups[s]] ||= []).push(s.split('/')[0]);
console.log(`\nКорелирани групи (|corr| ≥ ${cfg.corrThreshold}): ` + Object.values(byGroup).map((g) => `{${g.join(',')}}`).join(' '));
console.log('  → в един портфейл трети́райте всяка група като ЕДИН залог (таван на риска на група).');

// Equal-weight комбиниран поток vs средно на индивидуалните.
const combined = [];
for (let i = 0; i < minLen; i++) combined.push(symbols.reduce((sum, s) => sum + retsBySym[s][i], 0) / symbols.length);
let eq = 1, peak = 1; const combCurve = [];
for (const r of combined) { eq *= 1 + r; peak = Math.max(peak, eq); combCurve.push(eq); }
const combDD = maxDrawdown(combCurve) * 100;
const combVol = std(combined);
const avgIndDD = symbols.reduce((s, k) => s + per[k].dd, 0) / symbols.length;
const avgIndVol = symbols.reduce((s, k) => s + std(retsBySym[k]), 0) / symbols.length;

console.log(`\n=== Диверсификационен ефект (equal-weight) ===`);
console.log(`  Средна волатилност на индивидуален поток: ${(avgIndVol * 100).toFixed(3)}%/бар`);
console.log(`  Волатилност на комбинирания поток:        ${(combVol * 100).toFixed(3)}%/бар  (${((1 - combVol / avgIndVol) * 100).toFixed(0)}% по-ниска)`);
console.log(`  Среден индивидуален max DD: ${avgIndDD.toFixed(1)}%  ·  Комбиниран max DD: ${combDD.toFixed(1)}%`);
console.log(`\n  Колкото по-НЕкорелирани са потоците, толкова по-голямо е свалянето на риска (Dalio „Holy Grail“).`);
console.log('⚠ Не е инвестиционен съвет. Валидирай walk-forward + testnet преди реален капитал.');
