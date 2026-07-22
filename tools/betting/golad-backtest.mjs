#!/usr/bin/env node
// golad-backtest.mjs — walk-forward калибрация: напасни на МИНАЛОТО → предскажи БЪДЕЩОТО → мери честно.
// Нула look-ahead: за всеки мач моделът вижда само по-ранни мачове. Това е доказателството за качество
// (не „уцелвания" на happy-path, а out-of-sample Brier/log-loss/RPS върху хронология).

import { fitDixonColes, predictLambdas } from "./golad-fit.mjs";
import { scoreMatrix, markets } from "./golad-model.mjs";
import { brier, logLoss, rps } from "./calibration.mjs";

// matches: [{home,away,hg,ag,date}] (сортират се по дата). Връща records + метрики out-of-sample.
export function walkForward(matches, { halfLifeDays = 180, minTrain = 60, refitEvery = 10, iters = 250 } = {}) {
  const sorted = [...matches].sort((a, b) => a.date.localeCompare(b.date));
  const records = [];
  let fit = null;
  for (let i = 0; i < sorted.length; i++) {
    if (i < minTrain) continue;
    const m = sorted[i];
    // Пренапасвай на всеки refitEvery мача (баланс точност↔скорост); напасва САМО на по-ранните.
    if (!fit || (i - minTrain) % refitEvery === 0) fit = fitDixonColes(sorted.slice(0, i), { halfLifeDays, asOf: m.date, iters });
    const lam = predictLambdas(fit, m.home, m.away);
    if (!lam) continue; // непознат отбор (промоция) → пропусни честно, не гадай
    const mk = markets(scoreMatrix(lam.lambdaHome, lam.lambdaAway, { rho: fit.rho }));
    const p = [mk["1"], mk.X, mk["2"]];
    const outcome = m.hg > m.ag ? 0 : m.hg === m.ag ? 1 : 2;
    records.push({ date: m.date, home: m.home, away: m.away, p, outcome });
  }
  return {
    records,
    metrics: records.length ? { n: records.length, brier: brier(records), logLoss: logLoss(records), rps: rps(records) } : { n: 0 },
  };
}

// Базова линия за сравнение: равномерна прогноза [1/3,1/3,1/3] (моделът ТРЯБВА да я бие).
export function uniformBaseline(records) {
  const u = records.map((r) => ({ p: [1 / 3, 1 / 3, 1 / 3], outcome: r.outcome }));
  return { brier: brier(u), logLoss: logLoss(u), rps: rps(u) };
}
