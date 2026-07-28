// defect-rate.test.mjs — термометърът трябва да е честен и в двете посоки.
//
// Най-опасният режим на този инструмент е да покаже „подобряваме се", когато просто сме спрели да
// гледаме. Затова тестовете държат три инварианта: празен дневник НЕ е нула дефекти; една точка НЕ
// е посока; и дефект без регресия се брои като счупено измерване, не като затворен въпрос.

import { test } from "node:test";
import assert from "node:assert/strict";
import { computeRate, computePressure, measurementHealth } from "./defect-rate.mjs";

const E = (date, agent, extra = {}) => ({ date, agent, desc: "x", spec: null, test: "t.mjs", ...extra });

test("празен дневник → нула записа, но БЕЗ база (не се чете като нула дефекти)", () => {
  const r = computeRate([], { today: "2026-07-28" });
  assert.equal(r.total, 0);
  assert.equal(r.months.length, 0);
  assert.equal(r.previous, null);
  assert.equal(r.direction, "няма-база", "без данни нямаме право на извод за посока");
});

test("една точка НЕ дава посока (най-честата лъжа на ранен показател)", () => {
  const r = computeRate([E("2026-07-01", "seo"), E("2026-07-09", "seo")], { today: "2026-07-28" });
  assert.equal(r.current, 2);
  assert.equal(r.previous, null);
  assert.equal(r.direction, "няма-база");
});

test("две точки дават посока — надолу, нагоре и равно", () => {
  const down = computeRate([E("2026-06-02", "seo"), E("2026-06-11", "seo"), E("2026-07-03", "seo")], { today: "2026-07-28" });
  assert.equal(down.previous, 2); assert.equal(down.current, 1); assert.equal(down.direction, "надолу");

  const up = computeRate([E("2026-06-02", "seo"), E("2026-07-03", "seo"), E("2026-07-04", "seo")], { today: "2026-07-28" });
  assert.equal(up.direction, "нагоре");

  const flat = computeRate([E("2026-06-02", "seo"), E("2026-07-03", "seo")], { today: "2026-07-28" });
  assert.equal(flat.direction, "равно");
});

test("месеците са подредени хронологично, независимо от реда в дневника", () => {
  const r = computeRate([E("2026-07-03", "a"), E("2026-05-01", "a"), E("2026-06-02", "a")], { today: "2026-07-28" });
  assert.deepEqual(r.months.map((m) => m.month), ["2026-05", "2026-06", "2026-07"]);
});

test("дефект БЕЗ регресия се брои отделно (може да се върне тихо)", () => {
  const r = computeRate([
    E("2026-07-01", "seo"),
    { date: "2026-07-02", agent: "seo", desc: "x", spec: null, test: null },
  ], { today: "2026-07-28" });
  assert.equal(r.total, 2);
  assert.equal(r.withRegression, 1, "само единият носи регресия");
});

test("spec или test — и двата се броят за регресия (равностойни са)", () => {
  const r = computeRate([
    { date: "2026-07-01", agent: "seo", desc: "x", spec: "injection-seo", test: null },
    { date: "2026-07-02", agent: "seo", desc: "x", spec: null, test: "tools/x.test.mjs" },
  ], { today: "2026-07-28" });
  assert.equal(r.withRegression, 2);
});

test("разбивката по собственик е сортирана низходящо и се събира до общото", () => {
  const r = computeRate([E("2026-07-01", "a"), E("2026-07-02", "b"), E("2026-07-03", "a")], { today: "2026-07-28" });
  assert.deepEqual(r.byAgent, [{ agent: "a", count: 2 }, { agent: "b", count: 1 }]);
  assert.equal(r.byAgent.reduce((s, x) => s + x.count, 0), r.total);
});

test("натискът се мери реално (spec-ове + тестове), иначе падащ процент не значи нищо", () => {
  const p = computePressure();
  assert.ok(p.specs > 0, "очаквам реални eval spec-ове");
  assert.ok(p.injectionSpecs > 0, "очаквам инжекционни spec-ове — те носят състезателния натиск");
  assert.ok(p.testFiles > 0, "очаквам реални тестови файлове");
  assert.ok(p.injectionSpecs <= p.specs, "инжекционните са подмножество");
});

test("здравето на измерването е зелено СЕГА (trend.jsonl е траен, не игнориран)", () => {
  const h = measurementHealth();
  assert.equal(h.trendIgnored, false, "trend.jsonl не бива да е в .gitignore — иначе трендът има амнезия");
  assert.equal(h.trendExists, true, "файлът трябва да съществува, за да има къде да се натрупва");
  assert.deepEqual(h.problems, []);
});
