// budget.mjs — месечен таван на разхода по агент (искане на собственика, 23.11.2026).
//
// Защо: таванът „10 общи агента на сесия“ брои пускания, не пари. Октомври 2026 струваше $6 309, от тях
// ~$4 900 от общи и workflow агенти; ноември — $692, с Кодаджията на $144. Без таван разходът се вижда чак
// в `usage-report.mjs`, след като е направен. Тук: предупреждение при прага (`warnAt`, 80%) и спиране над
// тавана, докато собственикът не го вдигне или не одобри добавка за месеца.
//
// Живее в `.claude/hooks/`, защото guard-self пази тази папка: субагент не може да пише тук, а главната
// сесия пита човека. Иначе агент, който е стигнал тавана, би могъл сам да го вдигне.
//
// Конфигурация: `.claude/hooks/budgets.json` (USD на календарен месец, по UTC):
//   warnAt   — дял от тавана, над който куката предупреждава;
//   default  — таван на наш агент без собствен ред; agents — собствени тавани;
//   generic  — общ кош за всички общи агенти (general-purpose, workflow, fork, Explore…);
//   fleet    — таван на целия флот;
//   approved — { "ГГГГ-ММ": { "<агент>|generic|fleet": добавка в USD } } — одобрение само за месеца.
//
// Числата идват от реалната употреба (`loadRecords` в usage-report), вкл. живите проверки — и те харчат.
// Грешка в конфигурацията, липсващи цени или изключение → СПИРА (fail-closed, Разбивача 23.11.2026):
// собственикът поиска „спира, докато не одобря“, а fail-open изключваше тавана с един лош JSON.
// Данните (prices.json, usage.jsonl, буферът и флагът за оценки) са под guard-self като конфигурацията.

import { readFileSync, existsSync } from "node:fs";
import { join, dirname, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { costOf, loadPrices, parseLedger, USAGE_PATH } from "../../tools/lib/usage.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
export const BUDGETS_FILE = join(HERE, "budgets.json");
export const GENERIC = "generic";

export function loadBudgets(file = process.env.AGENT_BUDGETS_FILE_TEST || BUDGETS_FILE) {
  try { return JSON.parse(readFileSync(file, "utf8")); } catch { return null; }
}

/**
 * Дневникът на разхода — същите четири източника като `loadRecords` в usage-report (клонът `agents/memory`
 * локално и на origin, работното дърво, буферът в .git), но без да внася инструментите на паметта: всичко,
 * което тази кука импортира, guard-self вдига на ниво A (23.11.2026).
 */
export function loadUsage(root) {
  const git = (a) => { const r = spawnSync("git", a, { cwd: root, encoding: "utf8", maxBuffer: 1 << 28 }); return r.status === 0 ? r.stdout : ""; };
  const texts = ["refs/heads/agents/memory", "refs/remotes/origin/agents/memory"].map((ref) => git(["show", `${ref}:${USAGE_PATH}`]));
  const wt = join(root, USAGE_PATH); if (existsSync(wt)) texts.push(readFileSync(wt, "utf8"));
  const pend = git(["rev-parse", "--git-path", "agents-usage.pending.jsonl"]).trim();
  if (pend) { const p = isAbsolute(pend) ? pend : join(root, pend); if (existsSync(p)) texts.push(readFileSync(p, "utf8")); }
  return parseLedger(...texts);
}

/**
 * Разходът за месеца: по наш агент, общият кош и целият флот. Живите проверки се БРОЯТ (Разбивача, N1):
 * те харчат същите пари, а ако не се броят, `eval-mode.mjs on` сваля тавана тихо.
 */
export function monthSpend(records, month, ours, prices) {
  const byAgent = {};
  let fleet = 0;
  for (const r of records || []) {
    if (!String(r.ts || "").startsWith(month)) continue;
    const c = costOf(r, prices) || 0;
    const bucket = ours.has(r.agent) ? r.agent : GENERIC;
    byAgent[bucket] = (byAgent[bucket] || 0) + c;
    fleet += c;
  }
  return { byAgent, fleet };
}

const num = (x) => (typeof x === "number" && Number.isFinite(x) && x > 0 ? x : null);
const usd = (x) => `$${x.toFixed(2)}`;

/**
 * Решение за едно пускане: { block, warn, why }. `bucket` е id на наш агент или GENERIC.
 * Таванът на агента и на флота се смятат с одобрената добавка за месеца.
 */
// Разбивача (N3): всяка грешка изключваше тавана. Собственикът иска „спира, докато не одобря“ — таван,
// който не може да се провери (липсващ или невалиден budgets.json, низ вместо число), спира пускането.
const unverifiable = (why) => ({ block: true, warn: false, why: `таванът не може да се провери (${why}) — собственикът да поправи .claude/hooks/budgets.json или да одобри.` });

export function budgetDecision({ bucket, month, spend, cfg }) {
  const ok = { block: false, warn: false, why: "" };
  if (!cfg || typeof cfg !== "object") return unverifiable("няма валиден budgets.json");
  const extra = (k) => num(cfg.approved?.[month]?.[k]) || 0;
  const capBase = bucket === GENERIC ? num(cfg.generic) : num(cfg.agents?.[bucket]) ?? num(cfg.default);
  const fleetBase = num(cfg.fleet);
  if (!fleetBase) return unverifiable("fleet не е положително число");
  if (bucket !== "__fleet__" && !capBase) return unverifiable(`няма таван за „${bucket}“ (default/generic)`);
  const warnAt = num(cfg.warnAt) && cfg.warnAt < 1 ? cfg.warnAt : 0.8;
  const who = bucket === GENERIC ? "общите агенти" : bucket;
  const where = `Вдига го собственикът в .claude/hooks/budgets.json (таван или approved["${month}"]["${bucket}"]).`;
  const used = spend?.byAgent?.[bucket] || 0;
  const fleet = spend?.fleet || 0;
  {
    const cap = fleetBase + extra("fleet");
    if (fleet >= cap) return { block: true, warn: false, why: `флотът е похарчил ${usd(fleet)} от ${usd(cap)} за ${month}. Вдига го собственикът в .claude/hooks/budgets.json (fleet или approved["${month}"]["fleet"]).` };
  }
  if (capBase) {
    const cap = capBase + extra(bucket);
    if (used >= cap) return { block: true, warn: false, why: `${who}: ${usd(used)} от ${usd(cap)} за ${month}. ${where}` };
    if (used >= warnAt * cap) return { block: false, warn: true, why: `${who} е на ${Math.round((used / cap) * 100)}% от тавана за ${month} (${usd(used)} от ${usd(cap)}).` };
  }
  {
    const cap = fleetBase + extra("fleet");
    if (fleet >= warnAt * cap) return { block: false, warn: true, why: `флотът е на ${Math.round((fleet / cap) * 100)}% от тавана за ${month} (${usd(fleet)} от ${usd(cap)}).` };
  }
  return ok;
}

/**
 * Решението за едно извикване на Agent/Task/Workflow. Workflow отива в общия кош (пуска много агенти
 * наведнъж — пази се главно таванът на флота). Живата проверка се брои и спира като всичко друго.
 */
export function budgetCheck(payload, ours, { month = new Date().toISOString().slice(0, 7), records = [], prices = loadPrices(), cfg = loadBudgets() } = {}) {
  if (!prices?.models?.length) return { bucket: "", ...unverifiable("няма цени в tools/agents/prices.json") };
  const tool = String(payload?.tool_name || "");
  const type = String(payload?.tool_input?.subagent_type || "general-purpose");
  const bucket = tool === "Workflow" || !ours.has(type) ? GENERIC : type;
  const spend = monthSpend(records, month, ours, prices);
  return { bucket, ...budgetDecision({ bucket, month, spend, cfg }) };
}
