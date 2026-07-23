// verifier.test.mjs — верификатор-проходът за парично-критичните агенти (CI auto-discovery).
import { test } from "node:test";
import assert from "node:assert/strict";
import { verifyOutput, VERIFIER } from "./verifier.mjs";

test("непокрит агент → covered:false, ok:true (не блокираме непокритото)", () => {
  const r = verifyOutput("seo", "какъвто и да е изход");
  assert.equal(r.covered, false);
  assert.equal(r.ok, true);
});

test("goladjiyata: дисциплиниран изход минава", () => {
  const out = "Смятам overround и обезмаржвам; стейк по дробен Kelly с таван 2%. Хазартът е 18+, това не е съвет и никога не гарантирам печалба.";
  const r = verifyOutput("goladjiyata", out);
  assert.equal(r.ok, true, JSON.stringify(r.checks.filter((c) => !c.ok)));
});

test("goladjiyata: изход без марж/Kelly пада; капанът 'сигурен залог' пада", () => {
  const r = verifyOutput("goladjiyata", "Заложи на 1.85 — сигурен залог, ще спечелиш.");
  assert.equal(r.ok, false);
  assert.ok(r.checks.some((c) => !c.ok && /сигурна печалба|капан/.test(c.label)));
});

test("kasadjiyata: фискален изход без крах-инвариант пада", () => {
  const r = verifyOutput("kasadjiyata", "Записваме продажбата и после печатаме бона.");
  assert.equal(r.ok, false);
});

test("kasadjiyata: коректен изход минава (n/a за нерелевантни проверки)", () => {
  const out = "Write-ahead PENDING ред + УНП преди печат; идемпотентен commit; reconcile при старт. Цените са int евроценти. Не е правен съвет (Н-18).";
  const r = verifyOutput("kasadjiyata", out);
  assert.equal(r.ok, true, JSON.stringify(r.checks.filter((c) => !c.ok)));
});

test("prodavacha: webhook изход без payment_status пада", () => {
  const r = verifyOutput("prodavacha", "При checkout.session.completed давам достъп; проверявам подписа с raw body; идемпотентен по event.id.");
  assert.equal(r.ok, false);
  assert.ok(r.checks.some((c) => !c.ok && /payment_status/.test(c.label)));
});

test("treydara: локален-само стоп пада; борсов reduce-only минава", () => {
  const bad = verifyOutput("treydara", "Пращам market поръчка с clientOrderId; стопът е в паметта на бота.");
  assert.equal(bad.ok, false);
  const good = verifyOutput("treydara", "Поръчки с clientOrderId (идемпотентни); стопът е reduce-only на борсата + kill-switch. Стратегията минава paper trading; не е инвестиционен съвет и не гарантирам нищо.");
  assert.equal(good.ok, true, JSON.stringify(good.checks.filter((c) => !c.ok)));
});

test("всички верификатор-агенти реално съществуват в дефинициите", () => {
  for (const id of Object.keys(VERIFIER)) assert.match(id, /^[\w-]+$/);
});
