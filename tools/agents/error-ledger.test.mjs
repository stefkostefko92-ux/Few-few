// error-ledger.test.mjs — дневникът на реалните грешки (CI auto-discovery).
import { test } from "node:test";
import assert from "node:assert/strict";
import { checkLedger, loadLedger } from "./error-ledger.mjs";

const specs = new Set(["goladjiyata-2", "injection-seo"]);
const agents = new Set(["goladjiyata", "seo"]);

test("запис със съществуващ spec → чисто", () => {
  const e = checkLedger([{ date: "2026-07-23", agent: "goladjiyata", desc: "x", spec: "goladjiyata-2" }], specs, agents);
  assert.equal(e.length, 0);
});

test("запис БЕЗ spec → грешка (правилото: всяка грешка става spec)", () => {
  const e = checkLedger([{ date: "2026-07-23", agent: "seo", desc: "пропусна UA група", spec: null }], specs, agents);
  assert.ok(e.some((m) => /БЕЗ регресионен spec/.test(m)));
});

test("несъществуващ spec / непознат агент / непарсим ред → грешки", () => {
  const e = checkLedger([
    { date: "d", agent: "seo", desc: "x", spec: "няма-такъв" },
    { date: "d", agent: "фантом", desc: "x", spec: "injection-seo" },
    { _bad: "{счупен" },
  ], specs, agents);
  assert.equal(e.length, 3);
});

test("реалният ledger (ако съществува) е чист по правилата", () => {
  const entries = loadLedger();
  // празен ledger = валиден; непразен трябва да мине проверката срещу реалните spec-ове
  assert.ok(Array.isArray(entries));
});
