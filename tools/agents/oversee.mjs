#!/usr/bin/env node
// tools/agents/oversee.mjs — „президентският" надзор над агентския екип (v2.0).
//
// „Ръката" на AI-джията като водещ/координатор: следи здравето на целия екип и
// докладва. НЕ пипа памет (курацията е на `tools/memory/curate.mjs`, човек решава
// сливания) — само чете и сигнализира. Fail-closed: излиза с код 1 при ТВЪРД проблем
// (сирак, рассинхрон табло/settings, липсваща доктрина), 0 иначе. Проверена поука БЕЗ източник е
// ПРЕДУПРЕЖДЕНИЕ (качествен сигнал), не твърд блокер — не влияе на изходния код.
//
// Употреба:
//   node tools/agents/oversee.mjs                    # четим отчет
//   node tools/agents/oversee.mjs --json             # машинен изход (за табло/CI)
//   node tools/agents/oversee.mjs --snapshot [път]   # запиши моментна снимка (метрики) за тренд
//   node tools/agents/oversee.mjs --baseline <път>   # сравни с предишна снимка → регресии (тренд)
//
// Проверява за всеки агент:
//  - цялост: дефиниция (.claude/agents/<id>.md) ↔ памет (_memory/<id>.md) ↔
//    agents.json запис ↔ покритие в двата hook matcher-а (.claude/settings.json);
//  - здраве на паметта: брой проверени поуки, карантина (+ аларма ако надвишава проверените),
//    версия, проверени поуки БЕЗ реален източник (с знаменател), почти-дубли (Jaccard ≥0.82),
//    застарели време-чувствителни поуки;
//  - екип: FALLBACK в index.html === agents.json; наличие на доктрината _memory/SECURITY.md; сираци;
//  - тренд (по избор): регресия спрямо предишна снимка — спад на поуки, ръст на карантина, нов сирак.

import { readdirSync, readFileSync, existsSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  STALE_DAYS, MERGE_THRESHOLD, TIME_SENSITIVE,
  jaccard, lessonDate, daysSince, hasSource, sectionBullets, extractBalancedObject,
} from "./oversee-lib.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const AGENTS_DIR = join(ROOT, ".claude", "agents");
const MEM_DIR = join(AGENTS_DIR, "_memory");
const JSON_PATH = join(ROOT, "agents-dashboard", "agents.json");
const HTML_PATH = join(ROOT, "agents-dashboard", "index.html");
const SETTINGS_PATH = join(ROOT, ".claude", "settings.json");
const DEFAULT_SNAP = join(MEM_DIR, ".oversee-snapshot.json");

const argv = process.argv.slice(2);
const JSON_OUT = argv.includes("--json");
const STRICT = argv.includes("--strict"); // exit≠0 и при предупреждения (за CI, който иска нулев дрейф)
// стойност на флаг с по избор аргумент: път след флага (ако не е нов флаг), иначе true, иначе null
const flagVal = (name) => { const i = argv.indexOf(name); return i < 0 ? null : (argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : true); };
const snapshotArg = flagVal("--snapshot");
const baselineArg = flagVal("--baseline");

const TODAY = process.env.OVERSEE_TODAY || new Date().toISOString().slice(0, 10);
const read = (p) => (existsSync(p) ? readFileSync(p, "utf8") : null);

// #4 постнота на дефиницията: раздутото разрежда адхеренцията (както „CLAUDE.md < 200 реда").
// Праг над реалното p75 (~144) — флагва само истинските извънредни случаи, не всекидневния ръст.
const DEF_LINE_WARN = 200;
// #2 явна повторна проверка: поука може да носи „re-verify: YYYY-MM-DD"; минала дата → застаряла,
// независимо дали е време-чувствителна по регекс. Дава ръчен контрол над TTL за критични факти.
const REVERIFY_RE = /re-?verify:?\s*(\d{4}-\d{2}-\d{2})/i;

// „Не-агентски" файлове в директориите
const NOT_AGENT_DEF = new Set(["README.md", "_orchestration.md"]);
const NOT_AGENT_MEM = new Set(["SECURITY.md", "PROTOCOL.md", "PROCEDURE.md"]);

// --- Събери източниците на истина ---
const defIds = new Set(readdirSync(AGENTS_DIR).filter((f) => f.endsWith(".md") && !NOT_AGENT_DEF.has(f)).map((f) => f.replace(/\.md$/, "")));
const memIds = new Set(readdirSync(MEM_DIR).filter((f) => f.endsWith(".md") && !NOT_AGENT_MEM.has(f) && !f.startsWith(".")).map((f) => f.replace(/\.md$/, "")));
const aj = JSON.parse(readFileSync(JSON_PATH, "utf8"));
const jsonIds = new Set(aj.agents.map((a) => a.id));

const settings = readFileSync(SETTINGS_PATH, "utf8");
// Вземи matcher-ите САМО от куките за агентската памет (SubagentStart/SubagentStop). Ако вземем всеки
// „matcher" в settings.json, добавянето на несвързана кука (напр. PreToolUse „Bash") би маркирало ВСЕКИ
// агент като „липсва в hook matcher" → лъжлив твърд провал. Регекс fallback ако JSON не се парсне.
const matcherIds = [];
try {
  const sj = JSON.parse(settings);
  for (const ev of ["SubagentStart", "SubagentStop"])
    for (const h of (sj.hooks?.[ev] || []))
      if (typeof h.matcher === "string") matcherIds.push(new Set(h.matcher.split("|")));
} catch {
  for (const m of settings.matchAll(/"matcher":\s*"([^"]+)"/g)) matcherIds.push(new Set(m[1].split("|")));
}

const securityDoctrine = existsSync(join(MEM_DIR, "SECURITY.md"));
// Общата процедура (единен цикъл + red lines + HANDOFF), инжектирана във всеки агент — задължителна.
const procedureDoctrine = (() => {
  const f = join(MEM_DIR, "PROCEDURE.md");
  return existsSync(f) && sectionBullets(readFileSync(f, "utf8"), "Процедура").length > 0;
})();

// FALLBACK === agents.json ?  (балансираният парсер е изнесен в oversee-lib за тестваемост)
let fallbackOk = null;
const html = read(HTML_PATH);
if (html) {
  const block = extractBalancedObject(html, "const FALLBACK = {");
  if (block !== null) { try { fallbackOk = JSON.stringify(JSON.parse(block)) === JSON.stringify(aj); } catch { fallbackOk = false; } }
}

const allIds = [...new Set([...defIds, ...memIds, ...jsonIds])].sort();
const report = [];
let hardFails = 0, warns = 0;

for (const id of allIds) {
  const r = { id, hard: [], warn: [] };
  const hasDef = defIds.has(id), hasMem = memIds.has(id), hasJson = jsonIds.has(id);
  if (!hasDef) r.hard.push("липсва дефиниция .claude/agents/" + id + ".md");
  if (!hasMem) r.hard.push("липсва памет _memory/" + id + ".md");
  if (!hasJson) r.hard.push("липсва запис в agents.json");
  matcherIds.forEach((set, idx) => { if (hasDef && !set.has(id)) r.hard.push(`не е в hook matcher #${idx + 1} (settings.json)`); });

  if (hasMem) {
    const md = readFileSync(join(MEM_DIR, id + ".md"), "utf8");
    const verified = sectionBullets(md, "Проверени поуки");
    const quarantine = sectionBullets(md, "Карантина");
    r.lessons = verified.length;
    r.quarantine = quarantine.length;
    // проверени поуки без цитиран източник (качествен сигнал, не структурен срив → предупреждение)
    // — със ЗНАМЕНАТЕЛ: „3/100" значи различно от „3/5" (без база абсолютното число подвежда).
    const unsourced = verified.filter((b) => !hasSource(b));
    r.unsourced = unsourced.length;
    if (unsourced.length) r.warn.push(`${unsourced.length}/${verified.length} проверени поуки без цитиран източник (закон „източник или нищо")`);
    // почти-дубли
    let dup = 0;
    for (let i = 0; i < verified.length; i++) for (let j = i + 1; j < verified.length; j++) if (jaccard(verified[i], verified[j]) >= MERGE_THRESHOLD) dup++;
    r.dups = dup;
    if (dup) r.warn.push(`${dup} почти-дубли (Jaccard ≥${MERGE_THRESHOLD}) → curate --merge-dups`);
    // застарели: време-чувствителни >STALE_DAYS, ИЛИ с явна минала „re-verify:" дата (#2)
    let stale = 0;
    for (const b of verified) {
      const d = lessonDate(b);
      const rv = b.match(REVERIFY_RE);
      const explicitDue = rv && daysSince(rv[1], TODAY) > 0;
      const implicitStale = d && TIME_SENSITIVE.test(b) && daysSince(d, TODAY) > STALE_DAYS;
      if (explicitDue || implicitStale) stale++;
    }
    r.stale = stale;
    if (stale) r.warn.push(`${stale}/${verified.length} застарели поуки (време-чувствителни >${STALE_DAYS}д или с минала re-verify дата)`);
    // карантината надвишава проверените → самообучаващият цикъл затлачва (гейтът реже повече, отколкото минава)
    if (quarantine.length > verified.length) r.warn.push(`карантина (${quarantine.length}) надвишава проверените (${verified.length}) — цикълът затлачва`);
    // версия vs поуки (само сигнал; засетите на mastery агенти може да имат по-малко)
    if (hasJson) {
      const g = aj.agents.find((a) => a.id === id);
      const ver = g.evolution?.[g.evolution.length - 1]?.version || "0.0.0";
      r.version = ver;
      if (+ver.split(".")[0] < 10) r.warn.push(`версия ${ver} < v10 (mastery)`);
    }
  }
  // #4 постнота на дефиницията — историческите „## vX.Y" секции трябва да слизат в паметта/докове
  if (hasDef) {
    const defLines = readFileSync(join(AGENTS_DIR, id + ".md"), "utf8").split("\n").length;
    r.defLines = defLines;
    if (defLines > DEF_LINE_WARN) r.warn.push(`дефиниция ${defLines} реда (>${DEF_LINE_WARN}) — раздутото разрежда адхеренцията; премести исторически „vX.Y" секции в паметта/докове`);
  }
  if (r.hard.length) hardFails += r.hard.length;
  if (r.warn.length) warns += r.warn.length;
  report.push(r);
}

// глобални (екипни) проверки
const team = [];
if (fallbackOk === false) { team.push({ level: "hard", msg: "FALLBACK в index.html НЕ съвпада с agents.json" }); hardFails++; }
if (fallbackOk === null) { team.push({ level: "warn", msg: "не намерих FALLBACK блок в index.html" }); warns++; }
if (!securityDoctrine) { team.push({ level: "hard", msg: "липсва доктрината _memory/SECURITY.md (инжектира се във всеки агент)" }); hardFails++; }
if (!procedureDoctrine) { team.push({ level: "hard", msg: "липсва общата процедура _memory/PROCEDURE.md (единен цикъл + HANDOFF, инжектира се във всеки агент)" }); hardFails++; }
// Fail-loud при ТОЧЕН сблъсък (не near-dup): два агента с еднакъв accent/name чупят разпознаваемостта.
const dupKey = (k) => { const seen = new Set(), dups = new Set(); for (const a of aj.agents) { const v = a[k]; if (v == null) continue; if (seen.has(v)) dups.add(v); else seen.add(v); } return [...dups]; };
for (const acc of dupKey("accent")) { team.push({ level: "hard", msg: `дублиран accent „${acc}" при два агента — сменѝ единия` }); hardFails++; }
for (const nm of dupKey("name")) { team.push({ level: "hard", msg: `дублирано име „${nm}" при два агента` }); hardFails++; }

// --- тренд: сравни с предишна снимка (по избор) → регресии ---
const trend = [];
const snapshot = { today: TODAY, agents: Object.fromEntries(report.map((r) => [r.id, { lessons: r.lessons ?? null, quarantine: r.quarantine ?? null, version: r.version ?? null, hard: r.hard.length, warn: r.warn.length }])) };
if (baselineArg) {
  const path = typeof baselineArg === "string" ? baselineArg : DEFAULT_SNAP;
  const prevRaw = read(path);
  if (!prevRaw) { trend.push({ level: "warn", msg: `няма базлайн снимка (${path}) — първо пусни --snapshot` }); warns++; }
  else {
    let prev; try { prev = JSON.parse(prevRaw); } catch { prev = null; }
    if (!prev?.agents) { trend.push({ level: "warn", msg: `повредена базлайн снимка (${path})` }); warns++; }
    else {
      for (const [id, cur] of Object.entries(snapshot.agents)) {
        const p = prev.agents[id];
        if (!p) { trend.push({ level: "warn", msg: `нов агент спрямо базлайна: ${id}` }); warns++; continue; }
        if (cur.lessons != null && p.lessons != null && cur.lessons < p.lessons) { trend.push({ level: "warn", msg: `${id}: РЕГРЕСИЯ на поуки ${p.lessons}→${cur.lessons}` }); warns++; }
        if (cur.quarantine != null && p.quarantine != null && cur.quarantine - p.quarantine >= 5) { trend.push({ level: "warn", msg: `${id}: карантина расте ${p.quarantine}→${cur.quarantine} (+${cur.quarantine - p.quarantine})` }); warns++; }
        if (cur.hard > p.hard) { trend.push({ level: "warn", msg: `${id}: нов твърд проблем спрямо базлайна (${p.hard}→${cur.hard})` }); warns++; }
      }
      for (const id of Object.keys(prev.agents)) if (!snapshot.agents[id]) { trend.push({ level: "warn", msg: `изчезнал агент спрямо базлайна: ${id}` }); warns++; }
    }
  }
}
if (snapshotArg) {
  const path = typeof snapshotArg === "string" ? snapshotArg : DEFAULT_SNAP;
  writeFileSync(path, JSON.stringify(snapshot, null, 2) + "\n");
  if (!JSON_OUT) console.log(`📸  снимка записана: ${path}`);
}

if (JSON_OUT) {
  console.log(JSON.stringify({ today: TODAY, agents: report, team, trend, summary: { agents: report.length, hardFails, warns, fallbackOk, securityDoctrine, procedureDoctrine } }, null, 2));
  process.exit(hardFails || (STRICT && warns) ? 1 : 0);
}

console.log(`\n🏛  Надзор над агентския екип — ${report.length} агента (${TODAY})\n`);
for (const r of report) {
  const badge = r.hard.length ? "✗" : r.warn.length ? "▲" : "✓";
  const stats = r.lessons != null ? ` [${r.lessons} поуки${r.quarantine ? `, ${r.quarantine} каран.` : ""}${r.version ? `, v${r.version}` : ""}${r.defLines ? `, ${r.defLines}р деф` : ""}]` : "";
  console.log(`${badge} ${r.id}${stats}`);
  r.hard.forEach((h) => console.log(`    ✗ ${h}`));
  r.warn.forEach((w) => console.log(`    ▲ ${w}`));
}
if (team.length) { console.log("\n— екип —"); team.forEach((t) => console.log(`  ${t.level === "hard" ? "✗" : "▲"} ${t.msg}`)); }
if (trend.length) { console.log("\n— тренд —"); trend.forEach((t) => console.log(`  ▲ ${t.msg}`)); }
console.log(`\nИтог: ${report.length} агента · ${hardFails} твърди · ${warns} предупреждения · FALLBACK ${fallbackOk ? "ok" : fallbackOk === false ? "РАЗСИНХРОН" : "?"} · доктрина ${securityDoctrine ? "ok" : "ЛИПСВА"} · процедура ${procedureDoctrine ? "ok" : "ЛИПСВА"}`);
console.log(hardFails ? "СТАТУС: има твърди проблеми — виж ✗ по-горе." : "СТАТУС: екипът е здрав.");
process.exit(hardFails || (STRICT && warns) ? 1 : 0);
