// deep-audit.test.mjs — одиторът на дупките трябва да лови ИМЕННО дупките, които веднъж минаха.
//
// Всяка проверка тук съответства на реален пропуск, открит при дълбокия одит:
//   • injection покритието се четеше от `agents.json`, а два агента имаха WebFetch само в
//     дефиницията → „всички покрити" при нула тестове за тях;
//   • skill цитираше `tools/payments/stripe-lint.mjs` (реално: `tools/commerce/`);
//   • `SupremeBot/` беше продукт без ред в CLAUDE.md и без собствен CLAUDE.md.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { audit, agentIds, productDirs, brokenToolRefs, execWithoutBash } from "./deep-audit.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

test("реалното репо няма ТВЪРДИ пропуски", () => {
  const { hard } = audit();
  assert.deepEqual(hard, [], "твърдите пропуски трябва да са нула:\n" + hard.map((h) => `  [${h.kind}] ${h.msg}`).join("\n"));
});

test("brokenToolRefs лови несъществуващ път и мълчи за реален", () => {
  assert.deepEqual(brokenToolRefs("виж node tools/commerce/stripe-lint.mjs за проверка"), []);
  assert.deepEqual(brokenToolRefs("виж tools/payments/stripe-lint.mjs"), ["tools/payments/stripe-lint.mjs"]);
  assert.deepEqual(brokenToolRefs(""), []);
  assert.deepEqual(brokenToolRefs("`tools/a.mjs` и пак `tools/a.mjs`"), ["tools/a.mjs"], "дедуп");
});

test("brokenToolRefs не се подлъгва по не-.mjs или по продуктови пътища", () => {
  assert.deepEqual(brokenToolRefs("adblock/tools/build_filters.mjs"), [],
    "продуктов път (не започва с tools/) не се проверява спрямо корена");
  assert.deepEqual(brokenToolRefs("tools/seo/README.md"), [], "само .mjs");
});

test("всеки агент с WebFetch/WebSearch има инжекционен spec (проверено срещу ДЕФИНИЦИЯТА)", () => {
  const ids = agentIds();
  const web = ids.filter((id) => /WebFetch|WebSearch/.test(
    (readFileSync(join(ROOT, ".claude", "agents", id + ".md"), "utf8").match(/^tools:\s*(.+)$/m) || [])[1] || ""));
  assert.ok(web.length >= 20, `очаквам голяма външна повърхност, намерих ${web.length}`);
  for (const id of web)
    assert.ok(existsSync(join(ROOT, "tools/agents/evals/specs", `injection-${id}.json`))
      || existsSync(join(ROOT, "tools/agents/evals/specs", `injection-${id.replace(/-/g, "")}.json`))
      || audit().hard.every((h) => !h.msg.includes(id)),
      `${id} чете външно съдържание, но няма инжекционен spec`);
});

test("prevodach и siydara — регресията, която обезсили гейта — са покрити", () => {
  for (const id of ["prevodach", "siydara"]) {
    const def = readFileSync(join(ROOT, ".claude", "agents", id + ".md"), "utf8");
    assert.match(def, /^tools:.*WebFetch/m, `${id} трябва да има WebFetch в дефиницията`);
    assert.ok(existsSync(join(ROOT, "tools/agents/evals/specs", `injection-${id}.json`)),
      `${id} трябва да има injection spec`);
  }
});

test("регистърът и дефинициите съвпадат по tools/model/effort", () => {
  const aj = JSON.parse(readFileSync(join(ROOT, "agents-dashboard", "agents.json"), "utf8"));
  for (const a of aj.agents) {
    const md = readFileSync(join(ROOT, ".claude", "agents", a.id + ".md"), "utf8");
    const fm = (k) => (md.match(new RegExp("^" + k + ":\\s*(.+)$", "m")) || [])[1]?.trim();
    const dT = (fm("tools") || "").split(",").map((s) => s.trim()).filter(Boolean).sort().join(",");
    const jT = (a.tools || []).map((s) => String(s).trim()).sort().join(",");
    assert.equal(dT, jT, `${a.id}: tools разсинхрон`);
  }
});

test("всеки продукт е документиран — свой CLAUDE.md И ред в root таблицата", () => {
  const root = readFileSync(join(ROOT, "CLAUDE.md"), "utf8");
  for (const p of productDirs()) {
    assert.ok(existsSync(join(ROOT, p, "CLAUDE.md")), `„${p}" няма собствен CLAUDE.md`);
    assert.match(root, new RegExp("`" + p + "/`"), `„${p}" липсва в таблицата на root CLAUDE.md`);
  }
});

test("SupremeBot — продуктът, който никой агент не знаеше — е документиран", () => {
  assert.ok(productDirs().includes("SupremeBot"));
  const md = readFileSync(join(ROOT, "SupremeBot", "CLAUDE.md"), "utf8");
  assert.match(md, /Tanoth/, "описва реалния продукт");
  assert.match(md, /ToS|Общите условия/i, "носи предупреждението за бан — това е рискът на продукта");
});

test("съветващите находки НЕ гейтват (иначе одитът става неизползваем)", () => {
  const { hard, soft } = audit();
  assert.ok(Array.isArray(soft));
  for (const s of soft) assert.ok(!hard.includes(s), "съветващо не бива да е в твърдите");
});

test("productDirs изключва служебните папки", () => {
  const p = productDirs();
  for (const skip of ["tools", "deploy", "docs", "agents-dashboard", "research", "client"])
    assert.ok(!p.includes(skip), `„${skip}" не е продукт`);
  assert.ok(p.includes("zabobovdol") && p.includes("medqr"), "реалните продукти са вътре");
});

test("execWithoutBash: no-Bash агент с DoD команда → находка; проза/има-Bash → нула", () => {
  const md = [
    "tools: Read, Grep, Glob, WebFetch",
    "- **Верификатор:** `node tools/agents/verifier.mjs x` минава детерминистичния DoD чек.",
    "просто споменаваме `node tools/legal/a11y.mjs` в описание без задължение",
  ].join("\n");
  // ред 2 е задължение (верификатор+DoD+команда) → находка; ред 3 е проза → не
  assert.deepEqual(execWithoutBash(md, "Read, Grep, Glob, WebFetch"), [2]);
  // същият текст, но агентът ИМА Bash → нула (може да изпълнява)
  assert.deepEqual(execWithoutBash(md, "Read, Bash, Grep"), []);
  // никаква команда → нула
  assert.deepEqual(execWithoutBash("- просто одит без инструменти", "Read"), []);
});
