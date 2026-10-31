#!/usr/bin/env node
// fold-audit.mjs — кои двойки агенти почти винаги вървят заедно (кандидати за сливане в един агент).
//
// Защо (Anthropic, „Building agents: When to fold subagents into your main agent loop“, 22.10.2026):
// подагент си струва при раздут контекст, паралелна работа на свеж контекст или конфликтни
// инструкции; иначе сливането често дава по-добро качество при по-ниска цена и латентност.
// „Fold in by shared context starting with subagents that have the most use“ — двойка, която си
// предава почти всяка задача, плаща два старта и едно предаване („развален телефон“) за общ контекст.
//
//   node tools/agents/fold-audit.mjs            # доклад
//   node tools/agents/fold-audit.mjs --json
// Само доклад: сливането е решение на собственика (флотът е 29 агента по домейни).
// Източници: .claude/agents/_memory/_flows.jsonl (предавания) · tools/agents/evals/usage.jsonl (пускания).

import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { emitJsonNow } from "../lib/emit.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const HUB = new Set(["ai-djiyata", "човек", "human", "собственик", "оркестратор", "main"]);

const lines = (f) => (existsSync(f) ? readFileSync(f, "utf8").split("\n").filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean) : []);

/** Двойки (неподредени) → брой предавания; пускания по агент; съотношение към по-рядко пускания. */
export function coupling(flows, usage, { minPairs = 4, minRatio = 0.4 } = {}) {
  const runs = new Map();
  for (const u of usage) if (u.agent) runs.set(u.agent, (runs.get(u.agent) || 0) + 1);
  const pairs = new Map();
  for (const f of flows) {
    if (f.t !== "handoff" || !f.from || !f.to) continue;
    const a = String(f.from).trim(), b = String(f.to).trim();
    if (a === b || HUB.has(a) || HUB.has(b) || !runs.has(a) || !runs.has(b)) continue;
    const key = [a, b].sort().join(" ↔ ");
    pairs.set(key, (pairs.get(key) || 0) + 1);
  }
  const rows = [...pairs].map(([key, n]) => {
    const [a, b] = key.split(" ↔ ");
    const ratio = n / Math.min(runs.get(a), runs.get(b));
    return { pair: key, handoffs: n, runsA: runs.get(a), runsB: runs.get(b), ratio: Math.round(ratio * 100) / 100, candidate: n >= minPairs && ratio >= minRatio };
  }).sort((x, y) => y.ratio - x.ratio || y.handoffs - x.handoffs);
  return { agents: runs.size, handoffs: flows.filter((f) => f.t === "handoff").length, rows };
}

async function runCli() {
  const r = coupling(lines(join(ROOT, ".claude", "agents", "_memory", "_flows.jsonl")), lines(join(ROOT, "tools", "agents", "evals", "usage.jsonl")));
  if (process.argv.includes("--json")) await emitJsonNow(r, 0);
  console.log(`fold-audit · ${r.agents} агента с пускания · ${r.handoffs} предавания (без AI-джията и човека)`);
  const c = r.rows.filter((x) => x.candidate);
  for (const x of r.rows.slice(0, 12)) console.log(`  ${x.candidate ? "◆" : "·"} ${x.pair} — ${x.handoffs} предавания · ${x.runsA}/${x.runsB} пускания · ${Math.round(x.ratio * 100)}% от по-редкия`);
  console.log(c.length
    ? `\n◆ ${c.length} кандидата за сливане (≥4 предавания и ≥40% от пусканията на по-редкия). Решава собственикът; преди сливане — сравнение на същите spec-ове преди/след.`
    : "\nНяма двойка, която да върви заедно достатъчно често — флотът по домейни се държи.");
}

if (import.meta.url === `file://${process.argv[1]}`) await runCli();
