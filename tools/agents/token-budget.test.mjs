// token-budget.test.mjs — оценителят на токен-бюджета (CI auto-discover).
import { test } from "node:test";
import assert from "node:assert/strict";
import { estTokens, computeBudget, PREFIX_TOKEN_WARN, PREFIX_TOKEN_HARD } from "./token-budget.mjs";

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

// --- Таван на статичния префикс ------------------------------------------------
// Префиксът се плаща от ВСЕКИ агент на ВСЕКИ старт. Дефинициите имаха таван, той — не.

test("разбивката на префикса се събира до общата сума (нищо не се губи/брои двойно)", () => {
  const { prefixParts, STATIC_PREFIX_TOKENS } = computeBudget();
  assert.equal(prefixParts.length, 3, "доктрина + процедура + споделено");
  assert.equal(prefixParts.reduce((s, p) => s + p.tokens, 0), STATIC_PREFIX_TOKENS);
  for (const p of prefixParts) assert.ok(p.tokens > 0, `${p.src} трябва да е непразен`);
});

test("цената за флота е префикс × брой агенти, а делът е спрямо студената вълна", () => {
  const { totals, rows, STATIC_PREFIX_TOKENS } = computeBudget();
  assert.equal(totals.prefixCostPerWave, STATIC_PREFIX_TOKENS * rows.length);
  assert.equal(totals.prefixShareOfWave, totals.prefixCostPerWave / totals.fleetColdPerStart);
  assert.ok(totals.prefixShareOfWave > 0 && totals.prefixShareOfWave < 1);
});

test("цената на ЕДИН булет в префикса е умножена по флота (числото, което прави добавянето осъзнато)", () => {
  const { totals, rows, STATIC_PREFIX_TOKENS } = computeBudget();
  assert.ok(totals.prefixBullets > 0);
  assert.equal(totals.costPerPrefixBullet, Math.round((STATIC_PREFIX_TOKENS / totals.prefixBullets) * rows.length));
  assert.ok(totals.costPerPrefixBullet > STATIC_PREFIX_TOKENS / totals.prefixBullets,
    "цената на булет ТРЯБВА да е умножена по флота, не единична");
});

test("праговете са наредени и днешният префикс е под твърдия таван (гейтваме разбягване, не текущото)", () => {
  const { STATIC_PREFIX_TOKENS, prefixOverHard } = computeBudget();
  assert.ok(PREFIX_TOKEN_WARN < PREFIX_TOKEN_HARD, "WARN трябва да е под HARD");
  assert.ok(STATIC_PREFIX_TOKENS < PREFIX_TOKEN_HARD,
    `префиксът (${STATIC_PREFIX_TOKENS}) е над твърдия таван (${PREFIX_TOKEN_HARD}) — слим го, не вдигай тавана`);
  assert.equal(prefixOverHard, false);
});

test("гейтът РЕАЛНО пада при раздут префикс (иначе таванът е декорация)", () => {
  // Червено-преди-зелено: симулирай префикс над тавана и провери, че флагът се вдига.
  const { STATIC_PREFIX_TOKENS } = computeBudget();
  const simulate = (tokens) => ({ over: tokens > PREFIX_TOKEN_HARD, warn: tokens > PREFIX_TOKEN_WARN });
  assert.deepEqual(simulate(PREFIX_TOKEN_HARD + 1), { over: true, warn: true }, "над HARD → твърд провал");
  assert.deepEqual(simulate(PREFIX_TOKEN_WARN + 1), { over: false, warn: true }, "между WARN и HARD → само съвет");
  // Третото твърдение искаше днешното да е под WARN — по-строго от самия гейт, който по дизайн
  // излиза 0 в жълтата лента. Затова падаше при ДОПУСТИМО състояние (5791 т: над WARN 5200, под
  // HARD 6000) и превръщаше съвет в провал. Проверяваме това, което наистина гейтва.
  assert.equal(simulate(STATIC_PREFIX_TOKENS).over, false,
    `префиксът (${STATIC_PREFIX_TOKENS} т) е над твърдия таван ${PREFIX_TOKEN_HARD} — слим текста, не вдигай тавана`);
});
