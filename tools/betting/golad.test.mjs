// golad.test.mjs — доказва математиката на прецизния слой (CI auto-discover).
import { test } from "node:test";
import assert from "node:assert/strict";
import { poisson, tau, scoreMatrix, markets, lambdaFromRatings, timeDecayWeight } from "./golad-model.mjs";
import { proportional, power, shin, overround, devig } from "./devig.mjs";
import { blend, ev, kelly, brier, logLoss, rps, clv, avgClv } from "./calibration.mjs";

const approx = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} ≈ ${b}`);
const sum = (a) => a.reduce((x, y) => x + y, 0);

test("poisson: pmf сумира към 1 и P(0;λ)=e^-λ", () => {
  approx(poisson(0, 1.4), Math.exp(-1.4));
  let s = 0; for (let k = 0; k <= 50; k++) s += poisson(k, 1.4); approx(s, 1, 1e-9);
});

test("tau: Диксън-Коулс 4-те клетки", () => {
  approx(tau(1, 1, 1.4, 1.1, -0.12), 1.12);
  approx(tau(0, 0, 1.4, 1.1, -0.12), 1 - 1.4 * 1.1 * -0.12);
  assert.equal(tau(2, 3, 1.4, 1.1, -0.12), 1); // извън ниските клетки → 1
});

test("scoreMatrix: нормализирана; пазарите сумират коректно", () => {
  const M = scoreMatrix(1.6, 1.1);
  approx(sum(M.flat()), 1, 1e-9);
  const m = markets(M, { totalsLine: 2.5 });
  approx(m["1"] + m.X + m["2"], 1, 1e-9);
  approx(m.over + m.under, 1, 1e-9);
  approx(m.bttsYes + m.bttsNo, 1, 1e-9);
  approx(m.hHome + m.hPush + m.hAway, 1, 1e-9);
  assert.ok(m["1"] > m["2"], "по-силният домакин (по-голяма λ) печели по-често");
});

test("lambdaFromRatings + timeDecay", () => {
  const { lambdaHome, lambdaAway } = lambdaFromRatings({ attHome: 1.2, defHome: 0.9, attAway: 1.0, defAway: 1.1, leagueAvgGoals: 1.35, homeAdv: 1.3 });
  approx(lambdaHome, 1.2 * 1.1 * 1.35 * 1.3);
  approx(lambdaAway, 1.0 * 0.9 * 1.35);
  assert.ok(timeDecayWeight(0) === 1 && timeDecayWeight(120, 120) < 0.51 && timeDecayWeight(120, 120) > 0.49);
});

test("devig: трите метода сумират към 1; power маха overround", () => {
  const odds = [2.10, 3.40, 3.60];
  approx(sum(proportional(odds)), 1, 1e-9);
  approx(sum(power(odds)), 1, 1e-9);
  approx(sum(shin(odds)), 1, 1e-9);
  assert.ok(overround(odds) > 0, "буки има марж");
  // power дава по-малка вероятност на аутсайдера от proportional (FL-bias корекция)
  const pr = proportional(odds), pw = power(odds);
  assert.ok(pw[2] < pr[2], "power сваля повече от аутсайдера");
  assert.deepEqual(devig(odds), power(odds)); // default метод = power
});

test("EV + Kelly: формули + предпазители", () => {
  approx(ev(0.55, 2.0), 0.55 * 2.0 - 1);
  // p=0.55, odds=2.0 → f*=(0.55·1−0.45)/1=0.10; дробен ¼ → 0.025, под cap 0.03
  approx(kelly(0.55, 2.0, { fraction: 0.25, cap: 0.03 }), 0.025, 1e-9);
  assert.equal(kelly(0.40, 2.0), 0, "без стойност (EV<0) → нула залог");
  assert.equal(kelly(0.99, 2.0, { fraction: 1, cap: 0.03 }), 0.03, "таванът важи");
});

test("blend: market anchor, ренормализирано", () => {
  const b = blend([0.5, 0.3, 0.2], [0.4, 0.35, 0.25], 0.5);
  approx(sum(b), 1, 1e-9);
  assert.ok(b[0] > 0.4 && b[0] < 0.5, "между модел и пазар");
});

test("метрики: перфектна прогноза → 0; строго правилни", () => {
  const perfect = [{ p: [1, 0, 0], outcome: 0 }];
  approx(brier(perfect), 0);
  approx(rps(perfect), 0);
  assert.ok(logLoss(perfect) < 1e-6);
  // по-лоша прогноза → по-висок Brier
  const bad = [{ p: [0.2, 0.3, 0.5], outcome: 0 }];
  assert.ok(brier(bad) > brier(perfect));
  // RPS наказва по-малко „близка" грешка (Draw) от „далечна" (Away) при истина Home
  const near = rps([{ p: [0, 1, 0], outcome: 0 }]);
  const far = rps([{ p: [0, 0, 1], outcome: 0 }]);
  assert.ok(far > near, "далечна грешка (Away) се наказва повече от близка (Draw)");
});

test("CLV: победен closing = положителен", () => {
  approx(clv(2.10, 2.00), 2.10 / 2.00 - 1);
  assert.ok(avgClv([{ betOdds: 2.1, closingOdds: 2.0 }, { betOdds: 1.9, closingOdds: 2.0 }]) > -1);
});
