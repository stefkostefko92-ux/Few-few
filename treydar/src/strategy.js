// strategy.js — ПРИМЕРНА стратегия (SMA crossover). ⚠ Това е ПLACEHOLDER, НЕ печеливша система
// и НЕ инвестиционен съвет. Подмени я със своя логика СЛЕД честен бектест (src/backtest.js).
// Правило против look-ahead: работим само със ЗАТВОРЕНИ свещи; сигнал на бар N → изпълнение на N+1.

export function sma(values, period, endIndex) {
  if (endIndex + 1 < period) return null;
  let sum = 0;
  for (let i = endIndex - period + 1; i <= endIndex; i++) sum += values[i];
  return sum / period;
}

// Връща сигнал за ЗАТВОРЕНАТА свещ на индекс i: 'long' | 'exit' | null.
// long  = бърза SMA пресича НАГОРЕ бавната (вход)
// exit  = бърза SMA пресича НАДОЛУ бавната (изход)
export function signalAt(closes, i, fast, slow) {
  if (i < 1) return null;
  const fPrev = sma(closes, fast, i - 1);
  const sPrev = sma(closes, slow, i - 1);
  const fNow = sma(closes, fast, i);
  const sNow = sma(closes, slow, i);
  if (fPrev == null || sPrev == null || fNow == null || sNow == null) return null;
  if (fPrev <= sPrev && fNow > sNow) return 'long';
  if (fPrev >= sPrev && fNow < sNow) return 'exit';
  return null;
}
