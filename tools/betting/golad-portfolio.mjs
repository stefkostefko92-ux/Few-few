#!/usr/bin/env node
// golad-portfolio.mjs — bankroll-управление на портфейл от залози (не единичен Kelly).
// Светкласовата разлика: не „колко на този залог", а „колко общо, при корелирана експозиция, с
// drawdown-предпазител". Симултанен дробен Kelly + тавани (на залог / на мач / общо) + kill-switch.

import { kelly, ev } from "./calibration.mjs";

// bets: [{id, match, p, odds}]. Връща разпределение (дял от банка) с приложени тавани + причини.
export function allocate(bets, { fraction = 0.25, perBetCap = 0.02, perMatchCap = 0.04, totalCap = 0.10, evThreshold = 0.02 } = {}) {
  // 1) суров дробен Kelly на всеки залог със стойност над прага.
  let rows = bets.map((b) => {
    const e = ev(b.p, b.odds);
    const raw = e > evThreshold ? kelly(b.p, b.odds, { fraction, cap: 1 }) : 0;
    return { ...b, ev: e, raw, stake: Math.min(raw, perBetCap), caps: raw > perBetCap ? ["per-bet"] : [] };
  });
  // 2) таван на корелирана експозиция: сумата по мач ≤ perMatchCap (залозите на един мач са корелирани).
  const byMatch = {};
  for (const r of rows) (byMatch[r.match] ??= []).push(r);
  for (const group of Object.values(byMatch)) {
    const sum = group.reduce((s, r) => s + r.stake, 0);
    if (sum > perMatchCap) { const scale = perMatchCap / sum; group.forEach((r) => { r.stake *= scale; r.caps.push("per-match"); }); }
  }
  // 3) общ таван на експозицията за деня/кръга ≤ totalCap.
  const total = rows.reduce((s, r) => s + r.stake, 0);
  if (total > totalCap) { const scale = totalCap / total; rows.forEach((r) => { r.stake *= scale; r.caps.push("total"); }); }
  return {
    rows: rows.map((r) => ({ ...r, stake: +r.stake.toFixed(4) })),
    totalStake: +rows.reduce((s, r) => s + r.stake, 0).toFixed(4),
    active: rows.filter((r) => r.stake > 0).length,
  };
}

// Drawdown kill-switch: под праг от пика → спри/намали. Връща множител на залозите (0 = стоп).
export function drawdownGuard(bankroll, peak, { softDrawdown = 0.15, hardDrawdown = 0.30 } = {}) {
  if (peak <= 0) return { multiplier: 1, level: "ok" };
  const dd = 1 - bankroll / peak;
  if (dd >= hardDrawdown) return { multiplier: 0, level: "kill-switch", drawdown: dd }; // спри — човек преразглежда
  if (dd >= softDrawdown) return { multiplier: 0.5, level: "намален", drawdown: dd }; // наполовина
  return { multiplier: 1, level: "ok", drawdown: dd };
}
