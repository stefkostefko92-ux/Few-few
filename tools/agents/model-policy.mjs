#!/usr/bin/env node
// model-policy.mjs — рутинг на модел/усилие по агент + одит спрямо декларираното.
//
// Защо: всичките агенти вървят на `opus`. За дълбоко разсъждение / безопасно-критично това е
// правилно; за механично/авторско по-евтин модел върши работа без загуба на качество → разходен
// лост. Този инструмент НЕ сменя нищо по подразбиране — само докладва препоръка vs декларирано.
// Смяната е реална промяна в поведението → изисква изричен `--apply` и човешко решение.
//
//   node tools/agents/model-policy.mjs            # одит: препоръка vs декларирано
//   node tools/agents/model-policy.mjs --json
//   node tools/agents/model-policy.mjs --apply     # запиши препоръчания модел във frontmatter (опция)

import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { emitJsonNow } from "../lib/emit.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const AGENTS_DIR = join(ROOT, ".claude", "agents");
const argv = process.argv.slice(2);
const JSON_OUT = argv.includes("--json");
const APPLY = argv.includes("--apply");

// Политика: TIER_A = дълбоко разсъждение / безопасно-критично / cross-family съд → opus.
// TIER_B = способно, но по-евтино стига (структурно/авторско/механично) → sonnet.
// TIER_C = чисто механично, детерминистично, без преценка → haiku ($1/$5, 3× по-евтин от sonnet).
// Обосновка на реда: пари/право/фискал/сигурност/клинично/стат/AI-канон → A. Останалото → B.
const TIER_A = new Set([
  "kodadjiyata", "kachestveniyat", "pravniyat-razbirach", "ai-djiyata", "kasadjiyata",
  "treydara", "prodavacha", "tayniyat-agent", "prevodach", "analizatora", "nabludatelya", "razbivacha",
  // goladjiyata: риск-първо (близнак на treydara) — пари/Kelly/калибрация → дълбочината струва.
  "goladjiyata",
  // vps-adjiyata: opus остава след сравнителна проба opus↔sonnet (2026-07-19) — LLM-съдия
  // с ВИСОКА увереност даде дълбочинна преднина на opus (реален deploy edge case, четене на
  // deploy.sh). Продукционен деплой = дълбочината струва. Останалите tier-B минаха паритет → sonnet.
  "vps-adjiyata",
]);
// TIER_C (haiku) е ПРАЗЕН по подразбиране — умишлено. Свалянето на агент на haiku е промяна в
// поведението и изисква СЪЩОТО доказателство като opus→sonnet: паритет през `agent-eval` (golden
// маркери + сляпо двойково съдийство). Никой агент не се слага тук „на око"; всеки наш агент носи
// домейнова преценка, а тя не е механична. Празно = честно: не сме доказали haiku-паритет за никого.
const TIER_C = new Set([]);

// Усилие (effort: reasoning бюджет) — ортогонален лост на модела. Реже ИЗХОДНИ (reasoning) токени.
// high = безопасно-критично / дълбок ревю → всички TIER_A. low = механично/шаблонно. иначе medium.
// LOW_EFFORT: най-шаблонно-процедурните — upsert seed / clip-repurpose. Тесен, защитим списък;
// разширяване = през eval-паритет, не на око (същата дисциплина като TIER_C).
const LOW_EFFORT = new Set(["siydara", "socialdjiyata"]);

const REASON = {
  A: "дълбоко разсъждение / безопасно-критично (пари·право·фискал·сигурност·клинично·стат) → opus + effort:high",
  B: "структурно/авторско/механично — способно на sonnet без загуба на качество → разходен лост",
  C: "чисто механично/детерминистично → haiku (само след eval-паритет; засега празно)",
  effort: "high=критично/дълбоко (TIER_A) · low=шаблонно/механично (LOW_EFFORT) · medium=останалите",
};
const rec = (id) => (TIER_C.has(id) ? "haiku" : TIER_A.has(id) ? "opus" : "sonnet");
const recEffort = (id) => (TIER_A.has(id) ? "high" : LOW_EFFORT.has(id) ? "low" : "medium");

function agentIds() {
  return readdirSync(AGENTS_DIR).filter((f) => f.endsWith(".md") && !f.startsWith("_") && f !== "README.md").map((f) => f.replace(/\.md$/, "")).sort();
}
function frontModel(md) { const m = md.match(/^model:\s*(.+)$/m); return m ? m[1].trim() : null; }
function frontEffort(md) { const m = md.match(/^effort:\s*(.+)$/m); return m ? m[1].trim() : null; }

// Запиши effort във frontmatter: замени реда, ако го има; иначе го добави веднага след `model:`.
function withEffort(md, effort) {
  if (/^effort:\s*.+$/m.test(md)) return md.replace(/^effort:\s*.+$/m, "effort: " + effort);
  return md.replace(/^(model:\s*.+)$/m, "$1\neffort: " + effort);
}

const rows = [];
for (const id of agentIds()) {
  const file = join(AGENTS_DIR, id + ".md");
  let md = readFileSync(file, "utf8");
  const actual = frontModel(md);
  const actualEffort = frontEffort(md);
  const want = rec(id);
  const wantEffort = recEffort(id);
  const tier = TIER_C.has(id) ? "C" : TIER_A.has(id) ? "A" : "B";
  const diverges = actual && actual !== want;
  const effortDiverges = actualEffort !== wantEffort;
  rows.push({ id, tier, actual, recommended: want, diverges, effort: actualEffort, recommendedEffort: wantEffort, effortDiverges });
  if (APPLY && (diverges || effortDiverges)) {
    if (diverges) md = md.replace(/^model:\s*.+$/m, "model: " + want);
    if (effortDiverges) md = withEffort(md, wantEffort);
    writeFileSync(file, md);
  }
}

const diverging = rows.filter((r) => r.diverges);
const effortDiverging = rows.filter((r) => r.effortDiverges);
const toSonnet = diverging.filter((r) => r.recommended === "sonnet").length;

if (JSON_OUT) {
  await emitJsonNow({
    policy: REASON, rows,
    diverging: diverging.length, effortDiverging: effortDiverging.length, applied: APPLY,
  }, 0);
}

console.log(`\n🎛  Рутинг на модел + усилие по агент (${rows.length} агента)\n`);
console.log("  A = opus (дълбоко/критично) · B = sonnet (по-евтино стига) · C = haiku (механично; засега 0)\n");
for (const r of rows) {
  const mFlag = r.diverges ? "\x1b[33mM\x1b[0m" : "\x1b[90m·\x1b[0m";
  const eFlag = r.effortDiverges ? "\x1b[36mE\x1b[0m" : "\x1b[90m·\x1b[0m";
  console.log(
    `  ${mFlag}${eFlag} ${r.id.padEnd(22)} tier ${r.tier}  ` +
    `модел ${(r.actual || "—").padEnd(7)}→${r.recommended.padEnd(7)}  ` +
    `усилие ${(r.effort || "—").padEnd(6)}→${r.recommendedEffort}`,
  );
}
if (APPLY) {
  console.log(`\n✎ приложено: ${diverging.length} модел + ${effortDiverging.length} усилие преместени към препоръката.`);
} else {
  console.log(`\nПрепоръка: ${toSonnet} агента (tier B) opus→sonnet · ${effortDiverging.length} агента с липсващо/разминаващо се усилие.`);
  console.log("M = моделът се разминава · E = усилието се разминава. Промяна в поведението — пусни с --apply само след човешко решение.");
}
process.exit(0);
