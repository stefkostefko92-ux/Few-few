#!/usr/bin/env node
// token-budget.mjs — оценител на токен-разхода на всеки агент + печалбата от кеш/усилие.
//
// Защо: при ВСЕКИ старт агентът плаща фиксиран контекст — системен промпт (дефиницията) +
// инжектирания префикс (доктрина за сигурност + обща процедура + споделени поуки + лична памет).
// Този фиксиран разход се повтаря на всяко извикване. Два лоста го свиват:
//   1) Prompt caching — статичният префикс (доктрина+процедура+споделено) е БАЙТ-в-БАЙТ еднакъв за
//      всички агенти и между извикванията → кеширан се чете на ~0.1× цена. Спестеното = 0.9× от него.
//   2) Постнота — раздута дефиниция се плаща на всеки старт; флагваме извънредно големите.
//
// ВАЖНО: числата са ОЦЕНКА (евристичен токенизатор, Cyrillic-aware), не измерен ран. За точни числа
// виж `POST /v1/messages/count_tokens` (Anthropic) — но за относително сравнение и бюджет евристиката стига.
//
//   node tools/agents/token-budget.mjs            # четим отчет + флагове за постнота
//   node tools/agents/token-budget.mjs --json     # машинен изход (за таблото/CI)
//   node tools/agents/token-budget.mjs --check     # изход≠0 ако агент надвиши тавана за постнота (CI, advisory)

import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { emitJsonNow } from "../lib/emit.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const AGENTS_DIR = join(ROOT, ".claude", "agents");
const MEM_DIR = join(AGENTS_DIR, "_memory");

const argv = process.argv.slice(2);
const JSON_OUT = argv.includes("--json");
const CHECK = argv.includes("--check");

// Два прага за постнота на дефиницията (системен промпт, плаща се на всеки старт):
//  - WARN (advisory ▲): калибриран спрямо реалното разпределение (n=26): медиана ~3.5k, p90 ~4.8k.
//    Флагва само истинските извънредни случаи (горните ~10%) като кандидати за слим — не всекидневния размер.
//  - HARD (--check гейт в CI): таван срещу РАЗБЯГВАНЕ. Нищо днес не го достига (treydara ~7k < 8k),
//    затова CI минава; но ако дефиниция подуе над него → провал. Гейтваме регресията, не текущото състояние.
const DEF_TOKEN_WARN = 4800;
const DEF_TOKEN_HARD = 8000;
// Инжектираната лична памет е капната по токен-бюджет от memory-preload (релевантно извличане),
// не сляпо първите N. Отразяваме РЕАЛНО инжектирания разход, не пълния файл. Дръж в синхрон с
// MEM_TOKEN_BUDGET в .claude/hooks/memory-preload.mjs.
const MEM_INJECT_BUDGET = 3200;
// Таван на СТАТИЧНИЯ ПРЕФИКС (доктрина+процедура+споделено). Този блок се инжектира на ВСЕКИ агент,
// на ВСЕКИ старт → цената му се умножава по размера на флота. При 27 агента един добавен булет от
// ~230 т струва ~6200 т на вълна, завинаги. Дефинициите отдавна имат таван (DEF_TOKEN_HARD), а
// най-мултиплицираният разход във флота нямаше НИКАКЪВ — растеше безнадзорно.
// WARN ≈ +10% над днешното, HARD ≈ +27%: гейтваме РАЗБЯГВАНЕТО, не текущото състояние.
export const PREFIX_TOKEN_WARN = 5200;
export const PREFIX_TOKEN_HARD = 6000;

// --- Cyrillic-aware евристичен токенизатор ---------------------------------
// Claude токенизаторът дели кирилицата по-ситно от латиницата. Емпирично blended съотношение:
// кирилична буква ≈ 1/2.2 токена, останалото (ASCII/код/пунктуация) ≈ 1/4 токена. Плюс отделни
// токени за нови редове (структурна цена). Това е ОЦЕНКА за относително сравнение, не точен брой.
export function estTokens(text) {
  if (!text) return 0;
  let cyr = 0, other = 0, nl = 0;
  for (const ch of text) {
    if (ch === "\n") nl++;
    else if (/[Ѐ-ӿ]/.test(ch)) cyr++;
    else other++;
  }
  return Math.round(cyr / 2.2 + other / 4 + nl * 0.5);
}

// Извади `- ` булетите под `## <заглавие>` (същата логика като memory-preload).
function bulletsUnder(file, headingRe) {
  if (!existsSync(file)) return [];
  const lines = readFileSync(file, "utf8").split("\n");
  const start = lines.findIndex((l) => headingRe.test(l));
  if (start === -1) return [];
  const out = [];
  for (let i = start + 1; i < lines.length; i++) {
    if (/^##\s/.test(lines[i])) break;
    if (lines[i].trim().startsWith("- ")) out.push(lines[i]);
  }
  return out;
}

// Тялото на дефиницията (без YAML frontmatter) = системният промпт, който агентът плаща всеки старт.
function defBody(md) {
  const m = md.match(/^---\n[\s\S]*?\n---\n?([\s\S]*)$/);
  return m ? m[1] : md;
}

function agentIds() {
  return readdirSync(AGENTS_DIR)
    .filter((f) => f.endsWith(".md") && !f.startsWith("_") && f !== "README.md")
    .map((f) => f.replace(/\.md$/, "")).sort();
}
function frontModel(md) { const m = md.match(/^model:\s*(.+)$/m); return m ? m[1].trim() : null; }
function frontEffort(md) { const m = md.match(/^effort:\s*(.+)$/m); return m ? m[1].trim() : null; }

// Смятай целия бюджет — изнесено като функция, за да е тестваемо и преизползваемо (таблото).
export function computeBudget() {
  // Статичен префикс — идентичен по СЪДЪРЖАНИЕ за всички агенти, но НЕ и споделим между тях.
  // Кешът е йерархичен (tools → system → messages) и се инвалидира надолу по веригата. Нашият
  // префикс се инжектира като `additionalContext` от `SubagentStart` (memory-preload.mjs:155),
  // тоест в MESSAGES — след системния блок, който носи дефиницията на конкретния агент и е
  // РАЗЛИЧЕН за всеки. Затова един агент не може да прочете кеша на друг.
  // Икономията по-долу е за ПОВТОРНИ извиквания на СЪЩИЯ агент (топла сесия), не за вълна от 27.
  // Отделно: статичното и променливата по задача памет днес влизат в ЕДИН блок (същият ред 155),
  // така че няма чиста точка на прекъсване — истинската поправка е префиксът да отиде на system
  // ниво (както `evals/headless-run.mjs:84` вече прави с --append-system-prompt).
  const doctrine = bulletsUnder(join(MEM_DIR, "SECURITY.md"), /^##\s*Доктрина/).join("\n");
  const procedure = bulletsUnder(join(MEM_DIR, "PROCEDURE.md"), /^##\s*Процедура/).join("\n");
  const shared = bulletsUnder(join(MEM_DIR, "_shared.md"), /^##\s*Споделени поуки/).join("\n");
  // Разбивка по източник — за да се вижда КОЙ файл дърпа тавана нагоре, не само общата сума.
  const prefixParts = [
    { src: "_memory/SECURITY.md (Доктрина)", tokens: estTokens(doctrine) },
    { src: "_memory/PROCEDURE.md (Процедура)", tokens: estTokens(procedure) },
    { src: "_memory/_shared.md (Споделени поуки)", tokens: estTokens(shared) },
  ];
  const STATIC_PREFIX_TOKENS = prefixParts.reduce((s, p) => s + p.tokens, 0);
  // Кешираният read е ~0.1× → спестено на всяко извикване след първото = 0.9× от статичния префикс.
  const CACHE_SAVED = Math.round(STATIC_PREFIX_TOKENS * 0.9);

  const rows = [];
  for (const id of agentIds()) {
    const md = readFileSync(join(AGENTS_DIR, id + ".md"), "utf8");
    const sysTokens = estTokens(defBody(md));
    const memFile = join(MEM_DIR, id + ".md");
    const personalFull = existsSync(memFile)
      ? estTokens(bulletsUnder(memFile, /^##\s*Проверени поуки/).slice(0, 40).join("\n"))
      : 0;
    // Реален инжектиран разход = капнат по бюджета за извличане (по-малкото от пълния и тавана).
    const personalTokens = Math.min(personalFull, MEM_INJECT_BUDGET);
    // Разход при старт (без кеш) = системен промпт + статичен префикс + лична памет.
    const perStartCold = sysTokens + STATIC_PREFIX_TOKENS + personalTokens;
    // Разход при старт (със заключен кеш) = плащаш пълно само динамичното; статичното на 0.1×.
    const perStartWarm = sysTokens + Math.round(STATIC_PREFIX_TOKENS * 0.1) + personalTokens;
    const savedPct = perStartCold ? Math.round((CACHE_SAVED / perStartCold) * 100) : 0;
    rows.push({
      id, model: frontModel(md), effort: frontEffort(md),
      sysTokens, staticPrefix: STATIC_PREFIX_TOKENS, personalTokens,
      personalFull, memTrim: personalFull - personalTokens, // спестено от релевантното извличане (капа)
      perStartCold, perStartWarm, cacheSaved: CACHE_SAVED, savedPct,
      bloated: sysTokens > DEF_TOKEN_WARN, overHard: sysTokens > DEF_TOKEN_HARD,
    });
  }
  const totals = {
    agents: rows.length,
    staticPrefixTokens: STATIC_PREFIX_TOKENS,
    cacheSavedPerStart: CACHE_SAVED,
    fleetColdPerStart: rows.reduce((s, r) => s + r.perStartCold, 0),
    fleetWarmPerStart: rows.reduce((s, r) => s + r.perStartWarm, 0),
  };
  totals.fleetSavedPerWave = totals.fleetColdPerStart - totals.fleetWarmPerStart;
  // Реалната цена на префикса за флота: плаща се веднъж на агент, на всяка вълна.
  totals.prefixCostPerWave = STATIC_PREFIX_TOKENS * rows.length;
  totals.prefixShareOfWave = totals.fleetColdPerStart ? totals.prefixCostPerWave / totals.fleetColdPerStart : 0;
  // Колко струва ЕДИН нов булет в префикса (средна дължина на съществуващите) — числото, което
  // прави решението „да го добавя ли в _shared/PROCEDURE" осъзнато, вместо безплатно на вид.
  const prefixBullets = bulletsUnder(join(MEM_DIR, "SECURITY.md"), /^##\s*Доктрина/).length
    + bulletsUnder(join(MEM_DIR, "PROCEDURE.md"), /^##\s*Процедура/).length
    + bulletsUnder(join(MEM_DIR, "_shared.md"), /^##\s*Споделени поуки/).length;
  totals.prefixBullets = prefixBullets;
  totals.costPerPrefixBullet = prefixBullets ? Math.round((STATIC_PREFIX_TOKENS / prefixBullets) * rows.length) : 0;
  return {
    rows, totals, prefixParts, STATIC_PREFIX_TOKENS, CACHE_SAVED,
    DEF_TOKEN_WARN, DEF_TOKEN_HARD, PREFIX_TOKEN_WARN, PREFIX_TOKEN_HARD,
    prefixBloated: STATIC_PREFIX_TOKENS > PREFIX_TOKEN_WARN,
    prefixOverHard: STATIC_PREFIX_TOKENS > PREFIX_TOKEN_HARD,
  };
}

async function runCli() {
const { rows, totals, prefixParts, STATIC_PREFIX_TOKENS, CACHE_SAVED, prefixBloated, prefixOverHard } = computeBudget();
const bloated = rows.filter((r) => r.bloated);
const overHard = rows.filter((r) => r.overHard);

if (JSON_OUT) {
  await emitJsonNow({
    generatedNote: "оценка (евристичен Cyrillic-aware токенизатор); точни числа: count_tokens endpoint",
    defTokenWarn: DEF_TOKEN_WARN,
    prefixTokenWarn: PREFIX_TOKEN_WARN, prefixTokenHard: PREFIX_TOKEN_HARD,
    totals, prefixParts, rows,
  }, 0);
}

console.log(`\n🪙  Токен-бюджет на екипа (${rows.length} агента) — ОЦЕНКА, не измерен ран\n`);
console.log(`  Статичен префикс (доктрина+процедура+споделено): ~${STATIC_PREFIX_TOKENS} т · еднакъв по СЪДЪРЖАНИЕ`);
console.log(`  Кеш спестява ~${CACHE_SAVED} т на повторно извикване на СЪЩИЯ агент (0.9× от префикса).`);
console.log(`  \x1b[90mНЕ се дели между различни агенти: префиксът влиза в messages (SubagentStart), а системният`);
console.log(`  блок преди него е различен за всеки агент → всеки плаща префикса си наново.\x1b[0m`);
for (const p of prefixParts) console.log(`    \x1b[90m· ${p.src.padEnd(36)} ~${String(p.tokens).padStart(5)} т\x1b[0m`);
console.log(`  Цена за флота: ~${totals.prefixCostPerWave} т/вълна (${(totals.prefixShareOfWave * 100).toFixed(0)}% от студена вълна) · ` +
  `таван ${PREFIX_TOKEN_HARD} т`);
console.log(`  \x1b[90mЕДИН нов булет в префикса струва ~${totals.costPerPrefixBullet} т на вълна, завинаги (×${rows.length} агента).\x1b[0m\n`);
console.log("  агент                   модел    усилие  сис.промпт  лична  старт(студ)  старт(кеш)  спест%");
for (const r of rows) {
  const flag = r.bloated ? "\x1b[33m▲\x1b[0m" : " ";
  console.log(
    `  ${flag}${r.id.padEnd(22)} ${(r.model || "—").padEnd(7)} ${(r.effort || "—").padEnd(7)} ` +
    `${String(r.sysTokens).padStart(9)}  ${String(r.personalTokens).padStart(5)}  ` +
    `${String(r.perStartCold).padStart(10)}  ${String(r.perStartWarm).padStart(9)}  ${String(r.savedPct).padStart(5)}%`,
  );
}
console.log(`\n  Флот/вълна: студено ~${totals.fleetColdPerStart} т → топло ~${totals.fleetWarmPerStart} т ` +
  `(~${totals.fleetSavedPerWave} т ГОРНА ГРАНИЦА, не прогноза)`);
console.log(`  \x1b[90m„Топло" значи всеки агент е викан ПОВТОРНО в рамките на живота на кеша. Първа паралелна`);
console.log(`  вълна от 27 различни агента е студена по дефиниция — там икономията е нула.\x1b[0m`);
if (bloated.length) {
  console.log(`\n\x1b[33m▲ Постнота:\x1b[0m ${bloated.length} дефиниции над ${DEF_TOKEN_WARN} т — кандидати за слим (плаща се на всеки старт):`);
  for (const r of bloated) console.log(`    ${r.id} — ~${r.sysTokens} т`);
}
console.log("");

if (prefixBloated && !prefixOverHard) {
  console.log(`\x1b[33m▲ Статичният префикс\x1b[0m е ~${STATIC_PREFIX_TOKENS} т (над ${PREFIX_TOKEN_WARN}) — ` +
    `всеки булет се плаща ×${rows.length}. Слим кандидат, преди да удари тавана ${PREFIX_TOKEN_HARD}.\n`);
}

let failed = 0;
if (CHECK && overHard.length) {
  console.error(`token-budget --check: ${overHard.length} дефиниции над твърдия таван ${DEF_TOKEN_HARD} т (разбягване): ` +
    overHard.map((r) => `${r.id}~${r.sysTokens}`).join(", "));
  failed = 1;
}
if (CHECK && prefixOverHard) {
  console.error(`token-budget --check: статичният префикс е ~${STATIC_PREFIX_TOKENS} т над твърдия таван ` +
    `${PREFIX_TOKEN_HARD} т. Той се инжектира на ВСЕКИ агент → ~${totals.prefixCostPerWave} т на вълна. ` +
    `Разбивка: ${prefixParts.map((p) => `${p.src}~${p.tokens}`).join(" · ")}. ` +
    `Слим доктрината/процедурата/споделеното или обедини булети — не вдигай тавана.`);
  failed = 1;
}
process.exit(failed);
}

// Пусни CLI само при директно извикване (не при import от тест/табло).
if (import.meta.url === `file://${process.argv[1]}`) await runCli();
