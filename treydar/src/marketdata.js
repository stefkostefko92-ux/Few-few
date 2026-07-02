// marketdata.js — пазарни данни и капитал. Работим само със ЗАТВОРЕНИ свещи (без последната,
// която още се формира) — иначе сигналът гледа "бъдеще" и всичко лъже.
export async function fetchClosedCandles(ex, symbol, timeframe, limit = 200) {
  const raw = await ex.fetchOHLCV(symbol, timeframe, undefined, limit);
  // Последната свещ обикновено е още незатворена → хвърляме я.
  const closed = raw.slice(0, -1);
  return {
    candles: closed,
    closes: closed.map((c) => c[4]),
    lastClose: closed.length ? closed[closed.length - 1][4] : null,
  };
}

export async function currentPrice(ex, symbol) {
  const t = await ex.fetchTicker(symbol);
  return t.last ?? t.close;
}

// Портфейлен капитал за мулти-символен режим: quote (обща за всички символи, валидирано в config)
// + стойността на всеки държан base по текущата му цена. prices: { [symbol]: price }.
export async function readPortfolioEquity(ex, symbols, prices) {
  const quote = symbols[0].split('/')[1];
  const bal = await ex.fetchBalance();
  let equity = (bal[quote]?.free ?? 0) + (bal[quote]?.used ?? 0);
  const baseTotals = {};
  for (const s of symbols) {
    const base = s.split('/')[0];
    const total = bal[base]?.total ?? 0;
    baseTotals[s] = total;
    equity += total * (prices[s] ?? 0);
  }
  return { equity, baseTotals };
}

// Капитал в quote валута (напр. USDT): свободен quote + стойност на държания base по текуща цена.
// Ботът е spot и само-long, така че base количеството е "позицията".
export async function readEquity(ex, symbol, price) {
  const [base, quote] = symbol.split('/');
  const bal = await ex.fetchBalance();
  const quoteFree = bal[quote]?.free ?? 0;
  const quoteUsed = bal[quote]?.used ?? 0;
  const baseTotal = bal[base]?.total ?? 0;
  const equity = quoteFree + quoteUsed + baseTotal * price;
  return { equity, quoteFree, baseTotal };
}
