// indicators.js — технически индикатори като ЧИСТИ функции, без look-ahead.
// Всеки връща масив, подравнен към входа: стойност на индекс i ползва само данни до i (вкл.).
// Стойности преди достатъчно данни са null.

export function sma(values, period) {
  const out = new Array(values.length).fill(null);
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= period) sum -= values[i - period];
    if (i >= period - 1) out[i] = sum / period;
  }
  return out;
}

// Експоненциална пълзяща средна (seed = SMA на първите `period`).
export function ema(values, period) {
  const out = new Array(values.length).fill(null);
  const k = 2 / (period + 1);
  let prev = null;
  for (let i = 0; i < values.length; i++) {
    if (i === period - 1) {
      let s = 0;
      for (let j = 0; j < period; j++) s += values[j];
      prev = s / period;
      out[i] = prev;
    } else if (i >= period) {
      prev = values[i] * k + prev * (1 - k);
      out[i] = prev;
    }
  }
  return out;
}

// Wilder RMA (за ATR/RSI гладене).
export function rma(values, period) {
  const out = new Array(values.length).fill(null);
  let prev = null;
  for (let i = 0; i < values.length; i++) {
    if (values[i] == null) { continue; }
    if (prev == null) {
      // seed със средно на първите `period` не-null стойности
      const slice = values.slice(Math.max(0, i - period + 1), i + 1).filter((v) => v != null);
      if (slice.length >= period) { prev = slice.reduce((a, b) => a + b, 0) / period; out[i] = prev; }
    } else {
      prev = (prev * (period - 1) + values[i]) / period;
      out[i] = prev;
    }
  }
  return out;
}

// Average True Range. candles = [ts, open, high, low, close, volume].
export function atr(candles, period) {
  const tr = new Array(candles.length).fill(null);
  for (let i = 0; i < candles.length; i++) {
    const h = candles[i][2], l = candles[i][3];
    if (i === 0) { tr[i] = h - l; continue; }
    const pc = candles[i - 1][4];
    tr[i] = Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc));
  }
  return rma(tr, period);
}

// ADX (Wilder) — сила на тренда (0..100). Висок ADX = силен тренд; нисък = страничен пазар (chop).
// Връща масив със стойност на индекс i, ползвайки само данни до i (без look-ahead).
export function adx(candles, period) {
  const n = candles.length;
  const plusDM = new Array(n).fill(null);
  const minusDM = new Array(n).fill(null);
  const tr = new Array(n).fill(null);
  for (let i = 1; i < n; i++) {
    const h = candles[i][2], l = candles[i][3];
    const ph = candles[i - 1][2], pl = candles[i - 1][3], pc = candles[i - 1][4];
    const up = h - ph, down = pl - l;
    plusDM[i] = up > down && up > 0 ? up : 0;
    minusDM[i] = down > up && down > 0 ? down : 0;
    tr[i] = Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc));
  }
  const atrS = rma(tr, period);
  const plusS = rma(plusDM, period);
  const minusS = rma(minusDM, period);
  const dx = new Array(n).fill(null);
  for (let i = 0; i < n; i++) {
    if (atrS[i] == null || plusS[i] == null || minusS[i] == null || atrS[i] === 0) continue;
    const plusDI = 100 * plusS[i] / atrS[i];
    const minusDI = 100 * minusS[i] / atrS[i];
    const sum = plusDI + minusDI;
    dx[i] = sum === 0 ? 0 : 100 * Math.abs(plusDI - minusDI) / sum;
  }
  return rma(dx, period);
}

// RSI (Wilder). Връща масив 0..100.
export function rsi(closes, period) {
  const gains = new Array(closes.length).fill(null);
  const losses = new Array(closes.length).fill(null);
  for (let i = 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    gains[i] = Math.max(0, d);
    losses[i] = Math.max(0, -d);
  }
  const avgG = rma(gains, period);
  const avgL = rma(losses, period);
  const out = new Array(closes.length).fill(null);
  for (let i = 0; i < closes.length; i++) {
    if (avgG[i] == null || avgL[i] == null) continue;
    if (avgL[i] === 0) { out[i] = 100; continue; }
    const rs = avgG[i] / avgL[i];
    out[i] = 100 - 100 / (1 + rs);
  }
  return out;
}
