// engine.js — чист симулационен двигател (без странични ефекти), споделен от backtest.js и
// portfolio-backtest.js. Дисциплина: сигнал на затворена свещ i → изпълнение на отваряне на i+1;
// такси+slippage на всяка сделка; ATR стоп. Връща метрики + R-multiples + equity крива.
import { signalAt, stopDistance } from './strategy.js';
import { summarize } from './metrics.js';

export function simulate(ctx, from, to, { fee = 0.001, slippage = 0.0005, start = 10000 } = {}) {
  const { candles, closes } = ctx;
  const opens = candles.map((c) => c[1]);
  const lows = candles.map((c) => c[3]);
  let cash = start, qty = 0, entry = 0, stop = 0, riskFrac = 0;
  const tradeReturns = [];
  const rMultiples = [];
  const equityCurve = [];
  let barsInMarket = 0, totalBars = 0;
  const pushTrade = (exitPrice) => {
    const ret = (exitPrice - entry) / entry;
    tradeReturns.push(ret);
    rMultiples.push(riskFrac > 0 ? ret / riskFrac : 0);
  };

  for (let i = from; i < to - 1; i++) {
    const execPrice = opens[i + 1];
    if (execPrice == null) break;

    if (qty > 0 && lows[i + 1] <= stop) {          // стоп през бар i+1 (по low)
      const fill = stop * (1 - slippage);
      cash += qty * fill * (1 - fee);
      pushTrade(fill);
      qty = 0;
    }

    const sig = signalAt(ctx, i);

    if (qty > 0 && sig === 'exit') {                // изход по сигнал
      const sell = execPrice * (1 - slippage);
      cash += qty * sell * (1 - fee);
      pushTrade(sell);
      qty = 0;
    } else if (qty === 0 && sig === 'long') {       // вход по сигнал
      const buy = execPrice * (1 + slippage);
      qty = (cash * (1 - fee)) / buy;
      entry = buy;
      stop = buy - stopDistance(ctx, i, buy);
      riskFrac = (buy - stop) / buy;
      cash = 0;
    }

    totalBars++;
    if (qty > 0) barsInMarket++;
    equityCurve.push(cash + qty * closes[i + 1]);
  }
  const lastClose = closes[to - 1];
  if (qty > 0) { pushTrade(lastClose); cash += qty * lastClose; qty = 0; }
  const finalEquity = cash;

  return {
    ...summarize({ finalEquity, startEquity: start, tradeReturns, equityCurve, barsInMarket, totalBars }),
    rMultiples, equityCurve,
  };
}
