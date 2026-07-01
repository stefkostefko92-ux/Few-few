// backtest.js — ЧЕСТЕН бектест на пример-стратегията. Пуска се без API ключове (публични данни).
//   node src/backtest.js [SYMBOL] [TIMEFRAME]
// Дисциплина против илюзии:
//   • Сигнал на ЗАТВОРЕНА свещ i → изпълнение на ОТВАРЯНЕ на i+1 (no look-ahead).
//   • Такси (taker fee) + slippage на всяка сделка.
//   • Out-of-sample сплит: първите 70% (train) само за поглед, последните 30% (test) е честният резултат.
// ⚠ Красива крива тук НЕ значи печалба на живо. Минала доходност ≠ бъдеща. Не е инвестиционен съвет.
import ccxt from 'ccxt';
import { signalAt } from './strategy.js';

const SYMBOL = process.argv[2] || process.env.SYMBOL || 'BTC/USDT';
const TIMEFRAME = process.argv[3] || process.env.TIMEFRAME || '1h';
const FAST = Number(process.env.SMA_FAST || 20);
const SLOW = Number(process.env.SMA_SLOW || 50);
const STOP_PCT = Number(process.env.STOP_LOSS_PCT || 2);
const TAKER_FEE = 0.001;   // 0.1% typical Binance spot taker fee
const SLIPPAGE = 0.0005;   // 0.05% предположение за slippage/spread на market поръчка

async function loadCandles() {
  const ex = new ccxt.binance({ enableRateLimit: true });
  let all = [];
  let since = ex.parse8601('2023-01-01T00:00:00Z');
  for (let page = 0; page < 20; page++) {           // до ~20k свещи
    const batch = await ex.fetchOHLCV(SYMBOL, TIMEFRAME, since, 1000);
    if (!batch.length) break;
    all = all.concat(batch);
    since = batch[batch.length - 1][0] + 1;
    if (batch.length < 1000) break;
  }
  return all;
}

function simulate(candles, fromIdx, toIdx) {
  const closes = candles.map((c) => c[4]);
  const opens = candles.map((c) => c[1]);
  const lows = candles.map((c) => c[3]);
  let cash = 10000, qty = 0, entry = 0, stop = 0;
  let trades = 0, wins = 0;
  let peak = cash, maxDD = 0;
  const returns = [];

  for (let i = Math.max(fromIdx, SLOW + 1); i < toIdx - 1; i++) {
    const price = opens[i + 1];                     // изпълнение на отваряне на следващия бар (no look-ahead)
    const equityBefore = cash + qty * closes[i];

    // Стоп проверка вътре в позиция (по low на текущия бар).
    if (qty > 0 && lows[i] <= stop) {
      const fill = stop * (1 - SLIPPAGE);
      cash += qty * fill * (1 - TAKER_FEE);
      if (fill > entry) wins++;
      trades++; returns.push((fill - entry) / entry);
      qty = 0;
    }

    const sig = signalAt(closes, i, FAST, SLOW);
    if (qty === 0 && sig === 'long') {
      const buy = price * (1 + SLIPPAGE);
      qty = (cash * (1 - TAKER_FEE)) / buy;
      entry = buy; stop = buy * (1 - STOP_PCT / 100); cash = 0;
    } else if (qty > 0 && sig === 'exit') {
      const sell = price * (1 - SLIPPAGE);
      cash += qty * sell * (1 - TAKER_FEE);
      if (sell > entry) wins++;
      trades++; returns.push((sell - entry) / entry);
      qty = 0;
    }

    const equity = cash + qty * closes[i + 1];
    peak = Math.max(peak, equity);
    maxDD = Math.max(maxDD, (peak - equity) / peak);
    void equityBefore;
  }
  // затвори остатъчна позиция по последния close
  const lastClose = closes[toIdx - 1];
  const finalEquity = cash + qty * lastClose;

  const mean = returns.length ? returns.reduce((a, b) => a + b, 0) / returns.length : 0;
  const sd = returns.length ? Math.sqrt(returns.reduce((a, b) => a + (b - mean) ** 2, 0) / returns.length) : 0;
  const sharpe = sd > 0 ? (mean / sd) * Math.sqrt(returns.length || 1) : 0;

  return {
    finalEquity, totalReturnPct: (finalEquity / 10000 - 1) * 100,
    trades, winRatePct: trades ? (wins / trades) * 100 : 0,
    maxDrawdownPct: maxDD * 100, sharpe,
  };
}

function fmt(r, label) {
  console.log(`\n=== ${label} ===`);
  console.log(`  Крайна стойност:   $${r.finalEquity.toFixed(2)} (от $10000)`);
  console.log(`  Доходност:         ${r.totalReturnPct.toFixed(2)}%`);
  console.log(`  Сделки:            ${r.trades}  (win-rate ${r.winRatePct.toFixed(1)}%)`);
  console.log(`  Max drawdown:      ${r.maxDrawdownPct.toFixed(2)}%`);
  console.log(`  Sharpe (груб):     ${r.sharpe.toFixed(2)}`);
}

const candles = await loadCandles();
if (candles.length < SLOW + 20) { console.error('Твърде малко данни.'); process.exit(1); }
console.log(`Бектест ${SYMBOL} ${TIMEFRAME} · ${candles.length} свещи · SMA ${FAST}/${SLOW} · такси ${TAKER_FEE * 100}% + slippage ${SLIPPAGE * 100}%`);

const split = Math.floor(candles.length * 0.7);     // out-of-sample: train 70% / test 30%
fmt(simulate(candles, 0, split), 'TRAIN (in-sample, само за поглед — не вярвай сляпо)');
fmt(simulate(candles, split, candles.length), 'TEST (out-of-sample — ЧЕСТНИЯТ резултат)');
console.log('\n⚠ Не е инвестиционен съвет. Минала доходност ≠ бъдеща. Пусни на testnet преди реален капитал.');
