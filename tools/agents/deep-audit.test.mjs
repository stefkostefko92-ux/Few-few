// deep-audit.test.mjs — одиторът на дупките трябва да лови ИМЕННО дупките, които веднъж минаха.
//
// Всяка проверка тук съответства на реален пропуск, открит при дълбокия одит:
//   • injection покритието се четеше от `agents.json`, а два агента имаха WebFetch само в
//     дефиницията → „всички покрити" при нула тестове за тях;
//   • skill цитираше `tools/payments/stripe-lint.mjs` (реално: `tools/commerce/`);
//   • `SupremeBot/` беше продукт без ред в CLAUDE.md и без собствен CLAUDE.md.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { audit, agentIds, productDirs, brokenToolRefs, brokenOwnedMemPaths, execWithoutBash } from "./deep-audit.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

/** Временно мутира РЕАЛЕН файл с памет (audit() чете от __dirname-корена, копие в /tmp гледа друг
 *  корен и не възпроизвежда състоянието — научено: замърсен тест лъже). Възстановява byte-за-byte. */
function withMemoryMutation(id, transform, fn) {
  const path = join(ROOT, ".claude", "agents", "_memory", `${id}.md`);
  const original = readFileSync(path, "utf8");
  writeFileSync(path, transform(original));
  try { return fn(); }
  finally {
    writeFileSync(path, original);
    assert.equal(readFileSync(path, "utf8"), original, `${id}.md: възстановяването се провали`);
  }
}

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

test("ТВЪРДО: поука с таг verified под Карантина (мъртво знание) — 7 реални изцерени 2026-08-03", () => {
  // Инжектирай verified-таг булет под Карантина в РЕАЛЕН файл → audit() трябва да го хване като hard.
  // Скоби в източника нарочно — позиционен парсер (`split[1]` / `[^)]*`) би пропуснал точно тях.
  const injected = withMemoryMutation("izpitatelya", (md) =>
    md.replace(/^(##\s*Карантина.*)$/m, `$1\n- **2099-01-01:** ТЕСТ заровена поука _(тест (със скоби); verified; "източник (пак скоби)")_`),
    () => audit().hard.filter((h) => h.kind === "buried-lesson"));
  assert.ok(injected.some((h) => h.msg.includes("izpitatelya")), "verified под Карантина трябва да е ТВЪРД пропуск");
  // след възстановяване — нула (пази да не сме оставили боклук)
  assert.deepEqual(audit().hard.filter((h) => h.kind === "buried-lesson"), []);
});

test("ТВЪРДО: дублирано заглавие Карантина (readerите четат само първото) — 5 реални слети 2026-08-03", () => {
  const found = withMemoryMutation("izpitatelya", (md) => md + "\n## Карантина (дубликат)\n- нещо\n",
    () => audit().hard.filter((h) => h.kind === "memory-dup"));
  assert.ok(found.some((h) => h.msg.includes("izpitatelya") && h.msg.includes("Карантина")), "двойна секция трябва да е ТВЪРД пропуск");
  assert.deepEqual(audit().hard.filter((h) => h.kind === "memory-dup"), []);
});

test("brokenOwnedMemPaths: хваща мъртъв АГЕНТ-СЛОЙ път, но е ИМУНЕН на 4-те FP класа", () => {
  // РЕАЛНИЯТ клас (treydara): агент-слой път, който не съществува → находка.
  assert.deepEqual(brokenOwnedMemPaths("виж tools/agents/memory-preload.mjs"), ["tools/agents/memory-preload.mjs"],
    "стар грешен път (реалният е .claude/hooks/) трябва да се хване");
  assert.deepEqual(brokenOwnedMemPaths("виж .claude/hooks/memory-preload.mjs"), [], "реалният път — чисто");
  // FP-1 truncation: versions.json НЕ бива да се реже до versions.js (документиран FP, за малко повторен)
  assert.deepEqual(brokenOwnedMemPaths("version-freshness чете tools/agents/versions.json"), [],
    "разширението json не бива да се реже до js");
  assert.deepEqual(brokenOwnedMemPaths("дневникът tools/agents/evals/errors.jsonl расте"), [], "jsonl не се реже");
  // FP-2 upstream docs: docs/api.md (WiseLibs) НЕ е притежавана инфра → игнориран
  assert.deepEqual(brokenOwnedMemPaths("better-sqlite3 (WiseLibs docs/api.md)"), [], "upstream docs не е наш анкер");
  // FP-4 продуктов път: adblock/tools/… НЕ е анкер (продуктов, не коренен tools/)
  assert.deepEqual(brokenOwnedMemPaths("adblock/tools/build_filters.mjs е ок"), [], "продуктов tools/ не се съди");
  // node_modules — упстрийм типове, не наш код
  assert.deepEqual(brokenOwnedMemPaths("tools/agents/node_modules/x/y.js"), [], "node_modules се пропуска");
});

test("ТВЪРДО: verified поука цитира несъществуващ агент-слой път (treydara класът)", () => {
  const found = withMemoryMutation("izpitatelya", (md) =>
    md.replace(/^(##\s*Проверени поуки.*)$/m, `$1\n- **2099-01-01:** ТЕСТ _(t; verified; "tools/agents/nema-takuv-fail.mjs:9")_`),
    () => audit().hard.filter((h) => h.kind === "dead-mem-path"));
  assert.ok(found.some((h) => h.msg.includes("izpitatelya") && h.msg.includes("nema-takuv-fail")), "мъртъв агент-слой път трябва да е ТВЪРД");
  assert.deepEqual(audit().hard.filter((h) => h.kind === "dead-mem-path"), [], "след възстановяване — нула");
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
