// metrics.js — честни метрики за оценка на бектест. Чисти функции.
// tradeReturns: масив от доходности по сделка (напр. 0.03 = +3%). equityCurve: масив стойности на капитала.

export function maxDrawdown(equityCurve) {
  let peak = -Infinity, maxDD = 0;
  for (const e of equityCurve) {
    peak = Math.max(peak, e);
    if (peak > 0) maxDD = Math.max(maxDD, (peak - e) / peak);
  }
  return maxDD; // 0..1
}

// Sharpe от доходностите по сделка (груб, без risk-free; мащабиран със sqrt(n)).
export function sharpe(tradeReturns) {
  if (tradeReturns.length < 2) return 0;
  const m = mean(tradeReturns);
  const sd = std(tradeReturns, m);
  return sd > 0 ? (m / sd) * Math.sqrt(tradeReturns.length) : 0;
}

// Sortino — като Sharpe, но наказва само низходящата волатилност.
export function sortino(tradeReturns) {
  if (tradeReturns.length < 2) return 0;
  const m = mean(tradeReturns);
  const downside = tradeReturns.filter((r) => r < 0);
  if (!downside.length) return m > 0 ? Infinity : 0;
  const dd = Math.sqrt(downside.reduce((a, b) => a + b * b, 0) / downside.length);
  return dd > 0 ? (m / dd) * Math.sqrt(tradeReturns.length) : 0;
}

export function profitFactor(tradeReturns) {
  const gains = tradeReturns.filter((r) => r > 0).reduce((a, b) => a + b, 0);
  const losses = -tradeReturns.filter((r) => r < 0).reduce((a, b) => a + b, 0);
  if (losses === 0) return gains > 0 ? Infinity : 0;
  return gains / losses;
}

export function winRate(tradeReturns) {
  if (!tradeReturns.length) return 0;
  return tradeReturns.filter((r) => r > 0).length / tradeReturns.length;
}

// Expectancy: среден резултат на сделка (в R-подобни единици тук = средна доходност).
export function expectancy(tradeReturns) {
  return tradeReturns.length ? mean(tradeReturns) : 0;
}

// Calmar: годишна(груба) доходност / max drawdown. Тук ползваме тотална доходност / maxDD като прокси.
export function calmar(totalReturn, maxDD) {
  return maxDD > 0 ? totalReturn / maxDD : 0;
}

// Monte Carlo risk-of-ruin: bootstrap-преразбърква R-multiples на сделките и симулира equity пътища
// при ФИКСИРАН риск/сделка → оценява P(просадка ≥ ruinDrawdown) и разпределението на max drawdown.
// „Оцеляването е първо“: показва колко вероятно е да те изтрие ПОСЛЕДОВАТЕЛНОСТ от лоши сделки.
// rng се подава (по подразбиране Math.random) — за детерминистични тестове инжектирай свой.
export function monteCarloRuin(rMultiples, { sims = 1000, riskFraction = 0.01, ruinDrawdown = 0.5, pathLen, rng = Math.random } = {}) {
  if (!rMultiples.length) return { ruinProbPct: 0, medianMaxDDPct: 0, worstMaxDDPct: 0 };
  const len = pathLen || rMultiples.length;
  const dds = [];
  let ruined = 0;
  for (let s = 0; s < sims; s++) {
    let equity = 1, peak = 1, maxDD = 0;
    for (let k = 0; k < len; k++) {
      const r = rMultiples[Math.floor(rng() * rMultiples.length)];
      equity *= 1 + riskFraction * r;                 // печалба/загуба = риск × R
      if (equity <= 0) { maxDD = 1; break; }
      peak = Math.max(peak, equity);
      maxDD = Math.max(maxDD, (peak - equity) / peak);
    }
    dds.push(maxDD);
    if (maxDD >= ruinDrawdown) ruined++;
  }
  dds.sort((a, b) => a - b);
  return {
    ruinProbPct: (ruined / sims) * 100,
    medianMaxDDPct: dds[Math.floor(dds.length / 2)] * 100,
    worstMaxDDPct: dds[dds.length - 1] * 100,
  };
}

function mean(a) { return a.reduce((x, y) => x + y, 0) / a.length; }
function std(a, m) { return Math.sqrt(a.reduce((x, y) => x + (y - m) ** 2, 0) / a.length); }

export function summarize({ finalEquity, startEquity, tradeReturns, equityCurve, barsInMarket, totalBars }) {
  const totalReturn = finalEquity / startEquity - 1;
  const dd = maxDrawdown(equityCurve);
  return {
    totalReturnPct: totalReturn * 100,
    trades: tradeReturns.length,
    winRatePct: winRate(tradeReturns) * 100,
    profitFactor: profitFactor(tradeReturns),
    expectancyPct: expectancy(tradeReturns) * 100,
    sharpe: sharpe(tradeReturns),
    sortino: sortino(tradeReturns),
    maxDrawdownPct: dd * 100,
    calmar: calmar(totalReturn, dd),
    exposurePct: totalBars ? (barsInMarket / totalBars) * 100 : 0,
  };
}
