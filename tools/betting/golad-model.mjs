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

// Валиден интервал на ρ, за да е τ ≥ 0 във всичките 4 ниски клетки (Dixon & Coles 1997):
// max(−1/λд, −1/λг) ≤ ρ ≤ min(1/(λд·λг), 1). Извън него τ става отрицателна и матрицата губи маргиналите.
export function rhoBounds(lambdaHome, lambdaAway) {
  return { min: Math.max(-1 / lambdaHome, -1 / lambdaAway), max: Math.min(1 / (lambdaHome * lambdaAway), 1) };
}

// Матрица на резултата M[x][y], нормализирана към сума 1. maxGoals=10 покрива опашката (при λ=3 осем гола
// дават едва 99.6%, десет — 99.97%). ρ се свива към границата на валидния интервал, а не се клампват клетки.
export function scoreMatrix(lambdaHome, lambdaAway, { rho = -0.12, maxGoals = 10 } = {}) {
  const b = rhoBounds(lambdaHome, lambdaAway);
  rho = Math.min(b.max, Math.max(b.min, rho));
  const M = [];
  let sum = 0;
  for (let x = 0; x <= maxGoals; x++) {
    M[x] = [];
    for (let y = 0; y <= maxGoals; y++) {
      const p = poisson(x, lambdaHome) * poisson(y, lambdaAway) * tau(x, y, lambdaHome, lambdaAway, rho);
      M[x][y] = Math.max(0, p); // само защита от плаваща грешка около нулата (τ вече е ≥ 0)
      sum += M[x][y];
    }
  }
  for (let x = 0; x <= maxGoals; x++) for (let y = 0; y <= maxGoals; y++) M[x][y] /= sum;
  return M;
}

// Пазари от матрицата (сумиране на клетки). Всичко е вероятност ∈[0,1].
// Четвърт тотал (2.25, 2.75…) се разделя на две съседни линии, половин залог всяка — както asianHandicap():
// 2.25 = ½·(над 2.0) + ½·(над 2.5). При точно 2 гола половината се връща (push), половината се губи.
export function markets(M, { totalsLine = 2.5, handicap = 0 } = {}) {
  if (Math.abs(totalsLine * 2 - Math.round(totalsLine * 2)) > 1e-9) {
    const a = markets(M, { totalsLine: totalsLine - 0.25, handicap }), b = markets(M, { totalsLine: totalsLine + 0.25, handicap });
    return {
      ...a, totalsLine,
      over: (a.over + b.over) / 2, under: (a.under + b.under) / 2, totalsPush: (a.totalsPush + b.totalsPush) / 2,
    };
  }
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

// Двоен шанс: 1X / 12 / X2.
export function doubleChance(M) {
  const m = markets(M);
  return { "1X": m["1"] + m.X, "12": m["1"] + m["2"], X2: m.X + m["2"] };
}

// Draw-no-bet (равен = връща залога): условна вероятност при не-равен.
export function drawNoBet(M) {
  const m = markets(M);
  const denom = m["1"] + m["2"];
  return { home: m["1"] / denom, away: m["2"] / denom };
}

// Азиатски хендикап за домакина. line: цяло/половин/четвърт (напр. −0.25, −0.75). Четвъртите се
// делят на две съседни линии (половин залог всяка). Връща {win, push, loss} дялове (за EV/сетълмент).
export function asianHandicap(M, line) {
  const q = Math.round(line * 4) / 4;
  if (Math.abs(q * 2 - Math.round(q * 2)) > 1e-9) { // четвърт линия → средно на две половини
    const a = asianHandicap(M, q - 0.25), b = asianHandicap(M, q + 0.25);
    return { line: q, win: (a.win + b.win) / 2, push: (a.push + b.push) / 2, loss: (a.loss + b.loss) / 2 };
  }
  let win = 0, push = 0, loss = 0;
  for (let x = 0; x < M.length; x++) for (let y = 0; y < M.length; y++) {
    const adj = (x - y) + q;
    if (adj > 1e-9) win += M[x][y]; else if (adj < -1e-9) loss += M[x][y]; else push += M[x][y];
  }
  return { line: q, win, push, loss };
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

// Единствена стойност за полуживота на скорошността. Хронологично на 2648 мача EPL log-loss е най-нисък при
// ~373 дни (ξ≈0.0019/ден, оригиналът на Dixon-Coles); 90д → 0.9784, 180д → 0.9675, 373д → 0.9661. Лига-зависимо —
// калибрирай walk-forward за друга лига, не го „настройвай на око".
export const DEFAULT_HALF_LIFE_DAYS = 365;

// Time-decay тегла: по-нов мач тежи повече. halfLifeDays → ξ = ln2/halfLife; w = exp(-ξ·Δdни).
export function timeDecayWeight(daysAgo, halfLifeDays = DEFAULT_HALF_LIFE_DAYS) {
  const xi = Math.log(2) / halfLifeDays;
  return Math.exp(-xi * Math.max(0, daysAgo));
}
