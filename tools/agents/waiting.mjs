#!/usr/bin/env node
// waiting.mjs — „Чака теб“: всичко, което чака собственика, на едно място (искане, 23.11.2026).
//
// Защо: решенията на човека бяха разпилени — PR-и за сливане в GitHub, потоци, спрели „→ човек“ в
// дневника на веригите, твърдения с изтичащ срок в claims.json, остарял жив гейт, таван на разхода.
// Собственикът ги виждаше само ако някой го попита. Тук всеки източник е чиста функция, а изходът е
// `agents-dashboard/waiting.js` (`window.WAITING = …`) — таблото и артефактът на флота го показват.
//
//   node tools/agents/waiting.mjs                     # отчет в терминала
//   node tools/agents/waiting.mjs --prs prs.json --write   # снимка на отворените PR-и (от GitHub) + запис
//   node tools/agents/waiting.mjs --json
//
// PR-ите идват от снимка (`--prs`, същият вход като pr-triage.mjs), защото тук няма GitHub API. Без
// `--prs` се пази последната снимка от waiting.js с датата ѝ — таблото казва колко е стара.

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { budgetDecision } from "../../.claude/hooks/budget.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..", "..");
export const OUT = join(ROOT, "agents-dashboard", "waiting.js");
const LEVELS = ["спешно", "действие", "внимание", "инфо"];
const DAY = 86_400_000;

/** Отворените PR-и: готовите — действие; зависимостите — внимание; черновите — инфо. */
export function prItems(prs, { now = new Date(), days = 14 } = {}) {
  const out = [];
  // Стари чернови (без движение над `days` дни) — един общ ред: 40 отделни реда удавят важното.
  const since = now.getTime() - days * DAY;
  const stale = (prs || []).filter((p) => p.draft && Date.parse(p.updated_at || 0) < since);
  for (const p of prs || []) {
    if (stale.includes(p)) continue;
    const ref = `#${p.number}`, branch = p.head?.ref || "";
    const dep = /^dependabot\//.test(branch);
    const level = p.draft ? "инфо" : dep ? "внимание" : "действие";
    out.push({
      kind: "PR", ref, level, at: p.updated_at || "",
      title: dep ? `Обновяване на зависимост: ${p.title}` : p.title,
      action: p.draft ? "чернова — довърши или затвори" : "прегледай и слей (или кажи „бутай в мейн“)",
      url: p.html_url || "",
    });
  }
  out.sort((a, b) => LEVELS.indexOf(a.level) - LEVELS.indexOf(b.level) || String(b.at).localeCompare(String(a.at)));
  if (stale.length) out.push({
    kind: "PR", ref: "стари чернови", level: "инфо", at: "",
    title: `${stale.length} чернови без движение над ${days} дни (${stale.map((p) => `#${p.number}`).slice(0, 12).join(", ")}${stale.length > 12 ? "…" : ""})`,
    action: "прегледай веднъж: слей, довърши или затвори",
  });
  return out;
}

/** Потоци, чието последно предаване е към човек и не са затворени (последните `days` дни, до `max`). */
export function flowItems(lines, { now = new Date(), days = 14, max = 10, names = {} } = {}) {
  const flows = new Map();
  for (const raw of lines || []) {
    let e; try { e = JSON.parse(raw); } catch { continue; }
    if (!e?.id) continue;
    const f = flows.get(e.id) || { id: e.id };
    if (e.t === "start") { f.flow = e.flow; f.lead = e.lead; }
    if (e.t === "handoff") f.last = e;
    if (e.t === "close") f.closed = true;
    flows.set(e.id, f);
  }
  const since = now.getTime() - days * DAY;
  const out = [];
  for (const f of flows.values()) {
    const h = f.last;
    if (f.closed || !h || h.to !== "човек" || Date.parse(h.ts) < since) continue;
    const decision = /^\s*решение(?!\p{L})/iu.test(h.note || "");
    out.push({
      kind: decision ? "решение" : "поток", ref: f.id, at: h.ts,
      level: h.status === "блокер" ? "спешно" : decision ? "действие" : h.status === "наред" ? "инфо" : "внимание",
      title: decision ? h.note.replace(/^\s*решение\s*:?\s*/i, "") : `${f.flow && f.flow !== "авто" ? f.flow : "Поток"}: ${names[h.from] || h.from} → човек (${h.status || "—"})`,
      detail: decision ? `от ${names[h.from] || h.from}` : h.note || "",
      action: decision ? "реши и кажи в разговора" : "прочети предаването и реши: продължи, спри или затвори",
    });
  }
  return out.sort((a, b) => String(b.at).localeCompare(String(a.at))).slice(0, max);
}

const daysBetween = (a, b) => Math.floor((Date.parse(b) - Date.parse(a)) / DAY);

/** Твърдения в claims.json, изтекли или изтичащи до `within` дни. */
export function claimItems(reg, { today = new Date().toISOString().slice(0, 10), within = 7 } = {}) {
  const out = [];
  for (const c of reg?.claims || []) {
    const ttl = c.ttlDays ?? reg.ttlDays;
    const left = ttl - daysBetween(c.checkedAt, today);
    if (left > within) continue;
    out.push({
      kind: "твърдение", ref: c.id, left, level: left < 0 ? "спешно" : "внимание",
      title: left < 0 ? `Изтекло преди ${-left} дни — гейтът е червен` : `Изтича след ${left} дни`,
      detail: (c.agents || []).join(", "),
      action: "пресвери на живо с агентите от списъка (claims-audit --check)",
    });
  }
  return out.sort((a, b) => a.left - b.left);
}

/** Живият гейт: сменени входове след последната жива проверка. */
export function liveGateItem(changed) {
  if (!changed?.length) return null;
  return {
    kind: "жив гейт", ref: "live-gate", level: "действие",
    title: "Живият гейт е остарял", detail: `${changed.length} входа сменени след последната жива проверка`,
    action: "node tools/agents/live-gate.mjs",
  };
}

/**
 * Агенти над прага или над месечния таван. Правилото е ЕДНО — `budgetDecision` от `.claude/hooks/budget.mjs`
 * (същото, което спира куката), с одобренията за месеца. Кодаджията (23.11.2026): локално копие на правилото
 * не четеше `approved` и вдигаше фалшиво „спешно“, а тестовете минаваха, защото и те ползваха копието.
 */
export function budgetItems(spend, cfg, month) {
  if (!cfg) return [];
  const out = [];
  for (const [bucket, used] of Object.entries(spend?.byAgent || {})) {
    const d = budgetDecision({ bucket, month, spend: { byAgent: { [bucket]: used }, fleet: 0 }, cfg });
    if (d.block || d.warn) out.push({ kind: "таван", ref: bucket, used, level: d.block ? "спешно" : "внимание", title: d.why, action: d.block ? "вдигни тавана или одобри добавка в .claude/hooks/budgets.json" : "следи — при тавана пусканията спират" });
  }
  const f = budgetDecision({ bucket: "__fleet__", month, spend: { byAgent: {}, fleet: spend?.fleet || 0 }, cfg: { ...cfg, default: null, agents: {}, generic: null } });
  if (f.block || f.warn) out.push({ kind: "таван", ref: "флот", used: spend.fleet, level: f.block ? "спешно" : "внимание", title: f.why, action: "вдигни тавана на флота или одобри добавка" });
  return out.sort((a, b) => LEVELS.indexOf(a.level) - LEVELS.indexOf(b.level) || b.used - a.used);
}

/** Всичко заедно, подредено по ниво. */
export function collect({ prs = [], flowLines = [], reg = null, changed = [], spend = null, cfg = null, now = new Date(), prsAt = "", month, names = {} } = {}) {
  const m = month || now.toISOString().slice(0, 7);
  const items = [
    ...prItems(prs, { now }), ...flowItems(flowLines, { now, names }), ...claimItems(reg, { today: now.toISOString().slice(0, 10) }),
    ...[liveGateItem(changed)].filter(Boolean), ...budgetItems(spend, cfg, m),
  ].sort((a, b) => LEVELS.indexOf(a.level) - LEVELS.indexOf(b.level));
  const counts = { total: items.length };
  for (const l of LEVELS) counts[l] = items.filter((i) => i.level === l).length;
  // Суровата снимка на PR-ите се пази, за да може следващото пускане без `--prs` да я преизползва.
  const prsRaw = (prs || []).map((p) => ({ number: p.number, title: p.title, draft: !!p.draft, head: { ref: p.head?.ref || "" }, updated_at: p.updated_at || "", html_url: p.html_url || "" }));
  return { generatedAt: now.toISOString(), prsAt, counts, items, prs: prsRaw };
}

// Снимката се вгражда в inline <script> на артефакта, а заглавията идват от PR-и и бележки (външен текст):
// JSON.stringify не екранира `<`, затова `</script><img onerror=…>` в заглавие затваряше скрипта (Кодаджията).
export function renderJs(out) {
  const j = JSON.stringify(out).replace(/[<>&\u2028\u2029]/g, (c) => "\\u" + c.charCodeAt(0).toString(16).padStart(4, "0"));
  return `window.WAITING = ${j};\n`;
}

function previous() {
  try { const w = {}; new Function("window", readFileSync(OUT, "utf8"))(w); return w.WAITING || null; } catch { return null; }
}

async function main(argv) {
  const arg = (k) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : null; };
  const prev = previous();
  let prs = [], prsAt = prev?.prsAt || "";
  if (arg("--prs")) { prs = JSON.parse(readFileSync(arg("--prs"), "utf8")); prsAt = new Date().toISOString().slice(0, 10); }
  else if (prev?.prs) prs = prev.prs;
  const flowsFile = join(ROOT, ".claude", "agents", "_memory", "_flows.jsonl");
  const flowLines = existsSync(flowsFile) ? readFileSync(flowsFile, "utf8").split("\n") : [];
  let reg = null; try { reg = JSON.parse(readFileSync(join(HERE, "claims.json"), "utf8")); } catch { /* */ }
  let changed = [];
  try { const lg = await import("./live-gate.mjs"); changed = lg.changedSince(JSON.parse(readFileSync(lg.STAMP, "utf8")), lg.fileHashes()); } catch { /* */ }
  let spend = null, cfg = null;
  try {
    const b = await import("../../.claude/hooks/budget.mjs");
    const { loadRecords } = await import("./usage-report.mjs");
    const { loadPrices } = await import("../lib/usage.mjs");
    const { ourAgents } = await import("../../.claude/hooks/agent-cap.mjs");
    cfg = b.loadBudgets();
    spend = b.monthSpend(loadRecords(ROOT), new Date().toISOString().slice(0, 7), ourAgents(), loadPrices());
  } catch { /* без данни за разхода — без редове за тавана */ }
  let names = {};
  try { for (const a of JSON.parse(readFileSync(join(ROOT, "agents-dashboard", "agents.json"), "utf8")).agents) names[a.id] = a.name; } catch { /* */ }
  const out = collect({ prs, flowLines, reg, changed, spend, cfg, prsAt, names });
  if (argv.includes("--json")) { console.log(JSON.stringify(out, null, 2)); return; }
  if (argv.includes("--write")) { writeFileSync(OUT, renderJs(out)); console.log(`✓ ${OUT.replace(ROOT + "/", "")} · ${out.counts.total} чакат`); }
  for (const i of out.items) console.log(`[${i.level}] ${i.kind} ${i.ref} — ${i.title}${i.action ? ` → ${i.action}` : ""}`);
  if (!out.items.length) console.log("✓ нищо не чака човека");
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main(process.argv.slice(2));
