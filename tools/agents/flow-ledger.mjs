#!/usr/bin/env node
// flow-ledger.mjs — лек дневник на оркестрационните вериги (HANDOFF-и).
//
// Защо: блокът „ПРЕДАВАНЕ" е текстов договор, но НИЩО не проверяваше, че веригата е завършила.
// Президентът (AI-джията) записва тук старт на поток + всяко предаване + затваряне → незавършените
// вериги стават ВИДИМИ (връзва се с „блокер с хистерезис": open поток с блокер, който не мърда).
// Append-only JSONL и ПРОСЛЕДЕН в git. (Дотук тук пишеше „git-ignored" — остаряло и подвеждащо:
// точно игнорирането направи trajectory гейта зелен от слепота, защото празен дневник се четеше
// като „чисто" вместо като „неизмерено". Дневникът е ground truth за пътя на оркестрацията, значи
// трябва да живее в историята, не в /tmp.)
//
//   node tools/agents/flow-ledger.mjs --start "SMTP" --lead vps-adjiyata --steps vps-adjiyata,kodadjiyata,pravniyat-razbirach
//     → връща flow id
//   node tools/agents/flow-ledger.mjs --handoff <id> --from vps-adjiyata --to kodadjiyata --status наред --note "SMTP тест ок"
//   node tools/agents/flow-ledger.mjs --close <id> --status завършен
//   node tools/agents/flow-ledger.mjs --report            # отворени/незавършени/блокирани вериги
//   node tools/agents/flow-ledger.mjs --report --json

import { readFileSync, writeFileSync, appendFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { emitJsonNow } from "../lib/emit.mjs";

const LEDGER = join(dirname(fileURLToPath(import.meta.url)), "..", "..", ".claude", "agents", "_memory", "_flows.jsonl");
const argv = process.argv.slice(2);
const JSON_OUT = argv.includes("--json");
const val = (f) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : undefined; };
const now = () => new Date().toISOString();
const OPEN_STALE_H = 24; // отворен поток без движение над това → флаг

const STATUS = new Set(["наред", "бележки", "блокер"]);
const CLOSE = new Set(["завършен", "блокиран", "изоставен"]);

function readAll() {
  if (!existsSync(LEDGER)) return [];
  return readFileSync(LEDGER, "utf8").split("\n").filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
}
function shortId() { return "f" + Math.random().toString(36).slice(2, 8); }

if (argv.includes("--start")) {
  const flow = val("--start"), lead = val("--lead"), steps = (val("--steps") || "").split(",").map((s) => s.trim()).filter(Boolean);
  if (!flow || !lead) { console.error("нужни: --start <име> --lead <агент> [--steps a,b,c]"); process.exit(2); }
  const id = shortId();
  appendFileSync(LEDGER, JSON.stringify({ t: "start", ts: now(), id, flow, lead, steps }) + "\n");
  console.log(JSON_OUT ? JSON.stringify({ id }) : id);
  process.exit(0);
}
if (argv.includes("--handoff")) {
  const id = val("--handoff"), from = val("--from"), to = val("--to"), status = val("--status") || "наред", note = val("--note") || "";
  if (!id || !from || !to) { console.error("нужни: --handoff <id> --from <агент> --to <агент> [--status наред|бележки|блокер] [--note …]"); process.exit(2); }
  if (!STATUS.has(status)) { console.error(`--status ∈ ${[...STATUS].join("|")}`); process.exit(2); }
  appendFileSync(LEDGER, JSON.stringify({ t: "handoff", ts: now(), id, from, to, status, note }) + "\n");
  if (!JSON_OUT) console.log(`↪ ${from} → ${to} [${status}]`);
  process.exit(0);
}
if (argv.includes("--close")) {
  const id = val("--close"), status = val("--status") || "завършен";
  if (!id) { console.error("нужни: --close <id> [--status завършен|блокиран|изоставен]"); process.exit(2); }
  if (!CLOSE.has(status)) { console.error(`--status ∈ ${[...CLOSE].join("|")}`); process.exit(2); }
  appendFileSync(LEDGER, JSON.stringify({ t: "close", ts: now(), id, status }) + "\n");
  if (!JSON_OUT) console.log(`■ ${id} затворен [${status}]`);
  process.exit(0);
}

// ── --report (по подразбиране) ──
const rows = readAll();
const flows = new Map();
for (const r of rows) {
  if (r.t === "start") flows.set(r.id, { ...r, handoffs: [], closed: null });
  else if (flows.has(r.id)) { const f = flows.get(r.id); if (r.t === "handoff") f.handoffs.push(r); else if (r.t === "close") f.closed = r; }
}
const nowMs = Date.now();
const analyzed = [...flows.values()].map((f) => {
  const last = f.handoffs.length ? f.handoffs[f.handoffs.length - 1] : f;
  const idleH = (nowMs - new Date(last.ts).getTime()) / 3.6e6;
  const openBlocker = !f.closed && f.handoffs.some((h) => h.status === "блокер");
  const stale = !f.closed && idleH > OPEN_STALE_H;
  return { id: f.id, flow: f.flow, lead: f.lead, steps: (f.steps || []).length, handoffs: f.handoffs.length, closed: f.closed?.status || null, openBlocker, stale, idleH: Math.round(idleH) };
});
const open = analyzed.filter((f) => !f.closed);
const problem = analyzed.filter((f) => f.openBlocker || f.stale);

if (JSON_OUT) { await emitJsonNow({ total: analyzed.length, open: open.length, problem, flows: analyzed }, problem.length ? 1 : 0); }

console.log(`\n🔗  Flow ledger — ${analyzed.length} потока (${open.length} отворени)\n`);
if (!analyzed.length) console.log("  (празно — президентът логва вериги с --start/--handoff/--close)");
for (const f of analyzed) {
  const badge = f.closed ? "\x1b[90m■\x1b[0m" : f.openBlocker ? "\x1b[31m⛔\x1b[0m" : f.stale ? "\x1b[33m⏳\x1b[0m" : "\x1b[32m▶\x1b[0m";
  console.log(`  ${badge} ${f.id} „${f.flow}" · lead ${f.lead} · ${f.handoffs}/${f.steps} предавания` + (f.closed ? ` · ${f.closed}` : f.stale ? ` · застоял ${f.idleH}ч` : "") + (f.openBlocker ? " · БЛОКЕР нерешен" : ""));
}
if (problem.length) console.log(`\n▲ ${problem.length} проблемни: нерешен блокер или застой >${OPEN_STALE_H}ч → човек да реши (пауза, не авто-продължаване).`);
process.exit(problem.length ? 1 : 0);
