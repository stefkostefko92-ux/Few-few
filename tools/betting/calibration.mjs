#!/usr/bin/env node
// calibration.mjs — стойност, размер и ЧЕСТНО мерене на прецизността. Метриките са строго правилни,
// оценяват се само out-of-sample (walk-forward). CLV е истинският знак за едж, не win-rate.

// Смеси модел × пазар (market anchor): p = w·модел + (1−w)·пазар, ренормализирано за много изходи.
export function blend(pModel, pMarket, w = 0.4) {
  const mixed = pModel.map((pm, i) => w * pm + (1 - w) * pMarket[i]);
  const s = mixed.reduce((a, b) => a + b, 0);
  return mixed.map((x) => x / s);
}

// Очаквана стойност на залог: EV = p·коеф − 1 (десетичен коеф). >0 = положителна стойност.
export function ev(p, odds) { return p * odds - 1; }

// Пълен Kelly дял f* = (p·b − q)/b, b=коеф−1, q=1−p. Дробен = fraction·f*, таван cap. Никога <0.
export function kelly(p, odds, { fraction = 0.25, cap = 0.03 } = {}) {
  const b = odds - 1, q = 1 - p;
  const fStar = (p * b - q) / b;
  if (fStar <= 0) return 0; // без стойност → нула
  return Math.min(cap, fraction * fStar);
}

// Multiclass Brier: (1/N)Σ Σ_k (p_ik − y_ik)². По-ниско = по-добре. records: {p:[...], outcome:idx}.
export function brier(records) {
  let s = 0;
  for (const r of records) {
    for (let k = 0; k < r.p.length; k++) { const y = k === r.outcome ? 1 : 0; s += (r.p[k] - y) ** 2; }
  }
  return s / records.length;
}

// Log-loss (Ignorance): −(1/N)Σ log(p_actual). По-ниско = по-добре. Клампва за да няма log(0).
export function logLoss(records) {
  let s = 0;
  for (const r of records) { const p = Math.min(1 - 1e-15, Math.max(1e-15, r.p[r.outcome])); s += -Math.log(p); }
  return s / records.length;
}

// RPS (Ranked Probability Score) — ординален, чувствителен към дистанцията (Home-Draw-Away подредба).
// RPS = 1/(r−1) Σ_{i=1}^{r−1} (Σ_{j≤i}(p_j − o_j))². По-ниско = по-добре.
export function rps(records) {
  let total = 0;
  for (const rec of records) {
    const r = rec.p.length; let cumP = 0, cumO = 0, s = 0;
    for (let i = 0; i < r - 1; i++) { cumP += rec.p[i]; cumO += (i === rec.outcome ? 1 : 0); s += (cumP - cumO) ** 2; }
    total += s / (r - 1);
  }
  return total / records.length;
}

// CLV (Closing Line Value): би ли затварящия коеф. clv = betOdds/closingOdds − 1. >0 = победил closing.
export function clv(betOdds, closingOdds) { return betOdds / closingOdds - 1; }

// Средно CLV през залозите (истинският дългосрочен знак за едж).
export function avgClv(bets) {
  if (!bets.length) return 0;
  return bets.reduce((s, b) => s + clv(b.betOdds, b.closingOdds), 0) / bets.length;
}
