#!/usr/bin/env node
// tools/agents/oversee.mjs — „президентският" надзор над агентския екип (v1.0).
//
// „Ръката" на AI-джията като водещ/координатор: следи здравето на целия екип и
// докладва. НЕ пипа памет (курацията е на `tools/memory/curate.mjs`, човек решава
// сливания) — само чете и сигнализира. Fail-closed: излиза с код 1 при ТВЪРД проблем
// (сирак, рассинхрон табло/settings, липсваща доктрина), 0 иначе. Проверена поука БЕЗ източник е
// ПРЕДУПРЕЖДЕНИЕ (качествен сигнал), не твърд блокер — не влияе на изходния код.
//
// Употреба:
//   node tools/agents/oversee.mjs           # четим отчет
//   node tools/agents/oversee.mjs --json     # машинен изход (за табло/CI)
//
// Проверява за всеки агент:
//  - цялост: дефиниция (.claude/agents/<id>.md) ↔ памет (_memory/<id>.md) ↔
//    agents.json запис ↔ покритие в двата hook matcher-а (.claude/settings.json);
//  - здраве на паметта: брой проверени поуки, карантина, версия (agents.json vs поуки),
//    проверени поуки БЕЗ реален източник, почти-дубли (Jaccard ≥0.82), застарели
//    време-чувствителни поуки;
//  - екип: FALLBACK в index.html === agents.json; наличие на доктрината _memory/SECURITY.md;
//    сираци (запис без файл / файл без запис).

import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const AGENTS_DIR = join(ROOT, ".claude", "agents");
const MEM_DIR = join(AGENTS_DIR, "_memory");
const JSON_PATH = join(ROOT, "agents-dashboard", "agents.json");
const HTML_PATH = join(ROOT, "agents-dashboard", "index.html");
const SETTINGS_PATH = join(ROOT, ".claude", "settings.json");

const JSON_OUT = process.argv.includes("--json");
const STALE_DAYS = 45;
const MERGE_THRESHOLD = 0.82;
const TIME_SENSITIVE = /верси|latest|текущ|\bv?\d+\.\d+|\b20\d\d\b|API \d|stable|release/i;

// „Не-агентски" файлове в директориите
const NOT_AGENT_DEF = new Set(["README.md", "_orchestration.md"]);
const NOT_AGENT_MEM = new Set(["SECURITY.md", "PROTOCOL.md"]);

const read = (p) => (existsSync(p) ? readFileSync(p, "utf8") : null);
const norm = (s) =>
  s.toLowerCase().replace(/\*\*/g, "").replace(/[`'"„“”]/g, "").replace(/_\(.*?\)_/g, "")
    .replace(/\s+/g, " ").replace(/[.;,]+$/, "").trim();
const toks = (s) => new Set(norm(s).split(" ").filter((w) => w.length > 3));
const jaccard = (a, b) => { const A = toks(a), B = toks(b); if (!A.size || !B.size) return 0; let i = 0; for (const x of A) if (B.has(x)) i++; return i / (A.size + B.size - i); };
const lessonDate = (b) => { const m = b.match(/\*\*(\d{4}-\d{2}-\d{2})/); return m ? m[1] : null; };
// Забележка: детерминистично (без Date.now в тестовете); подава се „днес" отвън по желание.
const TODAY = process.env.OVERSEE_TODAY || new Date().toISOString().slice(0, 10);
const daysSince = (d) => (Date.parse(TODAY + "T00:00:00Z") - Date.parse(d + "T00:00:00Z")) / 86400000;

// Има ли поуката цитиран източник? Каноничният формат е `_(scope; verified; source)_` —
// източникът е ПОСЛЕДНИЯТ „;"-сегмент. Броим за източник всичко непразно и смислено (URL,
// file:line, член от закон, ИЛИ книга/автор като „Fowler, Refactoring 2nd ed."). Липсва само
// ако няма tail изобщо, или последният сегмент е празен / е просто „verified".
const tailHasSource = (tail) => {
  if (!tail) return false;
  const parts = String(tail).split(";").map((s) => s.trim()).filter(Boolean);
  if (parts.length < 2) return false; // очакваме поне scope + източник
  const src = parts[parts.length - 1].replace(/^["'„“”]+|["'„“”]+$/g, "").trim();
  return src.length > 3 && !/^(un)?verified$/i.test(src);
};
// Приема ЦЕЛИЯ текст на поуката (блок). Освен каноничния trailing `_(…; source)_`, признава и
// легитимните формати, които агентите ползват на практика: inline `(Източник: …)` / `(Source: …)`,
// гол URL (`https://…`), собствено-кодово потекло (`file:line`, `tools/…`, `src/…`, `.mjs`/`.ts`/
// `.js`). Всичките са реален източник — не са „измислени". Само поука БЕЗ нито едно от тях е „без източник".
const hasSource = (block) => {
  if (!block) return false;
  const m = String(block).match(/_\((.*?)\)_\s*$/);
  if (tailHasSource(m && m[1])) return true;
  if (/\((?:Източник|Source)\s*:\s*[^)]{4,}\)/i.test(block)) return true; // inline цитат
  if (/https?:\/\/\S{4,}/.test(block)) return true;                       // гол URL
  if (/\b[\w./-]+\.(?:mjs|ts|tsx|js|jsx|json|md|prisma|ejs|html)\b/i.test(block)) return true; // репо файл
  if (/\b(?:tools|src|prisma|app|deploy)\/[\w./-]+/.test(block)) return true; // репо път
  if (/\b[\w./-]+:\d+\b/.test(block)) return true;                        // file:line
  return false;
};

// Всяка поука е БЛОК: реда „- …" + всички следващи continuation редове (заглъбен текст,
// не нов bullet, не заглавие, не празен ред). Източникът `_(…)_` често стои на continuation
// ред — затова четем целия блок, не само първия ред (иначе многоредова поука се брои
// фалшиво „без източник", а Jaccard сравнява само първите редове).
function sectionBullets(md, heading) {
  const lines = md.split("\n");
  const start = lines.findIndex((l) => new RegExp(`^##\\s*${heading}`).test(l));
  if (start === -1) return [];
  const out = [];
  let cur = null;
  for (let i = start + 1; i < lines.length; i++) {
    const l = lines[i];
    if (/^##\s/.test(l)) break;
    if (l.trim().startsWith("- ")) { if (cur !== null) out.push(cur); cur = l.trim(); }
    else if (cur !== null) {
      if (l.trim() === "") { out.push(cur); cur = null; }
      else cur += " " + l.trim();
    }
  }
  if (cur !== null) out.push(cur);
  return out;
}

// --- Събери източниците на истина ---
const defIds = new Set(readdirSync(AGENTS_DIR).filter((f) => f.endsWith(".md") && !NOT_AGENT_DEF.has(f)).map((f) => f.replace(/\.md$/, "")));
const memIds = new Set(readdirSync(MEM_DIR).filter((f) => f.endsWith(".md") && !NOT_AGENT_MEM.has(f)).map((f) => f.replace(/\.md$/, "")));
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

// FALLBACK === agents.json ?
let fallbackOk = null;
const html = read(HTML_PATH);
if (html) {
  const M = "const FALLBACK = {", s = html.indexOf(M);
  if (s !== -1) {
    let i = s + M.length - 1, d = 0, inS = false, e = false, end = -1;
    for (; i < html.length; i++) { const c = html[i]; if (inS) { if (e) e = false; else if (c === "\\") e = true; else if (c === '"') inS = false; } else { if (c === '"') inS = true; else if (c === "{") d++; else if (c === "}") { d--; if (d === 0) { end = i; break; } } } }
    try { fallbackOk = JSON.stringify(JSON.parse(html.slice(s + M.length - 1, end + 1))) === JSON.stringify(aj); } catch { fallbackOk = false; }
  }
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
    const unsourced = verified.filter((b) => !hasSource(b));
    if (unsourced.length) r.warn.push(`${unsourced.length} проверени поуки без цитиран източник (закон „източник или нищо")`);
    // почти-дубли
    let dup = 0;
    for (let i = 0; i < verified.length; i++) for (let j = i + 1; j < verified.length; j++) if (jaccard(verified[i], verified[j]) >= MERGE_THRESHOLD) dup++;
    if (dup) r.warn.push(`${dup} почти-дубли (Jaccard ≥${MERGE_THRESHOLD}) → curate --merge-dups`);
    // застарели
    let stale = 0;
    for (const b of verified) { const d = lessonDate(b); if (d && TIME_SENSITIVE.test(b) && daysSince(d) > STALE_DAYS) stale++; }
    if (stale) r.warn.push(`${stale} застарели време-чувствителни поуки (>${STALE_DAYS}д)`);
    // версия vs поуки (само сигнал; засетите на mastery агенти може да имат по-малко)
    if (hasJson) {
      const g = aj.agents.find((a) => a.id === id);
      const ver = g.evolution?.[g.evolution.length - 1]?.version || "0.0.0";
      r.version = ver;
      if (+ver.split(".")[0] < 10) r.warn.push(`версия ${ver} < v10 (mastery)`);
    }
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

if (JSON_OUT) {
  console.log(JSON.stringify({ today: TODAY, agents: report, team, summary: { agents: report.length, hardFails, warns, fallbackOk, securityDoctrine } }, null, 2));
  process.exit(hardFails ? 1 : 0);
}

console.log(`\n🏛  Надзор над агентския екип — ${report.length} агента (${TODAY})\n`);
for (const r of report) {
  const badge = r.hard.length ? "✗" : r.warn.length ? "▲" : "✓";
  const stats = r.lessons != null ? ` [${r.lessons} поуки${r.quarantine ? `, ${r.quarantine} каран.` : ""}${r.version ? `, v${r.version}` : ""}]` : "";
  console.log(`${badge} ${r.id}${stats}`);
  r.hard.forEach((h) => console.log(`    ✗ ${h}`));
  r.warn.forEach((w) => console.log(`    ▲ ${w}`));
}
if (team.length) { console.log("\n— екип —"); team.forEach((t) => console.log(`  ${t.level === "hard" ? "✗" : "▲"} ${t.msg}`)); }
console.log(`\nИтог: ${report.length} агента · ${hardFails} твърди · ${warns} предупреждения · FALLBACK ${fallbackOk ? "ok" : fallbackOk === false ? "РАЗСИНХРОН" : "?"} · доктрина ${securityDoctrine ? "ok" : "ЛИПСВА"}`);
console.log(hardFails ? "СТАТУС: има твърди проблеми — виж ✗ по-горе." : "СТАТУС: екипът е здрав.");
process.exit(hardFails ? 1 : 0);
