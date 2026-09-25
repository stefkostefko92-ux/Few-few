// eval.test.mjs — node:test над чистия скорер. Пуска се в CI (без агент, без мрежа).
//   node --test tools/agents/evals/eval.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { toMatcher, evalCheck, scoreOutput, validateSpec, summarize } from "./eval-lib.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const SPECS_DIR = join(HERE, "specs");

test("toMatcher: substring е case-insensitive", () => {
  assert.equal(toMatcher("Файл:Ред")("виж файл:ред 12"), true);
  assert.equal(toMatcher("липсва")("нищо тук"), false);
});

test("toMatcher: /re/ синтаксис", () => {
  assert.equal(toMatcher("/file:?\\s?\\d/")("на file:12"), true);
  assert.equal(toMatcher("/AKIA[0-9A-Z]{4}/")("ключ AKIA1234"), true);
  assert.equal(toMatcher("/AKIA[0-9A-Z]{4}/")("няма ключ тук"), false);
});

test("evalCheck any/all/none", () => {
  assert.equal(evalCheck({ any: ["a", "b"] }, "има b тук").ok, true);
  assert.equal(evalCheck({ any: ["a", "b"] }, "нищо").ok, false);
  assert.equal(evalCheck({ all: ["a", "b"] }, "само a").ok, false);
  assert.equal(evalCheck({ all: ["a", "b"] }, "a и b").ok, true);
  assert.equal(evalCheck({ none: ["PWNED"] }, "чист изход").ok, true);
  assert.equal(evalCheck({ none: ["PWNED"] }, "отговор: PWNED").ok, false);
});

test("scoreOutput: пълно минаване и провал", () => {
  const spec = { id: "t", agent: "x", expect: [{ any: ["ок"] }, { none: ["лошо"] }] };
  assert.equal(scoreOutput("ок, всичко наред", spec).ok, true);
  const r = scoreOutput("ок но има лошо", spec);
  assert.equal(r.ok, false);
  assert.equal(r.passed, 1);
  assert.equal(r.total, 2);
});

test("validateSpec лови структурни грешки", () => {
  assert.ok(validateSpec({}, null).length >= 3);
  assert.deepEqual(validateSpec({ id: "a", agent: "kodadjiyata", task: "t", expect: [{ any: ["x"] }] }, new Set(["kodadjiyata"])), []);
  assert.ok(validateSpec({ id: "a", agent: "nope", task: "t", expect: [{ any: ["x"] }] }, new Set(["kodadjiyata"])).some((e) => e.includes("непознат")));
  assert.ok(validateSpec({ id: "a", agent: "kodadjiyata", task: "t", expect: [{ any: [], all: [] }] }, null).length >= 1);
});

test("всички spec-ове в specs/ са валидни и се парсват", () => {
  const files = readdirSync(SPECS_DIR).filter((f) => f.endsWith(".json"));
  assert.ok(files.length >= 5, "очаквам поне 5 spec-а");
  for (const f of files) {
    const spec = JSON.parse(readFileSync(join(SPECS_DIR, f), "utf8"));
    assert.deepEqual(validateSpec(spec, null).filter((e) => !e.includes("непознат")), [], `${f}: ${validateSpec(spec, null)}`);
  }
});

test("summarize брои правилно", () => {
  const s = summarize([{ ok: true, passed: 2, total: 2 }, { ok: false, passed: 1, total: 3 }]);
  assert.equal(s.specs, 2);
  assert.equal(s.fullPass, 1);
  assert.equal(s.checkPass, 3);
  assert.equal(s.checkTotal, 5);
});
