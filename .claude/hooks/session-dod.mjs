#!/usr/bin/env node
// session-dod.mjs — Stop hook на ГЛАВНАТА сесия: „готово" значи ЗЕЛЕНО, не „спрях да пиша".
// Аналог на dod-check за субагентите: ако сесията спира с незакомитнати промени по проследени
// файлове, връща я ВЕДНЪЖ с инструкция (комитни/обясни защо е нарочно WIP). Щит срещу цикъл:
// stop_hook_active → само предупреждение. Fail-open при грешка на hook-а.
//
// Не блокира: чисто дърво · само untracked/gitignored шум · повторно спиране (stop_hook_active).

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";
import { inputFiles, fileHashes, inputsHash } from "../../tools/agents/live-gate.mjs";

// CLAUDE_PROJECT_DIR override (както в dod-check.mjs): без него хукът е структурно НЕТЕСТВАЕМ на
// CLI ниво — тестът би трябвало да мутира реалното репо, за да види поведението. Харнесът подава
// същата променлива, така че продукционното поведение е непроменено.
const ROOT = process.env.CLAUDE_PROJECT_DIR || join(dirname(fileURLToPath(import.meta.url)), "..", "..");

// Чиста логика — тестваема: git status --short редове → {dirty:[…], ok}.
export function checkClean(statusLines) {
  // Броим само промени по ПРОСЛЕДЕНИ файлове (M/A/D/R/C в който и да е от двата стълба).
  // Чисто untracked (`??`) не блокира — може да е нарочен scratch.
  const dirty = statusLines.filter((l) => l && !l.startsWith("??"));
  return { dirty, ok: dirty.length === 0 };
}

// Втори щит (27.10.2026): сесия, чийто клон е пипнал входовете на агентския слой (дефиниции, куки, settings,
// доктрина …), не е „готова“, докато промяната не е доказана НА ЖИВО — зелените тестове три месеца криеха, че
// агентите не виждат паметта и процедурата. Сесии, които не пипат слоя, не се връщат (печатът може да е стар
// заради чужд merge — това не е тяхна работа).
export function liveGateDue({ touched, layer, stampHash, currentHash }) {
  if (stampHash && stampHash === currentHash) return [];
  const set = new Set(layer);
  return [...new Set(touched)].filter((f) => set.has(f)).sort();
}

function touchedFiles() {
  const run = (c) => { try { return execSync(c, { cwd: ROOT, encoding: "utf8", timeout: 5000 }).split("\n").filter(Boolean); } catch { return []; } };
  return [...run("git diff --name-only origin/main...HEAD"), ...run("git diff --name-only HEAD")];
}

function liveGateMessage() {
  let stamp = null;
  try { stamp = JSON.parse(readFileSync(join(ROOT, "tools", "agents", "evals", "live-gate.json"), "utf8")); } catch { /* няма печат */ }
  const layer = inputFiles(ROOT);
  const due = liveGateDue({ touched: touchedFiles(), layer, stampHash: stamp?.inputsHash, currentHash: inputsHash(fileHashes(ROOT, layer)) });
  if (!due.length) return "";
  return `Session-DoD: клонът пипа агентския слой (${due.slice(0, 4).join(", ")}${due.length > 4 ? ", …" : ""}), а живият гейт не е минал след промяната. ` +
    "Тестовете не доказват какво агентът вижда — пусни node tools/agents/live-gate.mjs и комитни tools/agents/evals/live-gate.json, или кажи изрично защо остава непроверено.";
}

function main() {
  let payload = {};
  try { payload = JSON.parse(readFileSync(0, "utf8")); } catch { /* fail-open */ }
  let status = "";
  try { status = execSync("git status --short", { cwd: ROOT, encoding: "utf8", timeout: 5000 }); } catch { process.exit(0); }
  const r = checkClean(status.split("\n"));
  if (r.ok) {
    let live = "";
    try { live = liveGateMessage(); } catch { /* fail-open */ }
    if (!live) process.exit(0);
    if (payload.stop_hook_active) { console.log(`⚠ ${live}`); process.exit(0); }
    console.error(live);
    process.exit(2);
  }
  const msg = `Session-DoD: ${r.dirty.length} проследени файла с незакомитнати промени (${r.dirty.slice(0, 5).map((l) => l.trim().split(/\s+/).pop()).join(", ")}${r.dirty.length > 5 ? ", …" : ""}). Комитни ги (conventional, BG) и пусни гейта — или кажи изрично защо остават WIP.`;
  if (payload.stop_hook_active) { console.log(`⚠ ${msg}`); process.exit(0); }
  console.error(msg);
  process.exit(2); // върни сесията веднъж — „готово" = зелено
}

if (import.meta.url === `file://${process.argv[1]}`) { try { main(); } catch { process.exit(0); } }
