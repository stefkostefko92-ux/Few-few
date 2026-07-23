// scope-check.test.mjs — монорепо закон №1 „one project per change" (CI auto-discovery).
import { test } from "node:test";
import assert from "node:assert/strict";
import { checkScope } from "./scope-check.mjs";

test("един продукт → ок", () => {
  const r = checkScope(["medqr/server.js", "medqr/src/i18n.js"]);
  assert.equal(r.ok, true);
  assert.deepEqual(r.products, ["medqr"]);
});

test("два продукта → нарушение", () => {
  const r = checkScope(["medqr/server.js", "zabobovdol/src/app/page.tsx"]);
  assert.equal(r.ok, false);
  assert.deepEqual(r.products, ["medqr", "zabobovdol"]);
});

test("инфра + един продукт → ок (CI на продукта е нормален)", () => {
  const r = checkScope([".github/workflows/medqr.yml", "medqr/server.js", "tools/agents/oversee.mjs"]);
  assert.equal(r.ok, true);
});

test("само инфра/root → ок", () => {
  const r = checkScope(["CLAUDE.md", "tools/agents/verifier.mjs", ".claude/agents/seo.md", "docs/adr/README.md"]);
  assert.equal(r.ok, true);
  assert.equal(r.products.length, 0);
});

test("./ префикс се нормализира", () => {
  const r = checkScope(["./medqr/a.js", "./panev/b.js"]);
  assert.equal(r.ok, false);
});
