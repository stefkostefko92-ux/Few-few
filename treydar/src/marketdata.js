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
