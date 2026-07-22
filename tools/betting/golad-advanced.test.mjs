// golad-advanced.test.mjs — портфейл/bankroll, разширени пазари, walk-forward калибрация.
import { test } from "node:test";
import assert from "node:assert/strict";
import { scoreMatrix, doubleChance, drawNoBet, asianHandicap } from "./golad-model.mjs";
import { allocate, drawdownGuard } from "./golad-portfolio.mjs";
import { walkForward, uniformBaseline } from "./golad-backtest.mjs";

const approx = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} ≈ ${b}`);

test("разширени пазари: double chance / DNB / AH сумират коректно", () => {
  const M = scoreMatrix(1.6, 1.05);
  const dc = doubleChance(M);
  approx(dc["1X"] + dc["12"] + dc.X2, 2, 1e-9); // всеки изход се брои в 2 от 3-те DC → сума=2
  const dnb = drawNoBet(M);
  approx(dnb.home + dnb.away, 1, 1e-9);
  const ah = asianHandicap(M, -0.5);
  approx(ah.win + ah.push + ah.loss, 1, 1e-9);
  approx(asianHandicap(M, -0.5).push, 0, 1e-9); // половин линия → нула push
  assert.ok(asianHandicap(M, 0).push > 0, "цяла линия (0) → push има");
  // четвърт линия = средно на две съседни
  const q = asianHandicap(M, -0.25);
  approx(q.win + q.push + q.loss, 1, 1e-9);
});

test("портфейл: тавани на залог/мач/общо се спазват; без стойност → 0", () => {
  const bets = [
    { id: "a", match: "M1", p: 0.60, odds: 2.0 }, // силна стойност
    { id: "b", match: "M1", p: 0.55, odds: 2.0 }, // корелиран (същия мач)
    { id: "c", match: "M2", p: 0.40, odds: 2.0 }, // без стойност (EV<0)
  ];
  const { rows, totalStake } = allocate(bets, { perBetCap: 0.02, perMatchCap: 0.03, totalCap: 0.10 });
  assert.ok(rows.every((r) => r.stake <= 0.02 + 1e-9), "таван на залог");
  const m1 = rows.filter((r) => r.match === "M1").reduce((s, r) => s + r.stake, 0);
  assert.ok(m1 <= 0.03 + 1e-9, "таван на мач (корелирана експозиция)");
  assert.equal(rows.find((r) => r.id === "c").stake, 0, "без стойност → нула");
  assert.ok(totalStake <= 0.10 + 1e-9, "общ таван");
});

test("drawdown kill-switch: под праг → намален/стоп", () => {
  assert.equal(drawdownGuard(100, 100).multiplier, 1);
  assert.equal(drawdownGuard(80, 100).multiplier, 0.5, "−20% → наполовина");
  assert.equal(drawdownGuard(65, 100).multiplier, 0, "−35% → kill-switch (стоп)");
});

test("walk-forward: моделът бие равномерната база out-of-sample (нула look-ahead)", () => {
  // синтетична хронология от известен процес → напаснатият модел трябва да е калибриран
  const ATT = { A: 1.5, B: 1.2, C: 1.0, D: 0.85, E: 0.7 }, DEF = { A: 0.75, B: 0.85, C: 1.0, D: 1.15, E: 1.3 };
  let s = 7; const rand = () => { s = (Math.imul(s, 1103515245) + 12345) & 0x7fffffff; return s / 0x7fffffff; };
  const ps = (l) => { const L = Math.exp(-l); let k = 0, p = 1; do { k++; p *= rand(); } while (p > L); return k - 1; };
  const teams = Object.keys(ATT), M = []; const base = Date.UTC(2025, 0, 1); let day = 0;
  for (let r = 0; r < 14; r++) for (const h of teams) for (const a of teams) {
    if (h === a) continue;
    M.push({ home: h, away: a, hg: ps(ATT[h] * DEF[a] * 1.3, rand), ag: ps(ATT[a] * DEF[h], rand), date: new Date(base + (day++) * 3 * 86400000).toISOString().slice(0, 10) });
  }
  const { metrics, records } = walkForward(M, { halfLifeDays: 400, minTrain: 80, refitEvery: 20, iters: 200 });
  assert.ok(records.length > 40, "достатъчно out-of-sample прогнози: " + records.length);
  const base0 = uniformBaseline(records);
  assert.ok(metrics.brier < base0.brier, `модел Brier ${metrics.brier.toFixed(3)} < равномерна ${base0.brier.toFixed(3)}`);
  assert.ok(metrics.rps < base0.rps, "модел RPS бие равномерната база");
});
