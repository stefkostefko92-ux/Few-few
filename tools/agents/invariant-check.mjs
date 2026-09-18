#!/usr/bin/env node
// invariant-check.mjs — детерминистичният, PR-гейтваем слой на behavioral evals.
//
// Пълният поведенчески eval (headless-run) иска жив LLM+API ключ → не може евтин PR гейт. Но
// КРИТИЧНИТЕ method/safety котви на домейн-собствениците, които правят очакваното поведение
// ВЪЗМОЖНО, не бива да изчезват тихо от материала (дефиниция+памет). Този гейт ги проверява
// БЕЗ LLM: редакция, махнала Kelly-тавана на Голаджията или фиксирания курс на Касаджията →
// червено ПРЕДИ merge. Не заменя headless-run (той мери реалното поведение по каданс) — той е
// проксито, което лови регресия детерминистично.
//
//   node tools/agents/invariant-check.mjs [--json] [--check]

import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { emitJsonNow } from "../lib/emit.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..", "..");
const AGENTS_DIR = join(ROOT, ".claude", "agents");
const MEM_DIR = join(AGENTS_DIR, "_memory");
const REG = join(HERE, "evals", "invariants.json");

export function loadInvariants(file = REG) { return JSON.parse(readFileSync(file, "utf8")).invariants; }

// Материалът на агента = дефиниция + проверена памет (котвата може да живее и в двете).
export function agentMaterial(id, agentsDir = AGENTS_DIR, memDir = MEM_DIR) {
  const def = join(agentsDir, id + ".md"), mem = join(memDir, id + ".md");
  return (existsSync(def) ? readFileSync(def, "utf8") : "") + "\n" + (existsSync(mem) ? readFileSync(mem, "utf8") : "");
}

// Пропуснати инварианти: за всеки агент, всеки {any:[...]} без НИТО едно съвпадение в материала.
// Липсващ агент (материалът празен) → и той е нарушение (счупена карта).
export function missingInvariants(invariants, agentsDir = AGENTS_DIR, memDir = MEM_DIR) {
  const out = [];
  for (const [id, rules] of Object.entries(invariants)) {
    const mat = agentMaterial(id, agentsDir, memDir);
    if (!mat.trim()) { out.push({ agent: id, missing: "<няма материал за агента>", label: "агентът не съществува" }); continue; }
    for (const rule of rules) {
      const hit = (rule.any || []).some((k) => mat.includes(k));
      if (!hit) out.push({ agent: id, missing: (rule.any || []).join(" / "), label: rule.label });
    }
  }
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) await runCli();
async function runCli() {
  const JSON_OUT = process.argv.includes("--json");
  const CHECK = process.argv.includes("--check");
  const invariants = loadInvariants();
  const missing = missingInvariants(invariants);
  const agents = Object.keys(invariants);
  const total = agents.reduce((n, a) => n + invariants[a].length, 0);

  if (JSON_OUT) await emitJsonNow({ agents: agents.length, invariants: total, missing }, CHECK && missing.length ? 1 : 0);

  const r = (s) => `\x1b[31m${s}\x1b[0m`, g = (s) => `\x1b[32m${s}\x1b[0m`, dim = (s) => `\x1b[90m${s}\x1b[0m`;
  console.log(`\n🎯  Поведенчески инварианти (детерминистичен слой) — ${agents.length} собственика, ${total} котви\n`);
  for (const a of agents) {
    const miss = missing.filter((m) => m.agent === a);
    console.log(`  ${miss.length ? r("✗") : g("✓")} ${a} ${dim(`(${invariants[a].length} котви${miss.length ? `, ${miss.length} ЛИПСВАТ` : ""})`)}`);
    miss.forEach((m) => console.log(`      ${r("✗ липсва:")} ${m.label} ${dim(`[${m.missing}]`)}`));
  }
  if (!missing.length) console.log(g("\n  ✓ всички критични method/safety котви присъстват в материала"));
  console.log(`\nИтог: ${missing.length} липсващи инварианта от ${total}.`);
  if (CHECK) console.log(missing.length ? r("СТАТУС: провал — върната/махната критична котва. Възстанови или обнови invariants.json съзнателно.") : g("СТАТУС: зелено."));
  process.exit(CHECK && missing.length ? 1 : 0);
}
