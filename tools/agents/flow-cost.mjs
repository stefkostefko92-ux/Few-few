#!/usr/bin/env node
// flow-cost.mjs — какво струва една ВЕРИГА, не един старт.
//
// Защо. `token-budget.mjs` мери разхода на ЕДИН агент при ЕДИН старт. Но работата ни тече по
// вериги: „Мобилно приложение/магазин" минава през 7 агента. Всеки от тях плаща статичния префикс
// наново (~4732 т), защото префиксът влиза в messages СЛЕД системния блок, който е различен за
// всеки агент → кешът не се дели между агенти. Значи една верига от 7 стъпки плаща ~33k токена
// само за да си повтори една и съща доктрина седем пъти.
//
// Това е ДАНЪКЪТ ВЪРХУ КОЛАБОРАЦИЯТА и досега никой не го мереше: имахме цена на агент и цена на
// вълна, но не и цена на поток. Затова беше невидимо, че добавянето на една рецензентска стъпка
// към поток струва цял префикс, а не „само още малко".
//
//   node tools/agents/flow-cost.mjs           # цена на всеки каноничен поток
//   node tools/agents/flow-cost.mjs --json
//   node tools/agents/flow-cost.mjs --check   # гейт: поток над тавана за повторение

import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { computeBudget, PREFIX_TOKEN_HARD } from "./token-budget.mjs";
import { canonicalFlows } from "./trajectory-audit.mjs";
import { emitJsonNow } from "../lib/emit.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const ORCH = join(ROOT, ".claude", "agents", "_orchestration.md");
const AGENTS_JSON = join(ROOT, "agents-dashboard", "agents.json");

const argv = process.argv.slice(2);
const JSON_OUT = argv.includes("--json");
const CHECK = argv.includes("--check");

// Таван на данъка: дял от цената на потока, който отива само за повторение на префикса.
// Над него веригата плаща повече за преповтаряне на доктрината, отколкото за самата работа.
export const TAX_WARN = 0.45;

// ── Истинският таван на префикса ──────────────────────────────────────────────────────────────
// Два гейта пазеха префикса с РАЗЛИЧНИ и непроверени един спрямо друг тавана: `token-budget`
// пускаше до PREFIX_TOKEN_HARD (6000 т), а този тук отхвърляше още на ~5210. Затова растежът
// минаваше през първата врата и падаше на втората — със съобщение за „потоци", вместо за префикс.
// Данъкът е tax = p·s / (work + p·s), значи допустимото p се решава точно:
//     p ≤ TAX · work / (s · (1 − TAX))
// `work` (системен промпт + лична памет) не зависи от префикса, затова таванът е пресмятаем.
// Обвързващият е НАЙ-МАЛКИЯТ през потоците — обикновено едностъпков поток с лек агент, където
// доктрината лесно надтежава специалистичното знание.
export function maxTolerablePrefix(flows, tax = TAX_WARN) {
  const caps = flows.filter((f) => f.steps > 0 && f.work > 0)
    .map((f) => ({ name: f.name, cap: Math.floor((tax * f.work) / (f.steps * (1 - tax))) }));
  if (!caps.length) return null;
  return caps.reduce((a, b) => (b.cap < a.cap ? b : a));
}

/** Име за показване („Мобилджията") → id („mobildjiyata"). Потоците са писани с имена. */
export function nameToId(agentsJson) {
  const m = new Map();
  for (const a of agentsJson.agents || []) if (a.name && a.id) m.set(a.name.trim(), a.id);
  return m;
}

/**
 * Извади веригата на един поток.
 *
 * `_orchestration.md` ползва ДВА формата и това дълго беше невидимо: 15 потока пишат изрично
 * „Pipeline: A → B → C", а 9 (Трейдинг бот · AI/LLM · Discord · Chrome · 3D печат …) редят
 * веригата инлайн след „Lead:", без етикет. Инструмент, който гледа само първия формат, покрива
 * 62% от документа и мълчи за останалото — пак „зелено, защото е сляпо". Затова тук има резервен
 * път: няма ли „Pipeline:", четем целия блок до „Ескалация:".
 *
 * „Ескалация:" НИКОГА не влиза във веригата — тя описва изключението, не главния път.
 * Скобите носят обяснение, не участник — махат се.
 */
export function parsePipeline(block, names) {
  const explicit = block.match(/Pipeline:\s*([\s\S]*?)(?:Ескалация:|$)/);
  const segment = explicit ? explicit[1] : block.split(/Ескалация:/)[0];
  if (!segment) return [];
  const raw = segment.replace(/\([^)]*\)/g, " ").replace(/`[^`]*`/g, " ");
  const out = [];
  for (const seg of raw.split(/→|->/)) {
    // Един сегмент може да изброява алтернативи („Кодаджията / Касаджията"); пътят минава през
    // ЕДНА от тях, затова взимаме ПЪРВАТА по ред на поява.
    //
    // ВНИМАНИЕ: не режи сегмента по „/". Първата версия го правеше, за да хване алтернативите, и
    // мълчаливо изяде двата потока, чиито ИМЕНА съдържат наклонена черта — „Кампания/видео" ставаше
    // „- **Кампания" и вече не съдържаше „Социалджията". Пак тих отпад: 22 вместо 24, без сигнал.
    let bestName = null, bestAt = Infinity;
    for (const n of names.keys()) {
      const at = seg.indexOf(n);
      if (at < 0) continue;
      // По-ранното побеждава; при еднакво начало печели по-дългото име (то е по-специфично).
      if (at < bestAt || (at === bestAt && n.length > (bestName || "").length)) { bestName = n; bestAt = at; }
    }
    if (bestName) { const id = names.get(bestName); if (id !== out[out.length - 1]) out.push(id); }
  }
  return out;
}

/** Раздели `_orchestration.md` на блокове „- **Име.** … " за секция „Чести потоци". */
export function flowBlocks(md) {
  const start = md.search(/^##\s*Чести потоци/m);
  if (start < 0) return [];
  const body = md.slice(start);
  const end = body.slice(1).search(/^##\s/m);
  const section = end >= 0 ? body.slice(0, end + 1) : body;
  const parts = section.split(/\n(?=-\s+\*\*)/).slice(1);
  return parts.map((p) => ({ name: (p.match(/^-\s+\*\*(.+?)\*\*/) || [])[1]?.replace(/\.$/, "").trim(), block: p }))
    .filter((x) => x.name);
}

export function computeFlowCosts({ md, agentsJson, budget }) {
  const names = nameToId(agentsJson);
  const byId = new Map(budget.rows.map((r) => [r.id, r]));
  const prefix = budget.STATIC_PREFIX_TOKENS;
  const declared = new Set(canonicalFlows(md).map((f) => f.name));

  const flows = [];
  for (const { name, block } of flowBlocks(md)) {
    if (!declared.has(name)) continue;
    const chain = parsePipeline(block, names);
    if (!chain.length) continue;
    // Цена на веригата = сума по стъпките от студения старт на всеки участник.
    let total = 0, work = 0;
    for (const id of chain) {
      const r = byId.get(id);
      if (!r) continue;
      total += r.perStartCold;
      work += r.perStartCold - prefix; // системен промпт + лична памет = реалната „работа"
    }
    const repeated = chain.length ? prefix * chain.length : 0;
    flows.push({
      name, steps: chain.length, chain,
      total, work, repeated,
      tax: total ? repeated / total : 0,
      // Колко би струвало, ако префиксът се плащаше ВЕДНЪЖ за цялата верига (system-ниво).
      ifSharedPrefix: work + prefix,
      savedIfShared: repeated - prefix,
    });
  }
  flows.sort((a, b) => b.total - a.total);
  const totals = {
    flows: flows.length,
    totalTokens: flows.reduce((s, f) => s + f.total, 0),
    repeatedTokens: flows.reduce((s, f) => s + f.repeated, 0),
    savedIfShared: flows.reduce((s, f) => s + f.savedIfShared, 0),
  };
  totals.taxShare = totals.totalTokens ? totals.repeatedTokens / totals.totalTokens : 0;
  return { flows, totals, prefix };
}

async function main() {
  if (!existsSync(ORCH)) { console.error("липсва _orchestration.md"); process.exit(2); }
  const md = readFileSync(ORCH, "utf8");
  const agentsJson = JSON.parse(readFileSync(AGENTS_JSON, "utf8"));
  const budget = computeBudget();
  const { flows, totals, prefix } = computeFlowCosts({ md, agentsJson, budget });

  if (JSON_OUT) { await emitJsonNow({ prefix, totals, flows }, 0); }

  const d = (s) => `\x1b[90m${s}\x1b[0m`, y = (s) => `\x1b[33m${s}\x1b[0m`, g = (s) => `\x1b[32m${s}\x1b[0m`;
  console.log(`\n🔗  Цена на колаборацията — ${flows.length} канонични потока (ОЦЕНКА, студен старт)\n`);
  console.log(`  Статичен префикс: ~${prefix} т · плаща се от ВСЯКА стъпка наново (кешът не се дели между агенти)\n`);
  console.log("  поток                                      стъпки    цена   повторен префикс   данък");
  for (const f of flows) {
    const tax = `${(f.tax * 100).toFixed(0)}%`;
    const mark = f.tax > TAX_WARN ? y("▲") : " ";
    console.log(`  ${mark}${f.name.slice(0, 40).padEnd(41)} ${String(f.steps).padStart(4)}  ${String(f.total).padStart(6)}  ${String(f.repeated).padStart(14)}  ${tax.padStart(6)}`);
  }
  console.log(`\n  Общо по всички потоци: ~${totals.totalTokens} т, от които ~${totals.repeatedTokens} т (${(totals.taxShare * 100).toFixed(0)}%) са ПОВТОРЕН префикс.`);
  console.log(`  ${d(`Ако префиксът се плащаше веднъж на верига (system-ниво), спестеното е ~${totals.savedIfShared} т.`)}`);
  console.log(d(`  Това е данъкът върху колаборацията: цената да добавиш още една стъпка към поток е цял префикс,`));
  console.log(d(`  не „само още малко". Затова къси, целенасочени вериги са по-евтини от дълги обзорни.\n`));

  // Числото, което прави провала ДЕЙСТВЕН: не „кои потоци", а докъде трябва да слезе префиксът.
  const cap = maxTolerablePrefix(flows);
  if (cap) {
    const slack = cap.cap - prefix;
    console.log(`  Таван на префикса, изведен от потоците: ~${cap.cap} т (обвързващ: „${cap.name}") · днес ${prefix} т`
      + (slack >= 0 ? g(` · запас ${slack} т`) : y(` · ПРЕВИШЕН с ${-slack} т`)));
    if (cap.cap < PREFIX_TOKEN_HARD) {
      console.log(d(`  Твърдият таван в token-budget (${PREFIX_TOKEN_HARD} т) е по-щедър от този — сам не те пази.`));
    }
    console.log("");
  }

  const over = flows.filter((f) => f.tax > TAX_WARN);
  if (over.length) console.log(y(`▲ ${over.length} потока плащат над ${(TAX_WARN * 100).toFixed(0)}% само за повторение: `) + over.map((f) => f.name).join(" · ") + "\n");
  else console.log(g("✓ нито един поток не плаща над тавана за повторение.\n"));
  process.exit(CHECK && over.length ? 1 : 0);
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
