#!/usr/bin/env node
// error-ledger.mjs — дневник на РЕАЛНИТЕ грешки на агентите → всяка става регресионен spec.
// Правилото: грешка, уловена в реална работа, НЕ умира в паметта — тя се записва тук и получава
// red-before-green golden/injection spec, който пада преди поправката и остава завинаги. Иначе
// същият клас грешка се връща тихо.
//
//   node tools/agents/error-ledger.mjs add --agent <id> --desc "..." [--spec <specId>]
//   node tools/agents/error-ledger.mjs list
//   node tools/agents/error-ledger.mjs --check     # fail-closed: запис без съществуващ spec → exit 1
//
// Ledger: tools/agents/evals/errors.jsonl (проследен в git — историята е част от знанието).

import { readFileSync, writeFileSync, appendFileSync, existsSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const LEDGER = join(HERE, "evals", "errors.jsonl");
const SPECS_DIR = join(HERE, "evals", "specs");
const AGENTS_DIR = join(HERE, "..", "..", ".claude", "agents");
const argv = process.argv.slice(2);
const val = (f) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : null; };

export function loadLedger(path = LEDGER) {
  if (!existsSync(path)) return [];
  return readFileSync(path, "utf8").split("\n").filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return { _bad: l }; } });
}

// Fail-closed проверка: всеки запис има агент, описание и СЪЩЕСТВУВАЩ spec.
export function checkLedger(entries, specIds, agentIds) {
  const errors = [];
  entries.forEach((e, i) => {
    if (e._bad) { errors.push(`ред ${i + 1}: непарсим JSON`); return; }
    if (!e.agent || !e.desc) errors.push(`ред ${i + 1}: липсва agent/desc`);
    if (agentIds && e.agent && !agentIds.has(e.agent)) errors.push(`ред ${i + 1}: непознат агент „${e.agent}"`);
    if (!e.spec) errors.push(`ред ${i + 1} (${e.agent}): грешка БЕЗ регресионен spec — добави spec и вържи с --spec`);
    else if (specIds && !specIds.has(e.spec)) errors.push(`ред ${i + 1} (${e.agent}): spec „${e.spec}" не съществува в evals/specs/`);
  });
  return errors;
}

function specIds() {
  try { return new Set(readdirSync(SPECS_DIR).filter((f) => f.endsWith(".json")).map((f) => f.replace(/\.json$/, ""))); } catch { return new Set(); }
}
function agentIds() {
  try { return new Set(readdirSync(AGENTS_DIR).filter((f) => f.endsWith(".md") && !f.startsWith("_") && f !== "README.md").map((f) => f.replace(/\.md$/, ""))); } catch { return null; }
}

function runCli() {
  const cmd = argv.find((a) => !a.startsWith("--"));
  if (cmd === "add") {
    const agent = val("--agent"), desc = val("--desc"), spec = val("--spec");
    if (!agent || !desc) { console.error("употреба: add --agent <id> --desc \"...\" [--spec <specId>]"); process.exit(2); }
    const ids = agentIds();
    if (ids && !ids.has(agent)) { console.error(`непознат агент „${agent}"`); process.exit(1); }
    if (spec && !specIds().has(spec)) { console.error(`spec „${spec}" не съществува — първо създай регресионния spec`); process.exit(1); }
    const date = process.env.OVERSEE_TODAY || new Date().toISOString().slice(0, 10);
    appendFileSync(LEDGER, JSON.stringify({ date, agent, desc, spec: spec || null }) + "\n");
    console.log(`✓ записано${spec ? "" : " — ⚠ БЕЗ spec: --check ще е червен, докато не вържеш регресионен spec"}`);
    process.exit(0);
  }
  const entries = loadLedger();
  if (cmd === "list") {
    if (!entries.length) { console.log("Дневникът е празен — нула регистрирани реални грешки."); process.exit(0); }
    for (const e of entries) console.log(`  ${e.date} · ${e.agent} · ${e.spec || "⚠ БЕЗ SPEC"} — ${e.desc}`);
    process.exit(0);
  }
  if (argv.includes("--check")) {
    const errors = checkLedger(entries, specIds(), agentIds());
    if (!errors.length) { console.log(`✓ error-ledger: ${entries.length} записа, всички с регресионен spec.`); process.exit(0); }
    console.log(`✗ error-ledger: ${errors.length} проблема:`); errors.forEach((e) => console.log(`    ${e}`));
    process.exit(1);
  }
  console.error("употреба: error-ledger.mjs add|list|--check"); process.exit(2);
}

if (import.meta.url === `file://${process.argv[1]}`) runCli();
