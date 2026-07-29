#!/usr/bin/env node
// error-ledger.mjs — дневник на РЕАЛНИТЕ грешки на агентите → всяка става регресионен spec.
// Правилото: грешка, уловена в реална работа, НЕ умира в паметта — тя се записва тук и получава
// red-before-green golden/injection spec, който пада преди поправката и остава завинаги. Иначе
// същият клас грешка се връща тихо.
//
//   node tools/agents/error-ledger.mjs add --agent <id> --desc "..." [--spec <specId>] [--test <път>]
//   node tools/agents/error-ledger.mjs list
//   node tools/agents/error-ledger.mjs --check     # fail-closed: запис без регресия → exit 1
//
// РЕГРЕСИЯТА може да е от два вида и двата се приемат за равностойни:
//   --spec <id>   — golden/injection eval spec (за ПОВЕДЕНЧЕСКИ дефект на агент);
//   --test <път>  — реален `node --test` файл (за дефект в НАШИТЕ инструменти/куки).
// Защо и двата: до 2026-07-28 инструментът искаше САМО eval spec. Затова цял клас реални дефекти —
// байпаси в guard куките, тихият провал с етикетите на увереност, регресията в route.mjs — НЕ МОЖЕШЕ
// да бъде записан изобщо, макар всеки да има red-before-green node тест. Дневникът стоеше с 1 запис,
// докато реалните дефекти течаха покрай него. Инструментът, който прави записването невъзможно,
// произвежда „нула грешки" — това е измерване, което лъже, не качество.
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

// Fail-closed проверка: всеки запис има агент, описание и СЪЩЕСТВУВАЩА регресия (spec ИЛИ тест).
// `testExists` е предикат (път → bool), подава се отвън → чистата логика остава без I/O и тестваема.
export function checkLedger(entries, specIds, agentIds, testExists = null) {
  const errors = [];
  entries.forEach((e, i) => {
    if (e._bad) { errors.push(`ред ${i + 1}: непарсим JSON`); return; }
    if (!e.agent || !e.desc) errors.push(`ред ${i + 1}: липсва agent/desc`);
    if (agentIds && e.agent && !agentIds.has(e.agent)) errors.push(`ред ${i + 1}: непознат агент „${e.agent}"`);
    if (!e.spec && !e.test) {
      errors.push(`ред ${i + 1} (${e.agent}): грешка БЕЗ регресия — вържи с --spec <id> или --test <път>`);
      return;
    }
    if (e.spec && specIds && !specIds.has(e.spec)) errors.push(`ред ${i + 1} (${e.agent}): spec „${e.spec}" не съществува в evals/specs/`);
    // Тестът е равностоен на spec, но само ако файлът наистина съществува — иначе „регресия" на хартия.
    if (e.test && testExists && !testExists(e.test)) errors.push(`ред ${i + 1} (${e.agent}): тест „${e.test}" не съществува`);
  });
  return errors;
}

function specIds() {
  try { return new Set(readdirSync(SPECS_DIR).filter((f) => f.endsWith(".json")).map((f) => f.replace(/\.json$/, ""))); } catch { return new Set(); }
}
function agentIds() {
  try { return new Set(readdirSync(AGENTS_DIR).filter((f) => f.endsWith(".md") && !f.startsWith("_") && f !== "README.md").map((f) => f.replace(/\.md$/, ""))); } catch { return null; }
}

// Тестовият път е РЕЛАТИВЕН спрямо корена на репото (напр. `tools/hooks/guards-redteam.test.mjs`).
const REPO_ROOT = join(HERE, "..", "..");
const testExists = (p) => !!p && existsSync(join(REPO_ROOT, p));

function runCli() {
  const cmd = argv.find((a) => !a.startsWith("--"));
  if (cmd === "add") {
    const agent = val("--agent"), desc = val("--desc"), spec = val("--spec"), tst = val("--test");
    if (!agent || !desc) { console.error("употреба: add --agent <id> --desc \"...\" [--spec <specId>] [--test <път>]"); process.exit(2); }
    const ids = agentIds();
    if (ids && !ids.has(agent)) { console.error(`непознат агент „${agent}"`); process.exit(1); }
    if (spec && !specIds().has(spec)) { console.error(`spec „${spec}" не съществува — първо създай регресионния spec`); process.exit(1); }
    if (tst && !testExists(tst)) { console.error(`тест „${tst}" не съществува (път спрямо корена на репото) — първо напиши регресията`); process.exit(1); }
    const date = process.env.OVERSEE_TODAY || new Date().toISOString().slice(0, 10);
    appendFileSync(LEDGER, JSON.stringify({ date, agent, desc, spec: spec || null, test: tst || null }) + "\n");
    console.log(`✓ записано${spec || tst ? "" : " — ⚠ БЕЗ регресия: --check ще е червен, докато не вържеш --spec или --test"}`);
    process.exit(0);
  }
  const entries = loadLedger();
  if (cmd === "list") {
    if (!entries.length) { console.log("Дневникът е празен — нула регистрирани реални грешки."); process.exit(0); }
    for (const e of entries) console.log(`  ${e.date} · ${e.agent} · ${e.spec || e.test || "⚠ БЕЗ РЕГРЕСИЯ"} — ${e.desc}`);
    process.exit(0);
  }
  if (argv.includes("--check")) {
    const ids = agentIds();
    // fail-closed: недостъпна директория с агенти → checkLedger би ПРОПУСНАЛ валидацията на
    // агентите и гейтът би минал по-мек, отколкото твърди, че е. Неможене ≠ чисто.
    if (ids === null) { console.error("✗ error-ledger: не мога да прочета .claude/agents/ — проверката е невъзможна, не „зелена“."); process.exit(2); }
    const errors = checkLedger(entries, specIds(), ids, testExists);
    if (!errors.length) { console.log(`✓ error-ledger: ${entries.length} записа, всички с регресия (spec или тест).`); process.exit(0); }
    console.log(`✗ error-ledger: ${errors.length} проблема:`); errors.forEach((e) => console.log(`    ${e}`));
    process.exit(1);
  }
  console.error("употреба: error-ledger.mjs add|list|--check"); process.exit(2);
}

if (import.meta.url === `file://${process.argv[1]}`) runCli();
