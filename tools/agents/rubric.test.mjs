// rubric.test.mjs — node:test над детерминистичния калкулатор на тежест.
//   node --test tools/agents/rubric.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { score, RUBRICS } from "./rubric.mjs";

test("security: висок × висок → блокер", () => {
  const r = score("security", { exploitability: 3, reach: 3, confidence: 3 });
  assert.equal(r.severity, "блокер");
  assert.equal(r.score, 9);
});

test("security: ниска увереност сваля ниво", () => {
  const hi = score("security", { exploitability: 3, reach: 2, confidence: 3 }); // 6 → блокер
  assert.equal(hi.severity, "блокер");
  const lo = score("security", { exploitability: 3, reach: 2, confidence: 1 }); // 6 но conf=1 → сваля
  assert.equal(lo.severity, "бележка");
});

test("security: детерминизъм — същите входове, същият изход", () => {
  const a = score("security", { exploitability: 2, reach: 2, confidence: 2 });
  const b = score("security", { exploitability: 2, reach: 2, confidence: 2 });
  assert.deepEqual(a, b);
});

test("quality: висок ефект × ниско усилие → висок приоритет", () => {
  assert.equal(score("quality", { impact: 3, effort: 1 }).severity, "висок приоритет");
  assert.equal(score("quality", { impact: 1, effort: 3 }).severity, "нисък");
});

test("a11y: обхват × wcag ниво", () => {
  assert.equal(score("a11y", { reach: 3, level: 3 }).severity, "блокер");
  assert.equal(score("a11y", { reach: 1, level: 1 }).severity, "дребно");
});

test("clamp: извън 1–3 се затяга, не хвърля", () => {
  assert.equal(score("security", { exploitability: 9, reach: 0, confidence: 2 }).score, 3); // 3×1
});

test("непозната рубрика хвърля", () => {
  assert.throws(() => score("nope", {}));
});

test("всички рубрики връщат severity + formula", () => {
  for (const kind of Object.keys(RUBRICS)) {
    const r = score(kind, { exploitability: 2, reach: 2, confidence: 2, impact: 2, effort: 2, level: 2 });
    assert.ok(r.severity && r.formula, kind);
  }
});
