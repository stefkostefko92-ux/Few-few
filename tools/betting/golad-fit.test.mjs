// golad-fit.test.mjs — доказва, че MLE напасването ВЪЗСТАНОВЯВА известни рейтинги от синтетични данни.
import { test } from "node:test";
import assert from "node:assert/strict";
import { fitDixonColes, predictLambdas } from "./golad-fit.mjs";

// Детерминистичен PRNG (LCG) + Poisson семплер (Knuth) — възпроизводим тест без Math.random.
function makeRng(seed) { let s = seed >>> 0; return () => { s = (Math.imul(s, 1103515245) + 12345) & 0x7fffffff; return s / 0x7fffffff; }; }
function poissonSample(lambda, rand) { const L = Math.exp(-lambda); let k = 0, p = 1; do { k++; p *= rand(); } while (p > L); return k - 1; }

// Известни истински рейтинги (att = сила в атака, def = слабост в защита: по-ниско = по-силна защита).
const ATT = { A: 1.5, B: 1.25, C: 1.05, D: 0.9, E: 0.8, F: 0.62 };
const DEF = { A: 0.7, B: 0.82, C: 0.95, D: 1.05, E: 1.2, F: 1.45 };
const HOME = 1.3;
const teams = Object.keys(ATT);

function synthMatches() {
  const rand = makeRng(42);
  const M = []; const base = Date.UTC(2026, 0, 1);
  let day = 0;
  for (let round = 0; round < 9; round++) {
    for (const h of teams) for (const a of teams) {
      if (h === a) continue;
      const lh = ATT[h] * DEF[a] * HOME, la = ATT[a] * DEF[h];
      M.push({ home: h, away: a, hg: poissonSample(lh, rand), ag: poissonSample(la, rand), date: new Date(base + (day++ % 320) * 86400000).toISOString().slice(0, 10) });
    }
  }
  return M;
}

test("fitDixonColes: възстановява подредбата на атаката (A най-силен, F най-слаб)", () => {
  const fit = fitDixonColes(synthMatches(), { halfLifeDays: 400, iters: 300 });
  const byAtt = [...teams].sort((x, y) => fit.attack[y] - fit.attack[x]);
  assert.equal(byAtt[0], "A", "най-силната атака е A: " + JSON.stringify(fit.attack));
  assert.equal(byAtt[byAtt.length - 1], "F", "най-слабата атака е F");
  assert.ok(fit.attack.A > fit.attack.F * 1.8, "A атакува чувствително по-силно от F");
});

test("fitDixonColes: възстановява защитата (A най-силна защита = най-нисък def)", () => {
  const fit = fitDixonColes(synthMatches(), { halfLifeDays: 400, iters: 300 });
  const byDef = [...teams].sort((x, y) => fit.defense[x] - fit.defense[y]);
  assert.equal(byDef[0], "A", "най-силната защита (нисък def) е A: " + JSON.stringify(fit.defense));
  assert.ok(fit.homeAdv > 1.05 && fit.homeAdv < 1.7, "домакинско предимство в разумен диапазон: " + fit.homeAdv);
  assert.ok(fit.rho >= -0.2 && fit.rho <= 0.2, "ρ в [−0.2,+0.2]");
});

// Регресия: гост-базата ≠ 1. Старият код центрираше и att, и def, а излишъка пращаше само в g → λ_гост
// беше заковано към exp(0)=1 (−10…−15% при реална лига), а homeAdv поемаше базата. Старите ATT/DEF по-горе
// имат геом. средни ≈1 и затова бъгът беше невидим — тук базата е 1.25, домакинското предимство 1.3.
function biasedLeague() {
  const rand = makeRng(7);
  const T = ["A", "B", "C", "D", "E", "F", "G", "H"];
  const att = Object.fromEntries(T.map((t, i) => [t, 0.7 + 0.6 * (i / (T.length - 1))]));
  const def = Object.fromEntries(T.map((t, i) => [t, 1.3 - 0.6 * (i / (T.length - 1))]));
  const M = []; const base = Date.UTC(2026, 0, 1); let day = 0;
  for (let round = 0; round < 14; round++) for (const h of T) for (const a of T) {
    if (h === a) continue;
    M.push({ home: h, away: a, hg: poissonSample(1.25 * 1.3 * att[h] * def[a], rand), ag: poissonSample(1.25 * att[a] * def[h], rand), date: new Date(base + (day++ % 300) * 86400000).toISOString().slice(0, 10) });
  }
  return M;
}

test("fitDixonColes: средната предсказана λ съвпада с наблюдаваните голове (гост-база ≠ 1)", () => {
  const M = biasedLeague();
  const fit = fitDixonColes(M, { halfLifeDays: 1e9, iters: 800 });
  const obsH = M.reduce((s, m) => s + m.hg, 0) / M.length, obsA = M.reduce((s, m) => s + m.ag, 0) / M.length;
  let pH = 0, pA = 0;
  for (const m of M) { const l = predictLambdas(fit, m.home, m.away); pH += l.lambdaHome; pA += l.lambdaAway; }
  assert.ok(Math.abs(pH / M.length / obsH - 1) < 0.01, `λ_дом ${(pH / M.length).toFixed(3)} срещу наблюдавано ${obsH.toFixed(3)}`);
  assert.ok(Math.abs(pA / M.length / obsA - 1) < 0.01, `λ_гост ${(pA / M.length).toFixed(3)} срещу наблюдавано ${obsA.toFixed(3)}`);
  assert.ok(fit.homeAdv > 1.2 && fit.homeAdv < 1.4, `homeAdv е чист множител (~1.3), не интерсепт: ${fit.homeAdv}`);
});

test("fitDixonColes: ρ може да е положително (мрежата не отрязва над 0)", () => {
  // Положително ρ = ПО-МАЛКО 0:0/1:1 и повече 1:0/0:1 от независим Поасон (при ρ<0 е обратното).
  const M = []; const base = Date.UTC(2026, 0, 1);
  const T = ["A", "B", "C", "D"]; let day = 0;
  for (let round = 0; round < 60; round++) for (const h of T) for (const a of T) {
    if (h === a) continue;
    const k = (day + round) % 8; // фиксирана смес: само 1:0, 0:1, 2:1, 1:2 — нито 0:0, нито 1:1
    const [hg, ag] = k < 3 ? [1, 0] : k < 6 ? [0, 1] : k === 6 ? [2, 1] : [1, 2];
    M.push({ home: h, away: a, hg, ag, date: new Date(base + (day++ % 300) * 86400000).toISOString().slice(0, 10) });
  }
  const fit = fitDixonColes(M, { halfLifeDays: 1e9, iters: 300 });
  assert.ok(fit.rho > 0.05, `липса на 0:0/1:1 → ρ>0 (мрежата вече стига до +0.2), получено ${fit.rho}`);
});

test("predictLambdas: силен домакин vs слаб гост → λ_дом > λ_гост; непознат отбор → null", () => {
  const fit = fitDixonColes(synthMatches(), { halfLifeDays: 400, iters: 300 });
  const p = predictLambdas(fit, "A", "F");
  assert.ok(p.lambdaHome > 0 && p.lambdaAway > 0, "положителни λ");
  assert.ok(p.lambdaHome > p.lambdaAway, "силен домакин A вкарва повече от слаб гост F");
  assert.equal(predictLambdas(fit, "A", "НЕПОЗНАТ"), null, "непознат отбор → честно null, не измисляне");
});
