#!/usr/bin/env node
// gate.mjs — ЕДИНСТВЕНИЯТ източник на истина за пълния гейт на агентския слой.
//
// Защо. Гейтът живееше преписан на ръка в ДВЕ места — `.github/workflows/agents.yml` (15 стъпки) и
// `.github/workflows/agents-sweep.yml` (10). Двата вече бяха се раздалечили: sweep-ът не пускаше
// consistency-audit, recovery-audit, trajectory-audit и loop-audit, тоест седмичният „пълен" health
// sweep беше по-слаб от PR гейта, без някой да е решавал това. Гейт, преписан на две места, дрейфва
// винаги — въпрос на време е, не на дисциплина. Тук е списъкът; workflow-ите само го викат.
//
//   node tools/agents/gate.mjs              # пусни целия гейт (паралелно), доклад накрая
//   node tools/agents/gate.mjs --list       # само покажи какво съдържа
//   node tools/agents/gate.mjs --serial     # едно по едно (за четим лог при диагностика)
//
// Изход 1 при провал на ЗАДЪЛЖИТЕЛНА проверка. Съветващите (advisory) се докладват, но не гейтват.

import { spawn } from "node:child_process";
import { cpus } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const argv = process.argv.slice(2);
const LIST = argv.includes("--list");
const SERIAL = argv.includes("--serial");

// `required: false` = докладва, не гейтва (същият смисъл като `|| true` в workflow-а, но видим).
const CHECKS = [
  // Пръв по ред: ако наш файл не се парсва, всички следващи проверки падат по объркваща причина.
  { id: "syntax", desc: "всеки наш .mjs се парсва (права кавичка в „ … “ чупи низа)", cmd: ["tools/lib/syntax-check.mjs"] },
  { id: "oversee", desc: "надзор над екипа (цялост дефиниция↔памет↔agents.json↔settings)", cmd: ["tools/agents/oversee.mjs"] },
  { id: "deep-audit", desc: "дупки: регистър↔дефиниция · инжекции · счупени препратки · продукти", cmd: ["tools/agents/deep-audit.mjs", "--check"] },
  { id: "drift-lint", desc: "счупени референции + бройка/ростер consistency", cmd: ["tools/agents/drift-lint.mjs"] },
  { id: "eval-check", desc: "структурна валидност на golden spec-овете (без агент)", cmd: ["tools/agents/evals/eval.mjs", "--check"] },
  { id: "invariant-check", desc: "критичните method/safety котви на домейн-собствениците са в материала (детерм. behavioral слой)", cmd: ["tools/agents/invariant-check.mjs", "--check"] },
  { id: "coverage", desc: "покритие на домейни (картата не сочи несъществуващи агенти)", cmd: ["tools/agents/coverage.mjs", "--json"], quiet: true },
  { id: "skills-lint", desc: "skills frontmatter/name/тяло + правилата от наръчника на Anthropic", cmd: ["tools/skills/lint.mjs"] },
  { id: "skill-triggers", desc: "всяко умение има тригер-случаи и описание, което ги „чува“", cmd: ["tools/skills/trigger-check.mjs", "--check"] },
  { id: "tools-audit", desc: "най-малки права (advisory агенти без Write/Edit)", cmd: ["tools/agents/tools-audit.mjs"] },
  { id: "def-freshness", desc: "свежест на дефинициите (без просрочени срокове)", cmd: ["tools/agents/def-freshness.mjs"] },
  { id: "consistency", desc: "противоречия/безизточникови verified в паметта", cmd: ["tools/agents/consistency-audit.mjs", "--check"] },
  { id: "mascots", desc: "всеки агент носи маскота от mascot/, пребоядисан в акцента си", cmd: ["tools/agents/mascot-theme.mjs", "--check"] },
  { id: "dashboard-sync", desc: "таблото не лъже за знанието (agents.json ↔ реалния брой поуки в _memory)", cmd: ["tools/agents/sync-dashboard.mjs", "--check"] },
  { id: "loop-audit", desc: "readiness на автоматизациите (автономия-стълба)", cmd: ["tools/agents/loops/loop-audit.mjs"] },
  { id: "recovery-audit", desc: "стълбата провал→възстановяване е цяла", cmd: ["tools/agents/recovery-audit.mjs"] },
  { id: "trajectory-audit", desc: "пътят на оркестрацията спрямо ground-truth", cmd: ["tools/agents/trajectory-audit.mjs", "--check"] },
  { id: "error-ledger", desc: "всяка реална грешка носи регресия (spec или тест)", cmd: ["tools/agents/error-ledger.mjs", "--check"] },
  { id: "defect-rate", desc: "измерването на дефекти е трайно (тренд в git, не в .gitignore)", cmd: ["tools/agents/defect-rate.mjs", "--check"] },
  { id: "token-budget", desc: "таван на дефиниции И на статичния префикс (×флота)", cmd: ["tools/agents/token-budget.mjs", "--check"] },
  { id: "flow-cost", desc: "данък върху колаборацията (повторен префикс на верига)", cmd: ["tools/agents/flow-cost.mjs", "--check"] },
  { id: "deploy-check", desc: "autodeploy.sh е изряден", cmd: ["tools/vps/deploy-check.mjs", "deploy/autodeploy.sh"] },
  { id: "version-freshness", desc: "версиите, които агентите цитират, са сверени в TTL (не 2–3 годишни спомени)", cmd: ["tools/agents/version-freshness.mjs", "--check"] },
  { id: "claims-audit", desc: "правни/таксономични твърдения сверени в TTL + карта на зависимостта цяла", cmd: ["tools/agents/claims-audit.mjs", "--check"] },
  { id: "shared-candidates", desc: "кандидати за _shared (дедуп на памет през агенти)", cmd: ["tools/agents/shared-candidates.mjs"], required: false },
  { id: "doc-audit", desc: "застаряла/липсваща документация", cmd: ["tools/docs/doc-audit.mjs"], required: false },
  { id: "docs-fresh", desc: "docs.js (таблото) отразява реалните CLAUDE.md — не показва остаряло съдържание", cmd: ["tools/docs/collect-claude-md.mjs", "--check"] },
];

if (LIST) {
  console.log(`\nГейт на агентския слой — ${CHECKS.length} проверки (${CHECKS.filter((c) => c.required !== false).length} задължителни)\n`);
  for (const c of CHECKS) console.log(`  ${c.required === false ? "·" : "✓"} ${c.id.padEnd(18)} ${c.desc}`);
  console.log("\n  Тестовете (`node --test`) се пускат отделно — те са друга работа, не проверка на състояние.\n");
  process.exit(0);
}

function run(check) {
  return new Promise((resolve) => {
    const t0 = process.hrtime.bigint();
    const p = spawn(process.execPath, [join(ROOT, check.cmd[0]), ...check.cmd.slice(1)], { cwd: ROOT });
    let out = "";
    p.stdout.on("data", (d) => { out += d; });
    p.stderr.on("data", (d) => { out += d; });
    p.on("close", (code) => resolve({
      ...check, code, ok: code === 0,
      ms: Number(process.hrtime.bigint() - t0) / 1e6,
      out: check.quiet ? "" : out,
    }));
    p.on("error", (e) => resolve({ ...check, code: 1, ok: false, ms: 0, out: String(e) }));
  });
}

const results = [];
if (SERIAL) {
  for (const c of CHECKS) { const r = await run(c); results.push(r); console.log(`${r.ok ? "✓" : "✗"} ${r.id} (${Math.round(r.ms)}ms)`); }
} else {
  // Паралелно с таван по ядра: проверките са независими и всяка е отделен node процес.
  const limit = Math.max(2, Math.min(CHECKS.length, (cpus() || []).length || 4));
  const queue = [...CHECKS];
  const workers = Array.from({ length: limit }, async () => {
    for (let c = queue.shift(); c; c = queue.shift()) results.push(await run(c));
  });
  await Promise.all(workers);
}

results.sort((a, b) => CHECKS.findIndex((c) => c.id === a.id) - CHECKS.findIndex((c) => c.id === b.id));
const failed = results.filter((r) => !r.ok && r.required !== false);
const advisory = results.filter((r) => !r.ok && r.required === false);
const total = results.reduce((s, r) => s + r.ms, 0);

console.log(`\n🛡  Гейт на агентския слой — ${results.length} проверки\n`);
for (const r of results) {
  const icon = r.ok ? "\x1b[32m✓\x1b[0m" : r.required === false ? "\x1b[33m▲\x1b[0m" : "\x1b[31m✗\x1b[0m";
  console.log(`  ${icon} ${r.id.padEnd(18)} ${String(Math.round(r.ms)).padStart(6)}ms  ${r.desc}`);
}
// Изходът на паднала проверка е ЦЕННОТО в CI лога — печатаме го цял, не го гълтаме.
for (const r of [...failed, ...advisory]) {
  if (!r.out.trim()) continue;
  console.log(`\n─── изход на ${r.id} ${"─".repeat(Math.max(0, 50 - r.id.length))}`);
  console.log(r.out.trimEnd());
}
console.log(`\nСумарно процесорно време: ${Math.round(total)}ms` + (SERIAL ? "" : " (паралелно — стенният часовник е по-малък)"));
if (advisory.length) console.log(`\x1b[33m▲\x1b[0m ${advisory.length} съветващи проверки с находки (не гейтват): ${advisory.map((r) => r.id).join(", ")}`);
if (failed.length) {
  console.log(`\n\x1b[31mСТАТУС: ГЕЙТЪТ Е ЧЕРВЕН\x1b[0m — ${failed.length} задължителни проверки паднаха: ${failed.map((r) => r.id).join(", ")}\n`);
  process.exit(1);
}
console.log(`\n\x1b[32mСТАТУС: гейтът е зелен\x1b[0m — всички задължителни проверки минаха.\n`);
process.exit(0);
