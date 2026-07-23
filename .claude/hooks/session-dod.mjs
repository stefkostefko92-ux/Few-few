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

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

// Чиста логика — тестваема: git status --short редове → {dirty:[…], ok}.
export function checkClean(statusLines) {
  // Броим само промени по ПРОСЛЕДЕНИ файлове (M/A/D/R/C в който и да е от двата стълба).
  // Чисто untracked (`??`) не блокира — може да е нарочен scratch.
  const dirty = statusLines.filter((l) => l && !l.startsWith("??"));
  return { dirty, ok: dirty.length === 0 };
}

function main() {
  let payload = {};
  try { payload = JSON.parse(readFileSync(0, "utf8")); } catch { /* fail-open */ }
  let status = "";
  try { status = execSync("git status --short", { cwd: ROOT, encoding: "utf8", timeout: 5000 }); } catch { process.exit(0); }
  const r = checkClean(status.split("\n"));
  if (r.ok) process.exit(0);
  const msg = `Session-DoD: ${r.dirty.length} проследени файла с незакомитнати промени (${r.dirty.slice(0, 5).map((l) => l.trim().split(/\s+/).pop()).join(", ")}${r.dirty.length > 5 ? ", …" : ""}). Комитни ги (conventional, BG) и пусни гейта — или кажи изрично защо остават WIP.`;
  if (payload.stop_hook_active) { console.log(`⚠ ${msg}`); process.exit(0); }
  console.error(msg);
  process.exit(2); // върни сесията веднъж — „готово" = зелено
}

if (import.meta.url === `file://${process.argv[1]}`) { try { main(); } catch { process.exit(0); } }
