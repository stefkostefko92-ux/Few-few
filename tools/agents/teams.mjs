#!/usr/bin/env node
// teams.mjs — екипите на флота: проверка, рутинг „откъде да започна“, карта на агента, _teams.md.
//
// Защо. 29 агента в плосък ростер и 24 потока в проза: никой не знаеше откъде да започне, а всяка
// верига плащаше префикса на всеки участник (flow-cost.mjs). Сега агентите са в малки екипи около
// реален поток — всеки с водач, вход/изход, човешка точка, тестови задачи, вероятни провали и метрики.
// Източникът е `.claude/agents/_teams.json`; `_teams.md` се рендерира оттук и не се пипа на ръка.
//
//   node tools/agents/teams.mjs --route "деплойни piuma"   # ЗАПОЧНИ ОТТУК: екип, агент, поток
//   node tools/agents/teams.mjs --card kodadjiyata          # картата, която агентът получава при старт
//   node tools/agents/teams.mjs --write                     # рендерира _teams.md
//   node tools/agents/teams.mjs --check                     # гейт: цялост + тестовите задачи + _teams.md свеж
//
// Рутингът е лексикален (ключови думи по началото на думата) — помощник за старт, не съдия. Ако
// не хване нищо, задачата отива при водача на флота (AI-джията), не се гадае.

import { readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = process.env.CLAUDE_PROJECT_DIR || join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const AGENTS_DIR = join(ROOT, ".claude", "agents");
export const TEAMS_FILE = join(AGENTS_DIR, "_teams.json");
export const TEAMS_MD = join(AGENTS_DIR, "_teams.md");
const DASH = join(ROOT, "agents-dashboard", "agents.json");

export function loadTeams(file = TEAMS_FILE) {
  return JSON.parse(readFileSync(file, "utf8"));
}

function names() {
  try {
    return Object.fromEntries(JSON.parse(readFileSync(DASH, "utf8")).agents.map((a) => [a.id, a.name]));
  } catch { return {}; }
}

/** Дефинициите на агентите (файловете без `_` и README). */
export function definedAgents(dir = AGENTS_DIR) {
  return readdirSync(dir).filter((f) => f.endsWith(".md") && !f.startsWith("_") && f !== "README.md").map((f) => f.slice(0, -3)).sort();
}

// ── рутинг ────────────────────────────────────────────────────────────────────────────────────
// Ключът е начало на дума („деплой“ хваща „деплойни“), не подниз — „ci“ не бива да хване „decision“.
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
function hits(text, keys) {
  const t = ` ${text.toLowerCase()} `;
  return keys.filter((k) => new RegExp(`(^|[^\\p{L}\\p{N}])${esc(k.toLowerCase())}`, "u").test(t));
}

/** Екип и агент за задача. Без попадение → водачът на флота. */
export function route(task, T = loadTeams()) {
  const scored = T.teams.map((team) => {
    const keys = [...new Set([...team.keys, ...team.members.flatMap((m) => T.agents[m]?.keys || [])])];
    return { team, score: hits(task, keys).length };
  }).sort((a, b) => b.score - a.score);
  const [best, second] = scored;
  if (!best || best.score === 0) {
    const team = T.teams.find((t) => t.members.includes(T.fallback));
    return { team: team.id, agent: T.fallback, score: 0, ambiguous: false, fallback: true };
  }
  const ambiguous = !!second && second.score === best.score;
  // Вътре в екипа: най-много попадения по ключовете на агента; равенство → водачът.
  const agents = best.team.members.map((m) => ({ m, s: hits(task, T.agents[m]?.keys || []).length }));
  const top = Math.max(...agents.map((a) => a.s));
  const agent = top === 0 || agents.find((a) => a.m === best.team.lead).s === top
    ? best.team.lead
    : agents.find((a) => a.s === top).m;
  return { team: best.team.id, agent, score: best.score, ambiguous, rival: ambiguous ? second.team.id : null, fallback: false };
}

// ── карта на агента (инжектира се при старт) ─────────────────────────────────────────────────────
/** Кратката карта за агента; празен низ, ако агентът не е в екип. Държи се под ~200 токена. */
export function cardFor(agent, T = loadTeams(), nm = names()) {
  const c = T.agents[agent];
  const team = T.teams.find((t) => t.members.includes(agent));
  if (!c || !team) return "";
  const n = (id) => nm[id] || id;
  const mates = team.members.filter((m) => m !== agent).map(n);
  return [
    `🧭 ТВОЯТА КАРТА — екип „${team.name}“ (водач: ${n(team.lead)}${mates.length ? `; с теб: ${mates.join(", ")}` : ""}). Мисия на екипа: ${team.mission}`,
    `- Тръгваш при: ${c.trigger}.`,
    `- Получаваш: ${c.receives}. Връщаш: ${c.outputs}.`,
    `- Предаваш на: ${c.handoff}.`,
    `- Човек одобрява: ${c.human}.`,
    `- Извън картата ти → Статус=блокер и Към=правилния екип (виж _teams.md), не го вършиш сам.`,
  ].join("\n");
}

// ── проверка ─────────────────────────────────────────────────────────────────────────────────
export function validate(T = loadTeams(), defined = definedAgents()) {
  const errs = [];
  const home = new Map();
  for (const t of T.teams) {
    for (const f of ["id", "name", "mission", "lead", "members", "keys", "workflow", "tests", "failureModes", "metrics"]) {
      if (t[f] == null || (Array.isArray(t[f]) && !t[f].length)) errs.push(`екип ${t.id || "?"}: липсва ${f}`);
    }
    if (!t.members?.includes(t.lead)) errs.push(`екип ${t.id}: водачът ${t.lead} не е член`);
    for (const m of t.members || []) {
      if (home.has(m)) errs.push(`${m} е в два екипа: ${home.get(m)} и ${t.id}`);
      home.set(m, t.id);
      if (!defined.includes(m)) errs.push(`екип ${t.id}: ${m} няма дефиниция в .claude/agents/`);
    }
    if (t.members?.length > 5) errs.push(`екип ${t.id}: ${t.members.length} членове — над 5 не е екип, а отдел`);
    if (!t.workflow?.human) errs.push(`екип ${t.id}: потокът няма човешка точка`);
    for (const s of t.workflow?.steps || []) if (!defined.includes(s.agent)) errs.push(`екип ${t.id}: стъпка с непознат агент ${s.agent}`);
    if ((t.workflow?.steps || []).length > 3) errs.push(`екип ${t.id}: поток над 3 стъпки — всяка плаща цял префикс (flow-cost.mjs)`);
    if (t.tests?.length !== 5) errs.push(`екип ${t.id}: тестовите задачи са ${t.tests?.length || 0}, не 5`);
    if (t.failureModes?.length !== 3) errs.push(`екип ${t.id}: вероятните провали са ${t.failureModes?.length || 0}, не 3`);
    for (const mt of t.metrics || []) {
      const script = mt.cmd?.split(" ")[1];
      if (!script || !existsSync(join(ROOT, script))) errs.push(`екип ${t.id}: метриката „${mt.name}“ сочи несъществуващ ${script}`);
    }
  }
  for (const a of defined) if (!home.has(a)) errs.push(`${a} няма домашен екип`);
  for (const a of defined) {
    const c = T.agents?.[a];
    if (!c) { errs.push(`${a} няма карта в agents`); continue; }
    for (const f of ["trigger", "receives", "outputs", "handoff", "human"]) if (!c[f]) errs.push(`${a}: картата няма ${f}`);
  }
  for (const a of Object.keys(T.agents || {})) if (!defined.includes(a)) errs.push(`карта за несъществуващ агент ${a}`);
  if (!defined.includes(T.fallback)) errs.push(`fallback ${T.fallback} не е агент`);
  // Тестовите задачи: всяка трябва да стигне до своя екип и агент, без равенство с друг екип.
  for (const t of T.teams) for (const c of t.tests || []) {
    const r = route(c.task, T);
    if (r.team !== c.team || r.agent !== c.agent) errs.push(`рутинг „${c.task}“ → ${r.team}/${r.agent}, очаквано ${c.team}/${c.agent}`);
    else if (r.ambiguous) errs.push(`рутинг „${c.task}“ е равен между ${r.team} и ${r.rival}`);
  }
  return errs;
}

// ── рендер на _teams.md ──────────────────────────────────────────────────────────────────────
export function render(T = loadTeams(), nm = names()) {
  const n = (id) => nm[id] || id;
  const cell = (s) => String(s).replace(/\|/g, "\\|");
  const L = [];
  L.push("# Екипите на флота", "");
  L.push("> Генерирано от `_teams.json` с `node tools/agents/teams.mjs --write` — не редактирай на ръка;");
  L.push("> `node tools/agents/teams.mjs --check` (в `gate.mjs`) пада, ако се разминат.", "");
  L.push("## ЗАПОЧНИ ОТТУК", "");
  L.push("1. `node tools/agents/teams.mjs --route \"<задачата с твои думи>\"` → екип, първи агент и потокът му.");
  L.push("2. Пусни този агент с шаблона за задача по-долу. Картата му (вход, изход, на кого предава, къде е човекът) му се подава при старт.");
  L.push("3. Не хваща нищо или е равно между два екипа → **" + n(T.fallback) + "** решава. Не гадай.");
  L.push("4. Една задача — един екип. Друг екип се включва само на гейт (неговата стъпка в потока), не „за всеки случай“.", "");
  L.push("## Екипите", "");
  L.push("| Екип | Водач | Членове | Мисия |", "|---|---|---|---|");
  for (const t of T.teams) L.push(`| **${t.name}** \`${t.id}\` | ${n(t.lead)} | ${t.members.map(n).join(", ")} | ${cell(t.mission)} |`);
  L.push("");
  for (const t of T.teams) {
    const w = t.workflow;
    L.push(`## ${t.name}`, "", `${t.mission}`, "");
    L.push(`**Основен поток — ${w.name}.** Тръгва при: ${w.trigger}`, "");
    L.push("```mermaid", "flowchart LR");
    L.push(`  start(["${w.trigger.replace(/"/g, "'")}"])`);
    w.steps.forEach((s, i) => L.push(`  s${i}["${n(s.agent)}"]`));
    L.push(`  h{{"Човек"}}`);
    L.push(`  start --> s0`);
    w.steps.forEach((s, i) => L.push(`  s${i} -- "${s.gate.replace(/"/g, "'")}" --> ${i + 1 < w.steps.length ? `s${i + 1}` : "h"}`));
    L.push("```", "");
    L.push("| Стъпка | Агент | Прави | Гейт към следващата |", "|---|---|---|---|");
    w.steps.forEach((s, i) => L.push(`| ${i + 1} | ${n(s.agent)} | ${cell(s.does)} | ${cell(s.gate)} |`));
    L.push("", `**Човешка точка:** ${w.human}`, "");
    L.push("**Тестови задачи (рутингът трябва да ги прати точно тук):**", "");
    for (const c of t.tests) L.push(`- „${c.task}“ → ${n(c.agent)}`);
    L.push("", "**Вероятни провали:**", "");
    t.failureModes.forEach((f, i) => L.push(`${i + 1}. ${f}`));
    L.push("", "**Какво мерим след пускане:**", "");
    for (const m of t.metrics) L.push(`- ${m.name} — \`${m.cmd}\``);
    L.push("");
  }
  L.push("## Картите на агентите", "");
  L.push("Всеки агент получава своята карта при старт (`memory-preload.mjs`).", "");
  L.push("| Агент | Екип | Тръгва при | Получава | Връща | Предава на | Човек одобрява |", "|---|---|---|---|---|---|---|");
  for (const t of T.teams) for (const m of t.members) {
    const c = T.agents[m];
    L.push(`| ${n(m)} | ${t.name} | ${cell(c.trigger)} | ${cell(c.receives)} | ${cell(c.outputs)} | ${cell(c.handoff)} | ${cell(c.human)} |`);
  }
  L.push("");
  L.push("## Шаблон за задача", "", "Подава се на агента при делегиране — само това, без цялата история:", "");
  L.push("```", "ЦЕЛ: <едно изречение — какво трябва да е вярно накрая>",
    "ВХОД: <файлове/diff/URL/данни — точно, с пътища>",
    "ГРАНИЦИ: <какво НЕ пипаш; продукт; само четене или и запис>",
    "ГОТОВО Е, КОГАТО: <гейт — команда, която минава, или проверим критерий>",
    "ИЗХОД: блок ПРЕДАВАНЕ (_memory/PROCEDURE.md)", "```", "");
  L.push("## Чести грешки", "");
  for (const s of [
    "Три агента за задача на един агент — всеки плаща цял префикс; потокът е до 3 стъпки.",
    "Агент извън картата си „помага“ в чужд домейн, вместо да предаде с блокер.",
    "Задача без „готово е, когато“ — агентът спира, когато му омръзне, не когато е готово.",
    "Пропусната човешка точка при пари, право, медицина или пускане.",
    "Нов агент вместо нова поука — пролука в екип се доказва с вериги в `flow-ledger.mjs`, не с усещане.",
  ]) L.push(`- ${s}`);
  L.push("", "## Какво НЕ строим още", "");
  for (const s of [
    "Агент, който вика агент: решението кой е следващият остава на оркестратора (виж `_orchestration.md`).",
    "Нови екипи или агенти, докато екипът няма записана верига в `flow-ledger.mjs`, която е спряла заради липсата.",
    "Автоматичен рутинг без човек при равенство: равенството отива при водача на флота.",
  ]) L.push(`- ${s}`);
  L.push("");
  return L.join("\n");
}

// ── CLI ──────────────────────────────────────────────────────────────────────────────────────
function main() {
  const argv = process.argv.slice(2);
  const arg = (f) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : null; };
  const T = loadTeams();
  if (argv.includes("--route")) {
    const task = arg("--route") || "";
    const r = route(task, T);
    const nm = names();
    const team = T.teams.find((t) => t.id === r.team);
    if (argv.includes("--json")) { console.log(JSON.stringify(r)); return; }
    console.log(`Екип: ${team.name} (${team.id})${r.fallback ? " — нищо не хвана, решава водачът на флота" : ""}${r.ambiguous ? ` — РАВНО с ${r.rival}, реши ти или ${nm[T.fallback]}` : ""}`);
    console.log(`Започни с: ${nm[r.agent] || r.agent} (${r.agent})`);
    console.log(`Поток „${team.workflow.name}“: ${team.workflow.steps.map((s) => nm[s.agent] || s.agent).join(" → ")} → човек`);
    console.log(`Човек: ${team.workflow.human}`);
    return;
  }
  if (argv.includes("--card")) {
    const c = cardFor(arg("--card"), T);
    if (!c) { console.error("✗ няма такъв агент в екипите"); process.exitCode = 1; return; }
    console.log(c);
    return;
  }
  if (argv.includes("--write")) {
    writeFileSync(TEAMS_MD, render(T));
    console.log(`✓ ${TEAMS_MD.slice(ROOT.length + 1)} (${T.teams.length} екипа)`);
    return;
  }
  const errs = validate(T);
  if (argv.includes("--check")) {
    const md = existsSync(TEAMS_MD) ? readFileSync(TEAMS_MD, "utf8") : "";
    if (md !== render(T)) errs.push("_teams.md не е свеж — пусни: node tools/agents/teams.mjs --write");
  }
  if (errs.length) { for (const e of errs) console.error(`✗ ${e}`); process.exitCode = 1; return; }
  const total = T.teams.reduce((s, t) => s + t.members.length, 0);
  console.log(`✓ ${T.teams.length} екипа · ${total} агента · ${T.teams.length * 5} тестови задачи минават`);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
