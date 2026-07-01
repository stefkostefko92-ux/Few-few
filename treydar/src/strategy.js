// strategy.js — стратегиите. ⚠ Дори „по-добрата“ тук НЕ е гаранция за печалба и НЕ е инвестиционен
// съвет — валидирай с walk-forward бектеста преди реални пари. Дисциплина: без look-ahead,
// сигнал на ЗАТВОРЕНА свещ i → изпълнение на i+1 (бектестът и ботът го спазват).
import { sma, ema, atr, rsi, adx } from './indicators.js';

// Предварително смята индикаторните масиви веднъж (ефективно + чисто), после signalAt чете по индекс.
export function prepare(candles, cfg) {
  const closes = candles.map((c) => c[4]);
  const ctx = { candles, closes, cfg, kind: cfg.strategy };
  if (cfg.strategy === 'sma') {
    ctx.fast = sma(closes, cfg.smaFast);
    ctx.slow = sma(closes, cfg.smaSlow);
  } else {
    // 'trend' (по подразбиране): EMA cross + тренд филтър + RSI + ATR стоп
    ctx.fast = ema(closes, cfg.emaFast);
    ctx.slow = ema(closes, cfg.emaSlow);
    ctx.trend = ema(closes, cfg.emaTrend);
    ctx.rsi = rsi(closes, cfg.rsiPeriod);
    ctx.adx = cfg.adxMin > 0 ? adx(candles, cfg.adxPeriod) : null;
  }
  ctx.atr = atr(candles, cfg.atrPeriod);
  return ctx;
}

// Сигнал за ЗАТВОРЕНАТА свещ на индекс i: 'long' | 'exit' | null.
export function signalAt(ctx, i) {
  if (i < 1) return null;
  const { cfg } = ctx;
  const fPrev = ctx.fast[i - 1], sPrev = ctx.slow[i - 1];
  const fNow = ctx.fast[i], sNow = ctx.slow[i];
  if (fPrev == null || sPrev == null || fNow == null || sNow == null) return null;

  const crossUp = fPrev <= sPrev && fNow > sNow;
  const crossDown = fPrev >= sPrev && fNow < sNow;

  if (ctx.kind === 'sma') {
    if (crossUp) return 'long';
    if (crossDown) return 'exit';
    return null;
  }

  // trend: влизай само ПО тренда и когато не е прегрят; излизай при cross надолу или пробив на тренда.
  const close = ctx.closes[i];
  const trend = ctx.trend[i];
  const r = ctx.rsi[i];
  if (trend == null) return null;

  const uptrend = close > trend;
  const notOverbought = r == null || r < cfg.rsiOverbought;
  // ADX режим-филтър: търгувай само в достатъчно силен тренд (пази от страничен chop).
  const trending = !ctx.adx || ctx.adx[i] == null || ctx.adx[i] >= cfg.adxMin;
  if (crossUp && uptrend && notOverbought && trending) return 'long';
  if (crossDown || close < trend) return 'exit';
  return null;
}

// Разстояние до стопа (в цена). При trend — ATR × множител (адаптивно към волатилността);
// при sma — фиксиран % (fallback). Никога 0 → минимум малка стойност.
export function stopDistance(ctx, i, entry) {
  const { cfg } = ctx;
  if (ctx.kind !== 'sma' && ctx.atr[i] != null) {
    const d = ctx.atr[i] * cfg.atrMult;
    if (d > 0) return d;
  }
  return entry * (cfg.stopLossPct / 100);
}
