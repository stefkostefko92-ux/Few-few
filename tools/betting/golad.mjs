#!/usr/bin/env node
// golad.mjs — прецизен трансперентен пайплайн на Голаджията: λ → матрица → пазари → обезмаржване →
// смес с пазара (anchor) → стойност (EV) → дробен Kelly. Изпълнима прецизност, не описана.
// НЕ Е БЕТИНГ СЪВЕТ — смятащ инструмент. Входните данни ги вадиш и цитираш ТИ; тук е само математиката.
//
//   echo '{"lambdaHome":1.6,"lambdaAway":1.05,"odds1x2":[2.10,3.40,3.60]}' | node tools/betting/golad.mjs
//   node tools/betting/golad.mjs --json input.json
//   вход може и с "ratings":{attHome,defHome,attAway,defAway,leagueAvgGoals,homeAdv} вместо λ.

import { readFileSync } from "node:fs";
import { scoreMatrix, markets, topScores, lambdaFromRatings } from "./golad-model.mjs";
import { devig, overround } from "./devig.mjs";
import { blend, ev, kelly } from "./calibration.mjs";

const argv = process.argv.slice(2);
const JSON_OUT = argv.includes("--json");
const fileArg = argv.find((a) => !a.startsWith("--"));
let input = {};
try { input = JSON.parse(fileArg ? readFileSync(fileArg, "utf8") : readFileSync(0, "utf8")); } catch { /* */ }

let { lambdaHome, lambdaAway } = input;
if ((lambdaHome == null || lambdaAway == null) && input.ratings) ({ lambdaHome, lambdaAway } = lambdaFromRatings(input.ratings));
if (lambdaHome == null || lambdaAway == null) {
  console.error('Дай {"lambdaHome":..,"lambdaAway":..} или {"ratings":{..}}. Не измисляй λ — тегли ги от xG.');
  process.exit(1);
}

const rho = input.rho ?? -0.12;
const totalsLine = input.totalsLine ?? 2.5;
const method = input.devigMethod ?? "power";
const w = input.blendWeight ?? 0.4;
const kOpts = { fraction: input.kelly?.fraction ?? 0.25, cap: input.kelly?.cap ?? 0.03 };
const evThreshold = input.evThreshold ?? 0.03;

const M = scoreMatrix(lambdaHome, lambdaAway, { rho });
const mk = markets(M, { totalsLine });
const pModel = [mk["1"], mk.X, mk["2"]]; // 1 / X / 2

// Пазар (ако са дадени коефициенти 1x2) → обезмаржи → смеси → стойност.
let value = null;
if (Array.isArray(input.odds1x2) && input.odds1x2.length === 3) {
  const odds = input.odds1x2;
  const pMarket = devig(odds, method);
  const pFinal = blend(pModel, pMarket, w);
  const labels = ["1 (домакин)", "X (равен)", "2 (гост)"];
  value = {
    overround: overround(odds),
    method, blendWeight: w,
    rows: labels.map((label, i) => {
      const e = ev(pFinal[i], odds[i]);
      return {
        label, odds: odds[i],
        pModel: pModel[i], pMarket: pMarket[i], pFinal: pFinal[i],
        fairOdds: 1 / pFinal[i], ev: e,
        stake: e > evThreshold ? kelly(pFinal[i], odds[i], kOpts) : 0,
        value: e > evThreshold,
      };
    }),
  };
}

const out = {
  note: "Смятащ инструмент — НЕ бетинг съвет. λ тегли от xG и цитирай източниците. 18+, риск от загуба.",
  lambdaHome, lambdaAway, rho,
  model: { "1": pModel[0], X: pModel[1], "2": pModel[2], over: mk.over, under: mk.under, bttsYes: mk.bttsYes, totalsLine },
  topScores: topScores(M, 5),
  value,
};

if (JSON_OUT) { console.log(JSON.stringify(out, null, 2)); process.exit(0); }

const pct = (x) => (x * 100).toFixed(1) + "%";
console.log(`\n⚽ Голаджията · прецизен модел (λ_дом=${lambdaHome.toFixed(2)} λ_гост=${lambdaAway.toFixed(2)} · ρ=${rho} · DC)\n`);
console.log(`  1X2 (модел):  1 ${pct(pModel[0])} · X ${pct(pModel[1])} · 2 ${pct(pModel[2])}`);
console.log(`  Над/Под ${totalsLine}: над ${pct(mk.over)} · под ${pct(mk.under)}   BTTS да: ${pct(mk.bttsYes)}`);
console.log(`  Топ резултати: ${topScores(M, 5).map((s) => s.score + " " + pct(s.p)).join(" · ")}`);
if (value) {
  console.log(`\n  Стойност (обезмаржване=${method}, overround=${pct(value.overround)}, смес w=${w}, EV праг=${pct(evThreshold)}):`);
  for (const r of value.rows) {
    console.log(`    ${r.label.padEnd(14)} коеф ${r.odds.toFixed(2)} · модел ${pct(r.pModel)} · пазар ${pct(r.pMarket)} · финал ${pct(r.pFinal)} · EV ${(r.ev * 100).toFixed(1)}% ` +
      (r.value ? `→ \x1b[32mстойност · залог ${pct(r.stake)} банк (дробен Kelly)\x1b[0m` : "→ без стойност"));
  }
} else {
  console.log(`\n  (дай "odds1x2":[o1,oX,o2] за обезмаржване + стойност + Kelly)`);
}
console.log(`\n  ⚠ Не бетинг съвет · λ от xG с източник · човек решава реален залог · 18+, риск от загуба.\n`);
process.exit(0);
