// exchange.js — фабрика за ccxt Binance (SPOT). Пази testnet превключвателя на едно място.
import ccxt from 'ccxt';

export function makeExchange(cfg) {
  const ex = new ccxt.binance({
    apiKey: cfg.apiKey,
    secret: cfg.apiSecret,
    enableRateLimit: true,          // ccxt сам спазва rate limit-ите → без 429/бан
    options: { defaultType: 'spot' },
  });
  if (cfg.testnet) ex.setSandboxMode(true); // насочва към Binance Spot Testnet endpoint-ите
  return ex;
}

// Зарежда market metadata (precision, лимити) — нужно за коректно закръгляне.
export async function loadMarket(ex, symbol) {
  await ex.loadMarkets();
  const m = ex.market(symbol);
  if (!m) throw new Error(`Няма такъв пазар: ${symbol}`);
  return m;
}
