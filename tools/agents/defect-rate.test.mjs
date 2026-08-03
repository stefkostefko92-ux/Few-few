// defect-rate.test.mjs — термометърът трябва да е честен и в двете посоки.
//
// Най-опасният режим на този инструмент е да покаже „подобряваме се", когато просто сме спрели да
// гледаме. Затова тестовете държат три инварианта: празен дневник НЕ е нула дефекти; една точка НЕ
// е посока; и дефект без регресия се брои като счупено измерване, не като затворен въпрос.

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  computeRate, computePressure, measurementHealth,
  pressureUnits, normalizedRate, recordPressure, readPressureHistory, pressureHealth,
} from "./defect-rate.mjs";

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

test("асиметрия trend↔pressure е УМИШЛЕНА: празен trend е СЪВЕТ (notes), не гейт (problems)", () => {
  // trend.jsonl се пълни само от жив eval ран (LLM+бюджет) → празнотата НЕ бива да гейтва
  // детерминистичния PR гейт (за разлика от pressure, който --record пълни детерминистично).
  // B1 (2026-08-03): ако някой „поправи" това като вкара празнотата в problems, вкарва живи
  // евали в детерминистичния гейт — точно обратното на целта.
  const h = measurementHealth();
  assert.ok(Array.isArray(h.notes), "measurementHealth носи notes (съветващ канал)");
  if (h.trendExists && !h.problems.length) {
    // ако trend е празен днес → трябва да е в notes, НЕ в problems
    const empty = h.notes.some((n) => /празен/.test(n));
    const gated = h.problems.some((p) => /празен/.test(p));
    assert.equal(gated, false, "празен trend НЕ бива да гейтва (иначе CI зависи от живи евали)");
    if (empty) assert.ok(h.notes.length >= 1, "празнотата се докладва като съвет");
  }
});

// ── История на натиска (нормализираният процент, който не лъже при падащ знаменател) ──

test("normalizedRate: дефекти на 100 ед. натиск; нулев натиск → null, не деление на нула", () => {
  assert.equal(normalizedRate(53, { specs: 93, testFiles: 56 }), 35.6);
  assert.equal(pressureUnits({ specs: 93, testFiles: 56 }), 149);
  assert.equal(normalizedRate(5, { specs: 0, testFiles: 0 }), null, "без натиск процентът е НЕИЗМЕРИМ, не 0");
});

test("normalizedRate: ПАДАЩ натиск при равни дефекти ВДИГА процента (не може да се маскира)", () => {
  const before = normalizedRate(10, { specs: 90, testFiles: 60 });   // 150 ед.
  const after = normalizedRate(10, { specs: 40, testFiles: 20 });    // 60 ед. — някой е трил проверки
  assert.ok(after > before, `свит знаменател трябва да личи: ${after} > ${before}`);
});

test("recordPressure: пише точка и е идемпотентен по месец (презапис, не дублиране)", () => {
  const dir = mkdtempSync(join(tmpdir(), "pressure-"));
  const file = join(dir, "pressure.jsonl");
  try {
    recordPressure({ file, today: "2026-07-15", pressure: { specs: 90, injectionSpecs: 25, testFiles: 50 }, defects: 40 });
    recordPressure({ file, today: "2026-07-30", pressure: { specs: 93, injectionSpecs: 26, testFiles: 56 }, defects: 53 });
    const hist = readPressureHistory(file);
    assert.equal(hist.length, 1, "два записа в СЪЩИЯ месец → една точка (последната)");
    assert.equal(hist[0].defects, 53);
    recordPressure({ file, today: "2026-08-02", pressure: { specs: 95, injectionSpecs: 26, testFiles: 58 }, defects: 2 });
    assert.equal(readPressureHistory(file).length, 2, "нов месец → нова точка");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("pressureHealth: липсваща история → проблем; свежа точка → чисто; застаряла → проблем (TTL)", () => {
  const dir = mkdtempSync(join(tmpdir(), "pressure-"));
  const file = join(dir, "p.jsonl");
  try {
    assert.ok(pressureHealth({ file, today: "2026-07-30" }).problems.length >= 1, "без файл → проблем");
    writeFileSync(file, JSON.stringify({ month: "2026-07", date: "2026-07-30", specs: 93, injectionSpecs: 26, testFiles: 56, defects: 53 }) + "\n");
    assert.deepEqual(pressureHealth({ file, today: "2026-08-10" }).problems, [], "свежа точка → чисто");
    const stale = pressureHealth({ file, today: "2026-11-30" });
    assert.ok(stale.problems.some((p) => /--record/.test(p)), "точка отвъд TTL → налага ново измерване");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("реалният pressure.jsonl е здрав днес (има точка, не е игнориран, в TTL)", () => {
  assert.deepEqual(pressureHealth().problems, []);
});
