#!/usr/bin/env node
// golad-model.mjs — прецизното ядро на Голаджията: Поасон × Диксън-Коулс → матрица на резултата → пазари.
// Zero-dep, чиста математика (проверимо, тествано). Не е бетинг съвет — смятащ инструмент.
//
// Ключово за прецизността: λ се тегли от xG (по-малко шум), коригира се спрямо силата на съперника,
// τ(Диксън-Коулс) поправя ниските резултати/равенства, които чистият Поасон подценява.

// Поасон pmf: P(k;λ) = e^-λ · λ^k / k!
export function poisson(k, lambda) {
  if (lambda <= 0) return k === 0 ? 1 : 0;
  let logp = -lambda + k * Math.log(lambda);
  for (let i = 2; i <= k; i++) logp -= Math.log(i);
  return Math.exp(logp);
}

// Корекция Диксън-Коулс τ(x,y) — само 4-те ниски клетки; ρ∈[−0.2,0] (елитни лиги ≈ −0.10…−0.15).
export function tau(x, y, lh, la, rho) {
  if (x === 0 && y === 0) return 1 - lh * la * rho;
  if (x === 0 && y === 1) return 1 + lh * rho;
  if (x === 1 && y === 0) return 1 + la * rho;
  if (x === 1 && y === 1) return 1 - rho;
  return 1;
}

// Матрица на резултата M[x][y], нормализирана към сума 1. maxGoals покрива опашката (8 стига >99.9%).
export function scoreMatrix(lambdaHome, lambdaAway, { rho = -0.12, maxGoals = 10 } = {}) {
  const M = [];
  let sum = 0;
  for (let x = 0; x <= maxGoals; x++) {
    M[x] = [];
    for (let y = 0; y <= maxGoals; y++) {
      const p = poisson(x, lambdaHome) * poisson(y, lambdaAway) * tau(x, y, lambdaHome, lambdaAway, rho);
      M[x][y] = Math.max(0, p); // τ може да даде леко отрицателно при екстремни ρ — клампни
      sum += M[x][y];
    }
  }
  for (let x = 0; x <= maxGoals; x++) for (let y = 0; y <= maxGoals; y++) M[x][y] /= sum;
  return M;
}

// Пазари от матрицата (сумиране на клетки). Всичко е вероятност ∈[0,1].
export function markets(M, { totalsLine = 2.5, handicap = 0 } = {}) {
  const n = M.length;
  let home = 0, draw = 0, away = 0, over = 0, under = 0, totalsPush = 0, bttsYes = 0, bttsNo = 0;
  let hPush = 0, hHome = 0, hAway = 0; // азиатски хендикап (цяло/половин) за домакина
  for (let x = 0; x < n; x++) for (let y = 0; y < n; y++) {
    const p = M[x][y];
    if (x > y) home += p; else if (x === y) draw += p; else away += p;
    // цяла линия (напр. 2.0): точната сума е PUSH, не „под". За .5 линии push=0.
    if (x + y > totalsLine) over += p; else if (x + y === totalsLine) totalsPush += p; else under += p;
    if (x >= 1 && y >= 1) bttsYes += p; else bttsNo += p;
    const adj = (x - y) + handicap; // азиатски хендикап за домакина
    if (adj > 0) hHome += p; else if (adj === 0) hPush += p; else hAway += p;
  }
  return {
    "1": home, X: draw, "2": away,
    over, under, totalsPush, totalsLine,
    bttsYes, bttsNo,
    handicap, hHome, hPush, hAway,
  };
}

// Топ N точни резултата.
export function topScores(M, n = 5) {
  const out = [];
  for (let x = 0; x < M.length; x++) for (let y = 0; y < M.length; y++) out.push({ score: `${x}:${y}`, p: M[x][y] });
  return out.sort((a, b) => b.p - a.p).slice(0, n);
}

// λ от рейтинги: сила_атака/защита нормализирани спрямо лигата (=1 средно) + домакинско предимство.
// Приемай ratings {attHome,defHome,attAway,defAway} и leagueAvgGoals; homeAdv≈1.35 типично.
export function lambdaFromRatings({ attHome, defHome, attAway, defAway, leagueAvgGoals = 1.35, homeAdv = 1.35 } = {}) {
  return {
    lambdaHome: attHome * defAway * leagueAvgGoals * homeAdv,
    lambdaAway: attAway * defHome * leagueAvgGoals,
  };
}

// Time-decay тегла: по-нов мач тежи повече. halfLifeDays → ξ = ln2/halfLife; w = exp(-ξ·Δdни).
export function timeDecayWeight(daysAgo, halfLifeDays = 120) {
  const xi = Math.log(2) / halfLifeDays;
  return Math.exp(-xi * Math.max(0, daysAgo));
}
