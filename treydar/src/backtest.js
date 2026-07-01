// backtest.js — ПРОФЕСИОНАЛЕН честен бектест. Без ключове (публични данни).
//   node src/backtest.js [SYMBOL] [TIMEFRAME]
// Дисциплина срещу илюзии:
//   • Сигнал на ЗАТВОРЕНА свещ i → изпълнение на ОТВАРЯНЕ на i+1 (no look-ahead).
//   • Такси (taker fee) + slippage на всяка сделка; ATR-базиран стоп.
//   • Walk-forward: няколко последователни out-of-sample фолда — устойчивост, не един прозорец.
//   • Buy & Hold бенчмарк — да видиш дали изобщо биеш простото държане.
//   • Robustness grid — колко чувствителен е резултатът към параметрите (overfitting детектор).
// ⚠ Красива крива тук НЕ значи печалба на живо. Минала доходност ≠ бъдеща. НЕ е инвестиционен съвет.
import ccxt from 'ccxt';
import { loadConfig } from './config.js';
import { prepare, signalAt, stopDistance } from './strategy.js';
import { summarize } from './metrics.js';

const SYMBOL = process.argv[2] || process.env.SYMBOL || 'BTC/USDT';
const TIMEFRAME = process.argv[3] || process.env.TIMEFRAME || '1h';
const TAKER_FEE = Number(process.env.TAKER_FEE || 0.001);   // 0.1% Binance spot taker
const SLIPPAGE = Number(process.env.SLIPPAGE || 0.0005);    // 0.05% предположение
const START = 10000;
const FOLDS = 4;

async function loadCandles() {
  const ex = new ccxt.binance({ enableRateLimit: true });
  let all = [];
  let since = ex.parse8601('2022-01-01T00:00:00Z');
  for (let page = 0; page < 30; page++) {
    const batch = await ex.fetchOHLCV(SYMBOL, TIMEFRAME, since, 1000);
    if (!batch.length) break;
    all = all.concat(batch);
    since = batch[batch.length - 1][0] + 1;
    if (batch.length < 1000) break;
  }
  return all.slice(0, -1); // хвърли последната (може да е незатворена)
}

// Симулира стратегията в прозореца [from, to) върху предварително подготвен ctx.
function simulate(ctx, from, to) {
  const { candles, closes } = ctx;
  const opens = candles.map((c) => c[1]);
  const lows = candles.map((c) => c[3]);
  let cash = START, qty = 0, entry = 0, stop = 0;
  const tradeReturns = [];
  const equityCurve = [];
  let barsInMarket = 0, totalBars = 0;

  for (let i = from; i < to - 1; i++) {
    const execPrice = opens[i + 1];
    if (execPrice == null) break;

    // 1) Стоп проверка през следващия бар (по неговото low).
    if (qty > 0 && lows[i + 1] <= stop) {
      const fill = stop * (1 - SLIPPAGE);
      cash += qty * fill * (1 - TAKER_FEE);
      tradeReturns.push((fill - entry) / entry);
      qty = 0;
    }

    const sig = signalAt(ctx, i);

    // 2) Изход по сигнал.
    if (qty > 0 && sig === 'exit') {
      const sell = execPrice * (1 - SLIPPAGE);
      cash += qty * sell * (1 - TAKER_FEE);
      tradeReturns.push((sell - entry) / entry);
      qty = 0;
    }
    // 3) Вход по сигнал.
    else if (qty === 0 && sig === 'long') {
      const buy = execPrice * (1 + SLIPPAGE);
      qty = (cash * (1 - TAKER_FEE)) / buy;
      entry = buy;
      stop = buy - stopDistance(ctx, i, buy);
      cash = 0;
    }

    totalBars++;
    if (qty > 0) barsInMarket++;
    equityCurve.push(cash + qty * closes[i + 1]);
  }
  // затвори остатъка по последен close
  const lastClose = closes[to - 1];
  if (qty > 0) { tradeReturns.push((lastClose - entry) / entry); cash += qty * lastClose; qty = 0; }
  const finalEquity = cash;

  return summarize({ finalEquity, startEquity: START, tradeReturns, equityCurve, barsInMarket, totalBars });
}

function buyHold(candles, from, to) {
  const a = candles[from][4], b = candles[to - 1][4];
  return (b / a - 1) * 100;
}

function row(label, m, bh) {
  const inf = (x) => (x === Infinity ? '∞' : x.toFixed(2));
  const beat = m.totalReturnPct > bh ? '✅' : '❌';
  console.log(
    `  ${label.padEnd(14)} ret ${m.totalReturnPct.toFixed(1).padStart(7)}%  B&H ${bh.toFixed(1).padStart(7)}% ${beat}` +
    `  DD ${m.maxDrawdownPct.toFixed(1)}%  Sharpe ${inf(m.sharpe)}  Sortino ${inf(m.sortino)}` +
    `  PF ${inf(m.profitFactor)}  win ${m.winRatePct.toFixed(0)}%  trades ${m.trades}  expo ${m.exposurePct.toFixed(0)}%`
  );
}

const cfg = loadConfig({ ...process.env, TRADING_LIVE: 'false', BINANCE_TESTNET: 'true' });
const candles = await loadCandles();
const warmup = Math.max(cfg.emaTrend, cfg.emaSlow, cfg.smaSlow, cfg.atrPeriod, cfg.rsiPeriod) + 2;
if (candles.length < warmup + 200) { console.error('Твърде малко данни.'); process.exit(1); }

const ctx = prepare(candles, cfg);
console.log(`Бектест ${SYMBOL} ${TIMEFRAME} · ${candles.length} свещи · стратегия="${cfg.strategy}" · такси ${TAKER_FEE * 100}% + slippage ${SLIPPAGE * 100}%`);
console.log(`Параметри: EMA ${cfg.emaFast}/${cfg.emaSlow}/тренд ${cfg.emaTrend} · RSI ${cfg.rsiPeriod}<${cfg.rsiOverbought} · ATR ${cfg.atrPeriod}×${cfg.atrMult}`);

// --- Walk-forward: последователни out-of-sample фолда ---
console.log(`\n=== Walk-forward (${FOLDS} последователни out-of-sample прозореца) ===`);
const usable = candles.length - warmup;
const foldSize = Math.floor(usable / FOLDS);
let sumRet = 0, beats = 0;
for (let f = 0; f < FOLDS; f++) {
  const from = warmup + f * foldSize;
  const to = f === FOLDS - 1 ? candles.length : from + foldSize;
  const m = simulate(ctx, from, to);
  const bh = buyHold(candles, from, to);
  row(`Фолд ${f + 1}`, m, bh);
  sumRet += m.totalReturnPct;
  if (m.totalReturnPct > bh) beats++;
}
console.log(`  → среден ret/фолд ${(sumRet / FOLDS).toFixed(1)}% · бие B&H в ${beats}/${FOLDS} фолда`);

// --- Целият период (за поглед) ---
console.log(`\n=== Цял период ===`);
const full = simulate(ctx, warmup, candles.length);
row('Всичко', full, buyHold(candles, warmup, candles.length));

// --- Robustness grid: чувствителност към параметрите (overfitting детектор) ---
console.log(`\n=== Robustness (варираме atrMult × emaFast — стабилен резултат = добър знак) ===`);
const rets = [];
for (const atrMult of [2, 2.5, 3]) {
  for (const emaFast of [8, 12, 20]) {
    const c2 = { ...cfg, atrMult, emaFast };
    if (c2.emaFast >= c2.emaSlow) continue;
    const ctx2 = prepare(candles, c2);
    const m = simulate(ctx2, warmup, candles.length);
    rets.push(m.totalReturnPct);
  }
}
rets.sort((a, b) => a - b);
if (rets.length) {
  const med = rets[Math.floor(rets.length / 2)];
  console.log(`  ${rets.length} комбинации · ret min ${rets[0].toFixed(1)}% · median ${med.toFixed(1)}% · max ${rets[rets.length - 1].toFixed(1)}%`);
  console.log(`  Голям разлив min→max = крехко/overfit. Тесен и положителен = устойчиво.`);
}

console.log('\n⚠ Не е инвестиционен съвет. Ако не биеш B&H устойчиво през фолдовете, стратегията не е готова за реални пари.');
console.log('   Задължително: testnet paper тест преди реален капитал. Минала доходност ≠ бъдеща.');
