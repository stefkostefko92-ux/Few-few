#!/usr/bin/env node
// defect-rate.mjs — термометърът на флота: КОЛКО нови дефекта откриваме и пада ли това число.
//
// Защо съществува. Версията на агент (v14.9) брои НАУЧЕНО, не СГРЕШЕНО — расте само нагоре и не
// мърда, когато агент сбърка. Затова „близо ли сме до перфекционизъм" беше неотговорим въпрос:
// имахме 25 гейта, които доказват, че ИЗВЕСТНИТЕ проблеми са затворени, и нула измерване колко
// НОВИ се появяват. Гейт без дефектен процент показва зелено и когато качеството пада.
//
// Показателят: брой новооткрити дефекти на период, разбит по агент/собственик и по това дали са
// тихи (открити чак при състезателен натиск). Зрялост = числото пада, докато натискът расте.
// Ако натискът НЕ расте, падащото число не значи нищо — затова се докладва и покритието.
//
//   node tools/agents/defect-rate.mjs             # четим отчет
//   node tools/agents/defect-rate.mjs --json      # машинен изход (табло/CI)
//   node tools/agents/defect-rate.mjs --check     # fail-closed срещу измерване, което лъже
//   node tools/agents/defect-rate.mjs --record    # запиши месечна снимка на натиска (pressure.jsonl)
//
// `--check` НЕ гейтва „много дефекти" — да намериш дефект е добро. Гейтва липсата на измерване:
// дневник, чиито записи нямат регресия, тренд-файл, който не е траен, и НАТИСК без история.
//
// ИСТОРИЯ НА НАТИСКА (2026-07-30). Дотук натискът (spec-ове + тестове) се показваше само като
// ТЕКУЩО число — падащ натиск личеше само ако някой помни старите стойности. pressure.jsonl
// (проследен в git) пази месечна снимка {month, specs, injectionSpecs, testFiles, defects} →
// отчетът дава НОРМАЛИЗИРАН процент (дефекти на 100 ед. натиск; ед. натиск = spec + тестов файл)
// и посока на самия натиск. `--record` е идемпотентен по месец (презаписва точката на текущия).
// `--check` пада при липсващ/игнориран pressure.jsonl или точка по-стара от PRESSURE_TTL_DAYS —
// същата TTL философия като version-freshness: изтече ли, гейтът НАЛАГА ново измерване.

import { readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { emitJsonNow } from "../lib/emit.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..", "..");
const LEDGER = join(HERE, "evals", "errors.jsonl");
const TREND = join(HERE, "evals", "trend.jsonl");
const PRESSURE = join(HERE, "evals", "pressure.jsonl");
const SPECS_DIR = join(HERE, "evals", "specs");
const GITIGNORE = join(ROOT, ".gitignore");
const PRESSURE_TTL_DAYS = 75; // месечни точки + толеранс — изтече ли, гейтът налага ново --record

const argv = process.argv.slice(2);
const JSON_OUT = argv.includes("--json");
const CHECK = argv.includes("--check");
const RECORD = argv.includes("--record");
const TODAY = process.env.OVERSEE_TODAY || new Date().toISOString().slice(0, 10);

const readLines = (p) => (existsSync(p) ? readFileSync(p, "utf8").split("\n").filter(Boolean) : null);
const parseJsonl = (p) => (readLines(p) || []).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);

// Групирай по календарен месец — достатъчно едро, за да не шуми от единичен ден, достатъчно ситно,
// за да се види посока след 3-4 точки. (Вълните нямат стабилен каданс; месецът има.)
const monthOf = (d) => String(d || "").slice(0, 7);

export function computeRate(entries, { today = TODAY } = {}) {
  const byMonth = new Map();
  const byAgent = new Map();
  for (const e of entries) {
    const m = monthOf(e.date) || "?";
    byMonth.set(m, (byMonth.get(m) || 0) + 1);
    byAgent.set(e.agent, (byAgent.get(e.agent) || 0) + 1);
  }
  const months = [...byMonth.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([month, count]) => ({ month, count }));
  const cur = monthOf(today);
  const idx = months.findIndex((m) => m.month === cur);
  const current = idx >= 0 ? months[idx].count : 0;
  const previous = idx > 0 ? months[idx - 1].count : (idx === -1 && months.length ? months[months.length - 1].count : null);
  // Посока има смисъл само с ПОНЕ две точки. С една точка казваме „няма база", а не „подобряваме се".
  const direction = previous == null ? "няма-база" : current < previous ? "надолу" : current > previous ? "нагоре" : "равно";
  return {
    total: entries.length,
    months,
    current, previous, direction,
    // Колко от дефектите са с вързана регресия — това е делът, който НЕ може да се върне тихо.
    withRegression: entries.filter((e) => e.spec || e.test).length,
    byAgent: [...byAgent.entries()].sort((a, b) => b[1] - a[1]).map(([agent, count]) => ({ agent, count })),
  };
}

// Натискът = колко и какви проверки въобще МОГАТ да намерят дефект. Падащ дефектен процент при
// падащ натиск е илюзия, не зрялост — затова двете се докладват заедно, никога поотделно.
export function computePressure() {
  let specs = [], injection = 0;
  try { specs = readdirSync(SPECS_DIR).filter((f) => f.endsWith(".json")); } catch { /* няма spec-ове */ }
  injection = specs.filter((f) => f.startsWith("injection-")).length;
  const tests = [];
  const walk = (d) => {
    let e; try { e = readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const x of e) {
      if (x.isDirectory()) { if (x.name !== "node_modules" && !x.name.startsWith(".")) walk(join(d, x.name)); }
      else if (x.name.endsWith(".test.mjs")) tests.push(join(d, x.name));
    }
  };
  walk(join(ROOT, "tools"));
  return { specs: specs.length, injectionSpecs: injection, testFiles: tests.length };
}

// ── История на натиска ──────────────────────────────────────────────────────
// Единица натиск = 1 eval spec ИЛИ 1 тестов файл (двата главни канала, които могат да НАМЕРЯТ
// дефект). Нормализиран процент = дефекти този месец на 100 ед. натиск — числото, което НЕ може
// да се разчете грешно при падащ натиск (знаменателят пада с него и процентът се вдига).
export const pressureUnits = (p) => p.specs + p.testFiles;
export const normalizedRate = (defects, p) => (pressureUnits(p) ? +(defects / pressureUnits(p) * 100).toFixed(1) : null);

export function readPressureHistory(file = PRESSURE) {
  return parseJsonl(file).filter((p) => p.month && typeof p.specs === "number" && typeof p.testFiles === "number");
}

// Идемпотентен запис: една точка на месец — повторен --record в същия месец презаписва точката.
export function recordPressure({ file = PRESSURE, today = TODAY, pressure = computePressure(), defects = 0 } = {}) {
  const month = monthOf(today);
  const rest = readPressureHistory(file).filter((p) => p.month !== month);
  const point = { month, date: today, ...pressure, defects };
  const all = [...rest, point].sort((a, b) => (a.month < b.month ? -1 : 1));
  writeFileSync(file, all.map((p) => JSON.stringify(p)).join("\n") + "\n");
  return point;
}

// Здраве на историята: липсваща/игнорирана = няма измерване; застаряла = измерване по спомен.
export function pressureHealth({ file = PRESSURE, today = TODAY } = {}) {
  const problems = [];
  const gi = existsSync(GITIGNORE) ? readFileSync(GITIGNORE, "utf8") : "";
  if (gi.split("\n").some((l) => l.trim() === "tools/agents/evals/pressure.jsonl"))
    problems.push("pressure.jsonl е в .gitignore — историята на натиска не преживява нов клон (амнезия).");
  const hist = readPressureHistory(file);
  if (!hist.length) problems.push("няма нито една точка в pressure.jsonl — пусни `defect-rate --record` (натиск без история не се чете).");
  else {
    const last = hist[hist.length - 1];
    const age = Math.round((new Date(today) - new Date(last.date || last.month + "-01")) / 86400000);
    if (age > PRESSURE_TTL_DAYS) problems.push(`последната точка на натиска е на ${age}д (лимит ${PRESSURE_TTL_DAYS}д) — пусни \`defect-rate --record\` (същата TTL логика като version-freshness).`);
  }
  return { history: hist, problems };
}

// Измерването е трайно само ако преживява нов клон/сесия. Тренд във .gitignore = амнезия.
// ВНИМАНИЕ за асиметрията с pressureHealth (умишлена, не пропуск): pressureHealth ГЕЙТВА при празен
// файл, защото `--record` пълни pressure.jsonl ДЕТЕРМИНИСТИЧНО (само брои spec/тест файлове, нула
// LLM) → празно = забравена евтина команда. trend.jsonl обаче се пълни само от ЖИВ eval ран
// (headless-run.mjs, реални LLM извиквания + бюджет) → празнотата НЕ бива да гейтва детерминистичния
// PR гейт (иначе CI зависи от скъпи живи евали). Затова: липса/gitignore ГЕЙТВА (каналът трябва да
// оцелее), но празнота е само СЪВЕТ (`notes`, не `problems`) — видима, не блокираща. Не „поправяй"
// това като добавиш празнотата в problems — точно това би вкарало живи евали в детерминистичния гейт.
export function measurementHealth() {
  const problems = [], notes = [];
  const gi = existsSync(GITIGNORE) ? readFileSync(GITIGNORE, "utf8") : "";
  const trendIgnored = gi.split("\n").some((l) => l.trim() === "tools/agents/evals/trend.jsonl");
  if (trendIgnored) problems.push("trend.jsonl е в .gitignore — трендът на качеството не преживява нов клон/сесия (амнезия).");
  if (!existsSync(TREND)) problems.push("липсва tools/agents/evals/trend.jsonl — няма къде да се натрупва поведенческият тренд.");
  else if (!parseJsonl(TREND).length) notes.push("trend.jsonl е празен — поведенческият тренд още не е записван (иска жив eval ран; съветващо, не гейт).");
  return { trendIgnored, trendExists: existsSync(TREND), problems, notes };
}

async function main() {
  const entries = parseJsonl(LEDGER);
  const rate = computeRate(entries);
  const pressure = computePressure();
  const health = measurementHealth();
  const trendPoints = parseJsonl(TREND).length;

  if (RECORD) {
    const point = recordPressure({ pressure, defects: rate.current });
    console.log(`✎ pressure.jsonl: точка за ${point.month} — ${point.specs} spec-а · ${point.testFiles} теста · ${point.defects} дефекта (${normalizedRate(point.defects, point)} на 100 ед. натиск).`);
  }

  const pHealth = pressureHealth();
  const noRegression = rate.total - rate.withRegression;
  const problems = [...health.problems, ...pHealth.problems];
  if (noRegression) problems.push(`${noRegression} записа в дневника без регресия — този клас грешка може да се върне тихо.`);

  const notes = [...(health.notes || [])]; // съветващи — НЕ гейтват (виж measurementHealth)
  if (JSON_OUT) {
    await emitJsonNow({ date: TODAY, rate, pressure, pressureHistory: pHealth.history, trendPoints, measurement: health, problems, notes }, CHECK && problems.length ? 1 : 0);
  }

  console.log(`\n🌡  Дефектен процент на флота (термометър, не оценка)\n`);
  console.log(`  Регистрирани дефекти: ${rate.total} · с вързана регресия: ${rate.withRegression}/${rate.total}`);
  if (!rate.months.length) console.log("  Няма записи — дефектният процент е НЕИЗМЕРИМ, не нулев.");
  for (const m of rate.months) console.log(`    ${m.month}  ${"█".repeat(Math.min(m.count, 40))} ${m.count}`);
  console.log(`\n  Текущ месец: ${rate.current}` +
    (rate.previous == null ? "  (няма предходна точка — посока още не се чете)" : `  · предходен: ${rate.previous} · посока: ${rate.direction}`));

  console.log(`\n  Натиск (какво изобщо МОЖЕ да намери дефект):`);
  console.log(`    ${pressure.specs} eval spec-а (от тях ${pressure.injectionSpecs} инжекционни) · ${pressure.testFiles} тестови файла`);
  console.log(`    \x1b[90mПадащ дефектен процент при ПАДАЩ натиск не е зрялост, а сляпо петно. Четѝ ги заедно.\x1b[0m`);

  // История на натиска: нормализираният процент е числото, което НЕ лъже при падащ знаменател.
  if (pHealth.history.length) {
    console.log(`\n  История на натиска (дефекти на 100 ед. натиск; ед. = spec + тестов файл):`);
    for (const p of pHealth.history)
      console.log(`    ${p.month}  натиск ${pressureUnits(p)} (${p.specs}s+${p.testFiles}t) · ${p.defects} дефекта → ${normalizedRate(p.defects, p)}/100`);
    if (pHealth.history.length >= 2) {
      const [a, b] = pHealth.history.slice(-2);
      const dir = pressureUnits(b) > pressureUnits(a) ? "расте" : pressureUnits(b) < pressureUnits(a) ? "\x1b[31mПАДА\x1b[0m" : "равен";
      console.log(`    Посока на натиска: ${dir} (${pressureUnits(a)} → ${pressureUnits(b)})`);
    } else console.log(`    \x1b[90m(1 точка — посока още не се чете; следващият месец пусни --record пак)\x1b[0m`);
  }
  console.log(`\n  Поведенчески тренд: ${trendPoints} записани точки` +
    (trendPoints < 3 ? "  \x1b[90m(под 3 точки посоката още не се чете)\x1b[0m" : ""));

  if (rate.byAgent.length) {
    console.log(`\n  По собственик:`);
    for (const a of rate.byAgent.slice(0, 10)) console.log(`    ${a.agent.padEnd(22)} ${a.count}`);
  }

  if (problems.length) {
    console.log(`\n\x1b[31m✗ Измерването не е здраво:\x1b[0m`);
    for (const p of problems) console.log(`    ${p}`);
  } else {
    console.log(`\n  \x1b[32m✓\x1b[0m Измерването е трайно: дневникът е в git, всеки дефект носи регресия, трендът се натрупва.`);
  }
  if (notes.length) {
    console.log(`\n\x1b[33m▲ съветващо (не гейтва):\x1b[0m`);
    for (const n of notes) console.log(`    ${n}`);
  }
  console.log("");
  process.exit(CHECK && problems.length ? 1 : 0);
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
