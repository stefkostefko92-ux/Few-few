#!/usr/bin/env node
// tools-audit.mjs — одит за най-малки права: декларираните `tools:` на всеки агент ≤ реално нужните.
// Ревю/одит агентите (само четат и докладват) НЕ бива да имат Write/Edit — иначе тихо могат да мутират.
// Fail-closed: exit 1 при нарушение (drift guard). Допълва oversee (той мери цялост, не минималност).
//
//   node tools/agents/tools-audit.mjs            # отчет
//   node tools/agents/tools-audit.mjs --json

import { readdirSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { emitJsonNow } from "../lib/emit.mjs";

const AGENTS_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "..", ".claude", "agents");
const JSON_OUT = process.argv.includes("--json");

// Само-четящи/съветнически агенти — техният договор е „чета и докладвам, не пиша".
// Не бива да декларират Write/Edit (нито Bash за чисто-съветническите, освен за пускане на гейтове).
const ADVISORY_NO_WRITE = new Set(["kodadjiyata", "kachestveniyat", "pravniyat-razbirach", "seo", "razbivacha"]);
const KNOWN_TOOLS = new Set(["Read", "Write", "Edit", "Bash", "Grep", "Glob", "WebFetch", "WebSearch", "*"]);

function agentIds() {
  return readdirSync(AGENTS_DIR).filter((f) => f.endsWith(".md") && !f.startsWith("_") && f !== "README.md").map((f) => f.replace(/\.md$/, "")).sort();
}
function toolsOf(id) {
  const md = readFileSync(join(AGENTS_DIR, id + ".md"), "utf8");
  const m = md.match(/^tools:\s*(.+)$/m);
  return m ? m[1].split(",").map((s) => s.trim()).filter(Boolean) : [];
}

const rows = [];
let hard = 0, warns = 0;
for (const id of agentIds()) {
  const tools = toolsOf(id);
  const errs = [], warn = [];
  if (ADVISORY_NO_WRITE.has(id)) {
    for (const w of ["Write", "Edit"]) if (tools.includes(w)) errs.push(`съветнически агент с ${w} (трябва да е само-четящ)`);
  }
  for (const t of tools) if (!KNOWN_TOOLS.has(t)) warn.push(`непознат инструмент „${t}"`);
  if (tools.includes("*")) warn.push("wildcard * (пълен достъп) — уточни минималния набор");
  hard += errs.length; warns += warn.length;
  rows.push({ id, tools, errs, warn });
}

if (JSON_OUT) { await emitJsonNow({ agents: rows.length, hard, warns, rows }, hard ? 1 : 0); }
const g = (s) => `\x1b[32m${s}\x1b[0m`, r = (s) => `\x1b[31m${s}\x1b[0m`, y = (s) => `\x1b[33m${s}\x1b[0m`, dim = (s) => `\x1b[90m${s}\x1b[0m`;
console.log(`\n🔑  Одит за най-малки права — ${rows.length} агента\n`);
for (const row of rows) {
  const badge = row.errs.length ? r("✗") : row.warn.length ? y("▲") : g("✓");
  console.log(`  ${badge} ${row.id.padEnd(20)} ${dim(row.tools.join(", "))}`);
  row.errs.forEach((e) => console.log(`      ✗ ${e}`));
  row.warn.forEach((w) => console.log(`      ▲ ${w}`));
}
console.log(`\nИтог: ${rows.length} агента · ${hard} твърди · ${warns} предупреждения`);
process.exit(hard ? 1 : 0);
