#!/usr/bin/env node
// headroom.mjs — имат ли оценките ни запас да покажат подобрение.
//
// Защо (Anthropic, „Automating eval design and hillclimbing with Claude“, claude.dev, 28.09.2026):
// при база около 95% и нагоре оценката вече не различава по-добро от по-лошо — целта се мести към
// цена или латентност, или се добавят по-трудни задачи. Нашите живи гейтове бяха 7/7 и 3/3: таван.
//
//   node tools/agents/evals/headroom.mjs            # доклад (съветващ в gate.mjs)
//   node tools/agents/evals/headroom.mjs --json
// Изход 0 винаги, освен --strict: 1 при „няма запас“.

import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { emitJsonNow } from "../../lib/emit.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
export const SATURATED_RATE = 0.95;

/** Последните `window` записа: кои spec-ове никога не са падали (≥2 появи) и общият дял. */
export function headroom(records, { window = 6 } = {}) {
  const recent = records.filter((r) => Array.isArray(r.perSpec) && r.perSpec.length).slice(-window);
  const seen = new Map();
  for (const r of recent) for (const s of r.perSpec) {
    const cur = seen.get(s.id) || { appear: 0, clean: 0 };
    cur.appear++;
    if (s.passed === s.total) cur.clean++;
    seen.set(s.id, cur);
  }
  const judged = [...seen].filter(([, v]) => v.appear >= 2);
  const saturated = judged.filter(([, v]) => v.clean === v.appear).map(([id]) => id);
  const last = recent[recent.length - 1];
  const rate = last ? last.checkPass / Math.max(1, last.checkTotal) : null;
  const share = judged.length ? saturated.length / judged.length : 0;
  return { records: recent.length, judged: judged.length, saturated, share, lastRate: rate, noHeadroom: (rate ?? 0) >= SATURATED_RATE && share >= 0.8 };
}

async function runCli() {
  const f = join(HERE, "trend.jsonl");
  const recs = existsSync(f) ? readFileSync(f, "utf8").split("\n").filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean) : [];
  const r = headroom(recs);
  if (process.argv.includes("--json")) await emitJsonNow(r, 0);
  console.log(`headroom · последни ${r.records} записа · ${r.judged} spec-а с поне 2 появи · последен дял проверки ${r.lastRate == null ? "—" : Math.round(r.lastRate * 100) + "%"}`);
  console.log(`  никога не са падали: ${r.saturated.length} от ${r.judged} (${Math.round(r.share * 100)}%)`);
  if (r.noHeadroom) {
    console.log("\x1b[33m▲ няма запас\x1b[0m — оценките вече не различават по-добро от по-лошо. Добави трудни spec-ове от реални провали (error-ledger) с база под 80% или мери цена/латентност при същото pass^k.");
    process.exit(process.argv.includes("--strict") ? 1 : 0);
  }
  console.log("✓ има запас.");
}

if (import.meta.url === `file://${process.argv[1]}`) await runCli();
