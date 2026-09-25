#!/usr/bin/env node
// capture-transcript.mjs — оркестраторният вход към учебния цикъл, когато hook-ът не тръгва.
//
// СРЕДА-ДУПКАТА, която затваря (измерена, не предположена): `SubagentStop` НЕ се изпълнява за
// ФОНОВИ Agent извиквания в текущия харнес — SubagentStart тръгва (доктрината се инжектира),
// но dod-check + memory-capture никога. Обучителна вълна във фонов режим завършваше с готови
// ```learn блокове в транскриптите и НУЛА записани поуки — тих отпад на цялото учене.
//
// Това НЕ е втори писач на памет: единственият писач остава .claude/hooks/memory-capture.mjs
// (същата валидация: agent-рутиране, източник-или-нищо, secret/инжекция дроп, дедуп, версия,
// табло). Тук само подаваме транскрипта през СЪЩИЯ stdin договор, който харнесът би подал.
//
//   node tools/memory/capture-transcript.mjs <транскрипт.jsonl> [още...]
//
// Изход: 0 = всички подадени · 2 = грешна употреба/липсващ файл. Дали има НОВИ поуки се вижда
// от разликата в паметта (hook-ът е идемпотентен — повторно подаване не дублира).

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { finish } from "../lib/emit.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const HOOK = join(ROOT, ".claude", "hooks", "memory-capture.mjs");

/** Има ли изобщо learn блок вътре? (евтин пред-филтър, за да не спамим hook-а) */
export function hasLearnBlock(text) {
  return /```learn\s*\n[\s\S]*?```/.test(String(text || ""));
}

async function main() {
  const paths = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  if (!paths.length) {
    console.error("Употреба: node tools/memory/capture-transcript.mjs <транскрипт.jsonl> [още...]");
    return finish(2);
  }
  let fed = 0, skipped = 0;
  for (const p of paths) {
    const abs = resolve(p);
    if (!existsSync(abs)) { console.error(`✘ няма такъв файл: ${p}`); return finish(2); }
    if (!hasLearnBlock(readFileSync(abs, "utf8"))) { console.log(`· ${p}: няма learn блок — пропускам`); skipped++; continue; }
    const r = spawnSync(process.execPath, [HOOK], {
      input: JSON.stringify({ transcript_path: abs }), encoding: "utf8", timeout: 30000,
      env: { ...process.env, CLAUDE_PROJECT_DIR: ROOT },
    });
    if (r.status !== 0) console.error(`⚠ hook излезе с ${r.status} за ${p}: ${(r.stderr || "").slice(0, 200)}`);
    else fed++;
  }
  console.log(`✓ подадени през учебния hook: ${fed} · без learn блок: ${skipped}`);
  return finish(0);
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
