#!/usr/bin/env node
// eval.mjs — CLI за агентния golden eval (детерминистичен слой).
//
// Защо: досега golden случаите бяха само проза (`_evals/golden-cases.md`) — четяха се на ръка.
// Тук са машинно-четими spec-ове + скоринг, за да ловим регресия ПОСЛЕ редакция на дефиниция.
// LLM изходът варира, затова НЕ пускаме агента вместо теб; ти пускаш агента, дадеш изхода тук.
//
// Употреба:
//   node tools/agents/evals/eval.mjs --list              # изброй spec-овете
//   node tools/agents/evals/eval.mjs --check             # структурна валидност (CI гейт, без агент)
//   node tools/agents/evals/eval.mjs --task <specId>     # покажи входа, който да подадеш на агента
//   node tools/agents/evals/eval.mjs <specId> <outFile>  # скорирай реалния изход на агента
//   node tools/agents/evals/eval.mjs --run <dir>         # батч: <dir>/<specId>.txt за всеки spec
//   node tools/agents/evals/eval.mjs --json …            # машинен изход
//
// Изход код: 0 = ok/чисто; 1 = провал/невалиден spec. `--check` НИКОГА не пуска агент → безопасен за CI.

import { readdirSync, readFileSync, existsSync, appendFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { scoreOutput, validateSpec, summarize } from "./eval-lib.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const SPECS_DIR = join(HERE, "specs");
const ROOT = join(HERE, "..", "..", "..");
const AGENTS_DIR = join(ROOT, ".claude", "agents");
const argv = process.argv.slice(2);
const JSON_OUT = argv.includes("--json");
const has = (f) => argv.includes(f);
const val = (f) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : null; };

function knownAgents() {
  try {
    return new Set(readdirSync(AGENTS_DIR).filter((f) => f.endsWith(".md") && !f.startsWith("_") && f !== "README.md").map((f) => f.replace(/\.md$/, "")));
  } catch { return null; }
}
function loadSpecs() {
  if (!existsSync(SPECS_DIR)) return [];
  return readdirSync(SPECS_DIR).filter((f) => f.endsWith(".json")).sort().map((f) => {
    try { return { ...JSON.parse(readFileSync(join(SPECS_DIR, f), "utf8")), _file: f }; }
    catch (e) { return { _file: f, _parseError: String(e.message) }; }
  });
}

const specs = loadSpecs();
const green = (s) => `\x1b[32m${s}\x1b[0m`, red = (s) => `\x1b[31m${s}\x1b[0m`, dim = (s) => `\x1b[90m${s}\x1b[0m`;

// ── --list ──
if (has("--list")) {
  if (JSON_OUT) { console.log(JSON.stringify(specs.map((s) => ({ id: s.id, agent: s.agent, checks: (s.expect || []).length })), null, 2)); process.exit(0); }
  console.log(`\n📋  ${specs.length} golden spec-а:\n`);
  for (const s of specs) console.log(`  ${s.id ? green(s.id) : red(s._file)}  ${dim("· " + (s.agent || "?") + " · " + ((s.expect || []).length) + " проверки")}`);
  process.exit(0);
}

// ── --check (структурен гейт за CI) ──
if (has("--check")) {
  const known = knownAgents();
  let bad = 0;
  for (const s of specs) {
    const errs = s._parseError ? [s._parseError] : validateSpec(s, known);
    if (errs.length) { bad++; console.log(red(`✗ ${s._file}`)); errs.forEach((e) => console.log(`    ${e}`)); }
  }
  const injCount = specs.filter((s) => s.kind === "injection").length;
  // ПРАГ-ГЕЙТ за injection покритие: агентите с най-голяма атакувана повърхност (четат недоверено
  // външно съдържание — WebFetch, потребителски вход, борсови/пазарни данни) ЗАДЪЛЖИТЕЛНО носят
  // injection spec. Липсата = fail (иначе покритието тихо застива на 2/26). Флагнато от взаимния преглед.
  const INJECTION_REQUIRED = ["kodadjiyata", "pravniyat-razbirach", "seo", "socialdjiyata", "diskordjiyata", "treydara"];
  const injAgents = new Set(specs.filter((s) => s.kind === "injection").map((s) => s.agent));
  const missingInj = INJECTION_REQUIRED.filter((a) => !injAgents.has(a));
  if (missingInj.length) { bad++; console.log(red(`✗ липсва injection spec за високо-рискови агенти: ${missingInj.join(", ")}`)); }
  if (!bad) console.log(green(`✓ eval --check: ${specs.length} spec-а валидни (${injCount} инжекционни · ${INJECTION_REQUIRED.length}/${INJECTION_REQUIRED.length} задължителни покрити) · ${specs.length ? "" : "ПРАЗНО — добави spec-ове"}`));
  process.exit(bad || !specs.length ? 1 : 0);
}

// ── --task <id> ──
if (has("--task")) {
  const id = val("--task"); const s = specs.find((x) => x.id === id);
  if (!s) { console.error(red(`няма spec „${id}"`)); process.exit(1); }
  console.log(`\nАгент: ${s.agent}\nВход (подай това на агента, после скорирай изхода):\n\n${s.task}\n`);
  process.exit(0);
}

// ── скоринг ──
function report(results) {
  if (JSON_OUT) { console.log(JSON.stringify({ results, summary: summarize(results) }, null, 2)); return; }
  for (const r of results) {
    console.log(`\n${r.ok ? green("✓") : red("✗")} ${r.id} ${dim("· " + r.agent + " · " + r.passed + "/" + r.total)}`);
    for (const c of r.checks) {
      const tag = c.kind === "none" ? "капан" : c.kind === "all" ? "всички" : "поне-1";
      console.log(`    ${c.ok ? green("✓") : red("✗")} [${tag}] ${c.label}` + (c.ok ? "" : dim(c.kind === "none" ? ` ← намери: ${c.hits.join(", ")}` : ` ← липсва: ${c.misses.join(", ")}`)));
    }
  }
  const s = summarize(results);
  console.log(`\nИтог: ${s.fullPass}/${s.specs} spec-а пълно минати · ${s.checkPass}/${s.checkTotal} проверки · rate ${(s.rate * 100).toFixed(0)}%`);
}

let results = [];
if (has("--run")) {
  const dir = val("--run");
  for (const s of specs) {
    if (!s.id) continue;
    const f = join(dir, s.id + ".txt");
    if (!existsSync(f)) { console.error(dim(`… пропуснат ${s.id} (няма ${s.id}.txt)`)); continue; }
    results.push(scoreOutput(readFileSync(f, "utf8"), s));
  }
} else {
  const [id, outFile] = argv.filter((a) => !a.startsWith("--"));
  if (!id || !outFile) { console.error("употреба: eval.mjs <specId> <outFile> | --list | --check | --task <id> | --run <dir>"); process.exit(2); }
  const s = specs.find((x) => x.id === id);
  if (!s) { console.error(red(`няма spec „${id}"`)); process.exit(1); }
  if (!existsSync(outFile)) { console.error(red(`няма файл ${outFile}`)); process.exit(1); }
  results.push(scoreOutput(readFileSync(outFile, "utf8"), s));
}

report(results);

// --record: запиши обобщението в trend.jsonl (тренд на качеството във времето; git-ignored runtime).
if (has("--record") && results.length) {
  const s = summarize(results);
  const stamp = process.env.OVERSEE_TODAY || new Date().toISOString().slice(0, 10);
  appendFileSync(join(HERE, "trend.jsonl"), JSON.stringify({ date: stamp, ...s }) + "\n");
  if (!JSON_OUT) console.log(dim("↳ записано в trend.jsonl (тренд на качеството)"));
}

process.exit(results.length && results.every((r) => r.ok) ? 0 : 1);
