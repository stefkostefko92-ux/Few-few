#!/usr/bin/env node
// model-policy.mjs — рутинг на модел/усилие по агент + одит спрямо декларираното.
//
// Защо: всичките агенти вървят на `opus`. За дълбоко разсъждение / безопасно-критично това е
// правилно; за механично/авторско по-евтин модел върши работа без загуба на качество → разходен
// лост. Този инструмент НЕ сменя нищо по подразбиране — само докладва препоръка vs декларирано.
// Смяната е реална промяна в поведението → изисква изричен `--apply` и човешко решение.
//
//   node tools/agents/model-policy.mjs            # одит: препоръка vs декларирано
//   node tools/agents/model-policy.mjs --json
//   node tools/agents/model-policy.mjs --apply     # запиши препоръчания модел във frontmatter (опция)

import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const AGENTS_DIR = join(ROOT, ".claude", "agents");
const argv = process.argv.slice(2);
const JSON_OUT = argv.includes("--json");
const APPLY = argv.includes("--apply");

// Политика: TIER_A = дълбоко разсъждение / безопасно-критично / cross-family съд → opus.
// TIER_B = способно, но по-евтино стига (структурно/авторско/механично) → sonnet.
// Обосновка на реда: пари/право/фискал/сигурност/клинично/стат/AI-канон → A. Останалото → B.
const TIER_A = new Set([
  "kodadjiyata", "kachestveniyat", "pravniyat-razbirach", "ai-djiyata", "kasadjiyata",
  "treydara", "prodavacha", "tayniyat-agent", "prevodach", "analizatora", "nabludatelya",
  // vps-adjiyata: opus остава след сравнителна проба opus↔sonnet (2026-07-19) — LLM-съдия
  // с ВИСОКА увереност даде дълбочинна преднина на opus (реален deploy edge case, четене на
  // deploy.sh). Продукционен деплой = дълбочината струва. Останалите tier-B минаха паритет → sonnet.
  "vps-adjiyata",
]);
const REASON = {
  A: "дълбоко разсъждение / безопасно-критично (пари·право·фискал·сигурност·клинично·стат) → opus",
  B: "структурно/авторско/механично — способно на sonnet без загуба на качество → разходен лост",
};
const rec = (id) => (TIER_A.has(id) ? "opus" : "sonnet");

function agentIds() {
  return readdirSync(AGENTS_DIR).filter((f) => f.endsWith(".md") && !f.startsWith("_") && f !== "README.md").map((f) => f.replace(/\.md$/, "")).sort();
}
function frontModel(md) { const m = md.match(/^model:\s*(.+)$/m); return m ? m[1].trim() : null; }

const rows = [];
for (const id of agentIds()) {
  const file = join(AGENTS_DIR, id + ".md");
  const md = readFileSync(file, "utf8");
  const actual = frontModel(md);
  const want = rec(id);
  const tier = TIER_A.has(id) ? "A" : "B";
  const diverges = actual && actual !== want;
  rows.push({ id, tier, actual, recommended: want, diverges });
  if (APPLY && diverges) {
    writeFileSync(file, md.replace(/^model:\s*.+$/m, "model: " + want));
  }
}

const diverging = rows.filter((r) => r.diverges);
const toSonnet = diverging.filter((r) => r.recommended === "sonnet").length;

if (JSON_OUT) {
  console.log(JSON.stringify({ policy: REASON, rows, diverging: diverging.length, applied: APPLY }, null, 2));
  process.exit(0);
}

console.log(`\n🎛  Рутинг на модел по агент (${rows.length} агента)\n`);
console.log("  A = opus (дълбоко/критично) · B = sonnet (по-евтино стига)\n");
for (const r of rows) {
  const flag = r.diverges ? "\x1b[33m▲\x1b[0m" : "\x1b[90m·\x1b[0m";
  console.log(`  ${flag} ${r.id.padEnd(22)} tier ${r.tier}  декл=${(r.actual || "—").padEnd(7)} препоръка=${r.recommended}`);
}
if (APPLY) {
  console.log(`\n✎ приложено: ${diverging.length} агента преместени към препоръчания модел.`);
} else {
  console.log(`\nПрепоръка: ${toSonnet} агента (tier B) могат да минат opus→sonnet — разходен лост без загуба на дълбочина за критичните.`);
  console.log("Това е промяна в поведението — пусни с --apply само след човешко решение. Одит-only по подразбиране.");
}
process.exit(0);
