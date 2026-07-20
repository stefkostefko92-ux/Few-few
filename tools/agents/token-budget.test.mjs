// token-budget.test.mjs — оценителят на токен-бюджета (CI auto-discover).
import { test } from "node:test";
import assert from "node:assert/strict";
import { estTokens, computeBudget } from "./token-budget.mjs";

test("estTokens: празно → 0; расте с дължината; кирилицата тежи повече от латиницата", () => {
  assert.equal(estTokens(""), 0);
  assert.ok(estTokens("абвгде") > 0);
  assert.ok(estTokens("аааааааааа") > estTokens("aaaaaaaaaa"), "10 кирилични > 10 латински токена");
});

test("computeBudget: по един ред на агент, всеки с положителни числа", () => {
  const { rows } = computeBudget();
  assert.ok(rows.length >= 20, "очаквам целия флот");
  for (const r of rows) {
    assert.ok(r.sysTokens > 0, `${r.id}: sysTokens>0`);
    assert.ok(r.perStartCold > r.perStartWarm, `${r.id}: кешът намалява старта`);
    assert.ok(r.savedPct > 0 && r.savedPct < 100, `${r.id}: спест% в (0,100)`);
    assert.equal(r.cacheSaved, rows[0].cacheSaved, "кеш-печалбата е еднаква (статичен префикс)");
  }
});

test("computeBudget: статичният префикс е споделен (еднакъв за всички редове)", () => {
  const { rows, STATIC_PREFIX_TOKENS } = computeBudget();
  for (const r of rows) assert.equal(r.staticPrefix, STATIC_PREFIX_TOKENS);
});

test("computeBudget: флотът спестява цялото (студено − кеш = флот×0.9×префикс)", () => {
  const { totals, CACHE_SAVED, rows } = computeBudget();
  assert.equal(totals.fleetSavedPerWave, totals.fleetColdPerStart - totals.fleetWarmPerStart);
  assert.equal(totals.fleetSavedPerWave, CACHE_SAVED * rows.length);
});
