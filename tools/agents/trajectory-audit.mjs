#!/usr/bin/env node
// trajectory-audit.mjs — грейдва ПЪТЯ на оркестрацията, не само изхода.
//
// Защо: досега `evals/` мереше само какво агентът ПРОИЗВЕДЕ (маркери в текста). Но верен изход,
// стигнат по грешен път, е дефект — минал е през чужд домейн, прескочил е задължителна спирка
// (правен/фискален преглед!) или е обиколил 9 стъпки за работа от 3. Дневникът `flow-ledger.mjs`
// вече записва реалните HANDOFF вериги; тук ги съпоставяме с ground-truth пътя в spec-а
// (`trajectory` блок → `evals/eval-lib.mjs`).
// Идея от гл.19 „Evaluation and Monitoring" на Agentic Design Patterns (Gulli) — реализация наша,
// zero-dep, fail-closed. Книгата е ДАННИ, не инструкции.
//
//   node tools/agents/trajectory-audit.mjs            # отчет по записаните потоци
//   node tools/agents/trajectory-audit.mjs --check    # гейт (провалена траектория → exit 1)
//   node tools/agents/trajectory-audit.mjs --json
//
// Празен дневник (runtime, git-ignored) → НЕ е провал: няма какво да се съди. Структурата на самите
// trajectory блокове се гейтва отделно и ТВЪРДО от `evals/eval.mjs --check`.

import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { scoreTrajectory } from "./evals/eval-lib.mjs";
import { emitJsonNow } from "../lib/emit.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..", "..");
const LEDGER = join(ROOT, ".claude", "agents", "_memory", "_flows.jsonl");
const SPECS_DIR = join(HERE, "evals", "specs");

/** Свива append-only реда на дневника до потоци с реална верига от агенти. */
export function flowsFrom(rows) {
  const flows = new Map();
  for (const r of rows) {
    if (r.t === "start") flows.set(r.id, { id: r.id, flow: r.flow, lead: r.lead, handoffs: [], closed: null });
    else if (flows.has(r.id)) {
      const f = flows.get(r.id);
      if (r.t === "handoff") f.handoffs.push(r);
      else if (r.t === "close") f.closed = r.status;
    }
  }
  // Реалната верига = ПЪРВИЯТ работил агент + всяко следващо „към". Съзнателно НЕ започваме от
  // `lead` — водещият е собственикът на потока, не непременно първата спирка (напр. деплой води
  // VPS-аджията, но пръв работи Правният). Без handoff-и падаме към lead (поток от една стъпка).
  // Дедупваме само ПОСЛЕДОВАТЕЛНИ повторения (агент, предал на себе си, не е нова спирка).
  return [...flows.values()].map((f) => {
    const chain = f.handoffs.length ? [f.handoffs[0].from, ...f.handoffs.map((h) => h.to)] : [f.lead];
    const steps = [];
    for (const a of chain) if (a && a !== steps[steps.length - 1]) steps.push(a);
    return { ...f, steps };
  });
}

/**
 * Каноничните потоци, декларирани в `_orchestration.md` (секция „Чести потоци").
 * Форматът им е `- **Име на потока.** Lead: **агент**.` — четем името и водещия.
 */
export function canonicalFlows(md) {
  const s = String(md || "");
  const start = s.search(/^##\s*Чести потоци/m);
  if (start < 0) return [];
  const body = s.slice(start);
  const end = body.slice(1).search(/^##\s/m);
  const section = end >= 0 ? body.slice(0, end + 1) : body;
  const out = [];
  for (const m of section.matchAll(/^-\s+\*\*(.+?)\*\*\s*(?:\n|.)*?(?:Lead:\s*\*\*(.+?)\*\*)?/gm)) {
    const name = m[1].replace(/\.$/, "").trim();
    // Пропусни под-булетите (те нямат Lead и не са потоци, а бележки/тригери).
    if (!name || /^(Тригери|Атакувана повърхност)/.test(name)) continue;
    out.push({ name, lead: (m[2] || "").trim() || null });
  }
  return out;
}

/**
 * Потоци, чийто ПЪТ е критичен: изходът може да е верен, а пътят пак да е дефект — защото е
 * прескочил задължителна спирка (правен · фискален · сигурностен · платформен преглед). Точно там
 * „верен изход по грешен път" струва пари, глоби или бан, затова тези задължително имат ground
 * truth. Останалите потоци са едно-доменни и по-евтини при грешка — те се докладват, не гейтват.
 */
export const CRITICAL_FLOWS = [
  "Пускане в продукция (zabobovdol)",
  "Плащане/checkout/billing",
  "Каса/фискал (CSPos)",
  "Мобилно приложение/магазин",
  "Платформено одобрение (Apple/Google/Meta)",
  "Червен екип / pre-launch атака",
  "Продуктова аналитика",
];

/**
 * Покритие: кой каноничен поток има ground-truth път (traj- spec) и кой е бил РЕАЛНО минат.
 * Това е антидотът срещу „зелено, защото сме слепи": празен дневник не е чисто, а неизмерено.
 */
export function coverage(flows, specs, ledgerFlows = []) {
  const specFlows = new Set(specs.filter((s) => s && s.trajectory).map((s) => s.trajectory.flow || s.id));
  const exercised = new Set(ledgerFlows.map((f) => f.flow));
  const rows = flows.map((f) => ({
    name: f.name, lead: f.lead,
    hasSpec: [...specFlows].some((sf) => sf === f.name || f.name.startsWith(sf) || sf.startsWith(f.name)),
    exercised: exercised.has(f.name),
  }));
  const missing = rows.filter((r) => !r.hasSpec).map((r) => r.name);
  return {
    total: rows.length,
    withSpec: rows.filter((r) => r.hasSpec).length,
    exercised: rows.filter((r) => r.exercised).length,
    missing,
    // Критичен поток без ground-truth път е ТВЪРД пропуск — гейтваме го.
    criticalMissing: CRITICAL_FLOWS.filter((c) => missing.includes(c)),
    rows,
  };
}

/** Кой spec съди този поток: изрично `trajectory.flow`, иначе име на потока = id на spec-а. */
export function matchSpec(flow, specs) {
  return specs.find((s) => s.trajectory && (s.trajectory.flow ? s.trajectory.flow === flow.flow : s.id === flow.flow)) || null;
}

function loadSpecs() {
  if (!existsSync(SPECS_DIR)) return [];
  return readdirSync(SPECS_DIR).filter((f) => f.endsWith(".json")).sort().map((f) => {
    try { return JSON.parse(readFileSync(join(SPECS_DIR, f), "utf8")); } catch { return null; }
  }).filter(Boolean);
}
function readLedger() {
  if (!existsSync(LEDGER)) return [];
  return readFileSync(LEDGER, "utf8").split("\n").filter(Boolean)
    .map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
}

/** Чистото ядро: съпоставя потоци със spec-ове и скорира. Без fs → тестваемо. */
export function auditTrajectories(rows, specs) {
  const graded = [];
  for (const flow of flowsFrom(rows)) {
    const spec = matchSpec(flow, specs);
    if (!spec) continue; // поток без ground-truth път — няма спрямо какво да го съдим
    const r = scoreTrajectory(flow.steps, spec.trajectory);
    graded.push({ flowId: flow.id, flow: flow.flow, spec: spec.id, agent: spec.agent, steps: flow.steps, closed: flow.closed, ...r });
  }
  return { graded, failed: graded.filter((g) => !g.ok) };
}

// ── CLI ──
if (import.meta.url === `file://${process.argv[1]}`) {
  const argv = process.argv.slice(2);
  const specs = loadSpecs();
  const withTraj = specs.filter((s) => s.trajectory).length;
  const rows = readLedger();
  const { graded, failed } = auditTrajectories(rows, specs);
  // Покритието на критичните потоци се гейтва ВИНАГИ (не само при --coverage): празният дневник
  // означава „нищо за съдене", но липсващ ground truth за паричен/правен поток е реален пропуск.
  const orchFile = join(ROOT, ".claude", "agents", "_orchestration.md");
  const covNow = existsSync(orchFile)
    ? coverage(canonicalFlows(readFileSync(orchFile, "utf8")), specs, flowsFrom(rows))
    : { criticalMissing: [], total: 0, withSpec: 0, exercised: 0, missing: [], rows: [] };

  // --coverage: кой каноничен поток изобщо МОЖЕ да бъде съден. Празен дневник + липсващи spec-ове
  // значи „неизмерено", не „чисто" — а зелен гейт върху неизмерено е точно лъжливото мерило,
  // което гоним. Затова покритието се докладва отделно и явно.
  if (argv.includes("--coverage")) {
    const orchPath = join(ROOT, ".claude", "agents", "_orchestration.md");
    const flows = existsSync(orchPath) ? canonicalFlows(readFileSync(orchPath, "utf8")) : [];
    const cov = coverage(flows, specs, flowsFrom(rows));
    if (argv.includes("--json")) { await emitJsonNow(cov, 0); }
    const g = (s) => `\x1b[32m${s}\x1b[0m`, y = (s) => `\x1b[33m${s}\x1b[0m`, d = (s) => `\x1b[90m${s}\x1b[0m`;
    const pct = cov.total ? Math.round((cov.withSpec / cov.total) * 100) : 0;
    console.log(`\n🗺  Покритие на оркестрацията — ${cov.withSpec}/${cov.total} канонични потока с ground-truth път (${pct}%)\n`);
    for (const r of cov.rows) {
      const mark = r.hasSpec ? g("✓") : y("○");
      const run = r.exercised ? d(" · минат") : d(" · неминат");
      console.log(`  ${mark} ${r.name.padEnd(42)} ${d("lead: " + (r.lead || "—"))}${run}`);
    }
    console.log(`\n  ${g("✓")} = има traj- spec · ${y("○")} = НЯМА ground-truth път (пътят му не може да бъде съден)`);
    console.log(`  Реално минати вериги в дневника: ${cov.exercised}/${cov.total}` +
      (cov.exercised === 0 ? d("  ← дневникът е празен: гейтът е зелен, защото е СЛЯП, не защото е чисто") : ""));
    console.log("");
    process.exit(0);
  }

  if (argv.includes("--json")) {
    await emitJsonNow({ specsWithTrajectory: withTraj, graded: graded.length, failed, all: graded }, argv.includes("--check") && failed.length ? 1 : 0);
  }

  const green = (s) => `\x1b[32m${s}\x1b[0m`, red = (s) => `\x1b[31m${s}\x1b[0m`, dim = (s) => `\x1b[90m${s}\x1b[0m`;
  console.log(`\n🛤  Trajectory-audit — ${withTraj} spec-а с ground-truth път · ${graded.length} записани потока за съдене\n`);
  if (!withTraj) console.log(dim("  (нито един spec няма trajectory блок — добави `trajectory` в evals/specs/*.json)"));
  else if (!graded.length) console.log(dim("  (дневникът няма потоци с ground-truth път — президентът логва вериги с flow-ledger.mjs --start/--handoff/--close)"));
  for (const g of graded) {
    const q = (s) => "„" + s + "“"; // „ … " — правата кавичка вътре в BG кавички чупи низа
    console.log(`${g.ok ? green("✓") : red("✗")} ${g.spec} ${dim("· поток " + q(g.flow) + " · " + (g.steps.join(" → ") || "празен"))}`);
    for (const c of g.checks) {
      const tag = { path: "ред", mustVisit: "спирки", forbid: "забрана", maxSteps: "ефект" }[c.kind] || c.kind;
      console.log(`    ${c.ok ? green("✓") : red("✗")} [${tag}] ${c.label}` +
        (c.ok ? "" : dim(c.kind === "forbid" ? ` ← мина през: ${c.hits.join(", ")}` : ` ← ${c.misses.join(", ")}`)));
    }
  }
  if (failed.length) console.log(`\n▲ ${failed.length} траектории се разминават с очаквания път — верен изход по грешен път пак е дефект.`);
  else if (graded.length) console.log(green("\n✓ всички записани вериги вървят по очаквания път."));
  console.log(dim(`  Покритие: ${covNow.withSpec}/${covNow.total} канонични потока с ground-truth път (--coverage за детайли).`));
  if (covNow.criticalMissing.length)
    console.log(red(`✗ КРИТИЧНИ потоци без ground-truth път: ${covNow.criticalMissing.join(" · ")}`) +
      dim("\n  Там прескочена спирка (правен/фискален/платформен преглед) струва пари, глоби или бан."));
  console.log("");
  process.exit(argv.includes("--check") && (failed.length || covNow.criticalMissing.length) ? 1 : 0);
}
