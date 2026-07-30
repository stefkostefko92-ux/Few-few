// tools/memory/curate.test.mjs — регресия за ЧИСЛОВИЯ класификатор на curate (2026-07-30).
//
// Защо: „18-те противоречия" се оказаха 3 корупции + 14 парафрази + 1 закръгление — НУЛА реални
// числови противоречия. Класификаторът numTokens/numDiff отличава ПАРАФРАЗ (числата съвпадат →
// безопасно сливане) от ИСТИНСКО противоречие (числата се разминават → човек). Тези тестове пазят:
//  (1) идентичните числа → match; (2) реална разлика (ξ 0.0065≠0.0019) → НЕ match, с точните числа;
//  (3) идентификаторни цифри залепени за буква (B2C, MV3, SHA256) НЕ броят за количество;
//  (4) хилядни разделители се нормализират (52,428,800 === 52428800).

import { test } from "node:test";
import assert from "node:assert/strict";
import { numTokens, numDiff } from "./curate.mjs";

test("numDiff: идентични числа в парафраз → match", () => {
  const a = "SCA праг = 30 EUR (25 GBP); над 100 EUR или 5 транзакции иска requires_action";
  const b = "SCA праг 30 EUR (25 GBP); кумулативно над 100 EUR ИЛИ 5 транзакции → requires_action";
  const d = numDiff(a, b);
  assert.equal(d.match, true, "същите числа трябва да дадат match");
  assert.deepEqual(d.onlyA, []);
  assert.deepEqual(d.onlyB, []);
});

test("numDiff: реално количествено противоречие → НЕ match, показва двете стойности", () => {
  const a = "time-decay ξ = 0.0065 на ден";
  const b = "time-decay ξ = 0.0019 на ден";
  const d = numDiff(a, b);
  assert.equal(d.match, false, "различните количества НЕ трябва да дадат match");
  assert.ok(d.onlyA.includes("0.0065"));
  assert.ok(d.onlyB.includes("0.0019"));
});

test("numDiff: закръгление 95.91 vs 96 се флагва (консервативно, за човек)", () => {
  const a = "physical thread е 95.91% от rebuild времето";
  const b = "physical thread е ~96% от rebuild времето";
  assert.equal(numDiff(a, b).match, false);
});

test("numTokens: идентификаторни цифри залепени за буква НЕ броят (B2C, MV3, SHA256)", () => {
  const t = numTokens("customer status (B2B/B2C/exempt) с MV3 и SHA256");
  assert.ok(!t.has("2"), "‚2‘ от B2C не е количество");
  assert.ok(!t.has("3"), "‚3‘ от MV3 не е количество");
  assert.ok(!t.has("256"), "‚256‘ от SHA256 не е количество");
});

test("numTokens: самостоятелно количество СЕ хваща (за да не маскираме реално противоречие)", () => {
  const t = numTokens("прагът е 2048 бита, курсът 1.95583");
  assert.ok(t.has("2048"));
  assert.ok(t.has("1.95583"));
});

test("numTokens: хилядни разделители се нормализират (52,428,800 === 52428800)", () => {
  const withSep = numTokens("лимит 52,428,800 байта");
  const noSep = numTokens("лимит 52428800 байта");
  assert.ok(withSep.has("52428800"), "запетаите като хилядни разделители се махат");
  assert.ok(noSep.has("52428800"));
  assert.equal(numDiff("лимит 52,428,800 байта", "лимит 52428800 байта").match, true);
});

test("numTokens: версия-низ се пази цял (2026-06-24.dahlia)", () => {
  const t = numTokens("Stripe API 2026-06-24.dahlia");
  assert.ok(t.has("2026-06-24.dahlia"), "версията е един токен, не се цепи");
});
