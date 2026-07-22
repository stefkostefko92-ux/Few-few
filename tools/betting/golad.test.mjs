// golad.test.mjs — доказва математиката на прецизния слой (CI auto-discover).
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";
import { poisson, tau, scoreMatrix, markets, lambdaFromRatings, timeDecayWeight } from "./golad-model.mjs";

const CLI = join(dirname(fileURLToPath(import.meta.url)), "golad.mjs");
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

// --- Робустност (дупки, посочени от Кодаджията) ---
test("devig: екстремни фаворит/аутсайдер пазари → валидни вероятности ∈(0,1), Σ=1", () => {
  for (const odds of [[1.001, 999, 999], [15, 15, 1.05], [1.2, 6.5, 15]]) {
    for (const p of [proportional(odds), power(odds), shin(odds)]) {
      approx(sum(p), 1, 1e-6);
      assert.ok(p.every((x) => x > 0 && x < 1), `всички ∈(0,1) за ${odds}`);
    }
  }
});

test("Dixon-Coles клампване: екстремен ρ=−0.2 + голямо λ → матрицата остава валидна (Σ=1, ≥0)", () => {
  const M = scoreMatrix(8, 8, { rho: -0.2 });
  approx(sum(M.flat()), 1, 1e-9);
  assert.ok(M.flat().every((p) => p >= 0 && Number.isFinite(p)), "нула отрицателни/NaN клетки");
});

test("totals: цяла линия → точната сума е PUSH (over+under+push=1), не под", () => {
  const M = scoreMatrix(1.6, 1.05);
  const m = markets(M, { totalsLine: 2 });
  approx(m.over + m.under + m.totalsPush, 1, 1e-9);
  assert.ok(m.totalsPush > 0, "при цяла линия push > 0");
  const half = markets(M, { totalsLine: 2.5 });
  approx(half.totalsPush, 0, 1e-12); // .5 линия → нула push
});

test("CLI golad.mjs: невалиден вход не дава тих NaN (exit≠0 при NaN/непълни λ)", () => {
  const run = (obj) => { try { execFileSync("node", [CLI], { input: JSON.stringify(obj), encoding: "utf8" }); return 0; } catch (e) { return e.status || 1; } };
  assert.notEqual(run({ ratings: { attHome: 1.2 } }), 0, "частичен ratings → NaN λ → грешка, не тих NaN");
  assert.notEqual(run({ lambdaHome: -1, lambdaAway: 1 }), 0, "≤0 λ → грешка");
  assert.notEqual(run({ lambdaHome: "x", lambdaAway: 1 }), 0, "нечислена λ → грешка");
  assert.equal(run({ lambdaHome: 1.5, lambdaAway: 1.0 }), 0, "валидни λ → ок");
});
