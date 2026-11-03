#!/usr/bin/env node
// memory-recall.mjs — достига ли поуката до агента, когато задачата е точно за нея?
//
// Защо (2026-09-23): изборът при старт гледаше само първите 40 реда на файла → 27% от проверените
// поуки изобщо можеха да бъдат избрани, без никой да го мери. Тук е термометърът: за извадка поуки
// от всеки агент задачата е самата поука (текстът без дата и мета) и питаме — влиза ли тя в бюджета?
// Това е „лесният режим" на извличането; ако поука не минава дори него, тя е недостижима, т.е.
// заплатена (записана, курирана, гейтвана) и никога използвана.
//
//   node tools/agents/memory-recall.mjs            # доклад по агент
//   node tools/agents/memory-recall.mjs --check    # ГЕЙТ: пада под прага (по подразбиране 0.95)
//   node tools/agents/memory-recall.mjs --json

import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { sectionLessons, lessonText } from "../lib/memory-core.mjs";
import { select } from "../lib/memory-retrieval.mjs";

const ROOT = process.env.CLAUDE_PROJECT_DIR || join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const MEM = join(ROOT, ".claude", "agents", "_memory");
const args = process.argv.slice(2);
const THRESHOLD = Number(process.env.MEMORY_RECALL_MIN || 0.95);
const PER_AGENT = 12;

/** Старият избор (до 2026-09-23): първите 40 реда, после припокриване на думи — за сравнение. */
function legacySelect(all, task, budget = 3200) {
  const norm = (s) => String(s).toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();
  const ws = (s) => new Set(norm(s).split(" ").filter((w) => w.length > 2));
  const q = ws(task);
  const pool = all.slice(0, 40).map((l, i) => { const t = ws(l); let o = 0; for (const w of q) if (t.has(w)) o++; return { l, o, i }; })
    .sort((a, b) => b.o - a.o || b.i - a.i).map((x) => x.l);
  const out = []; let used = 0;
  for (const l of pool) { const t = Math.round(l.length / 2.2); if (out.length && used + t > budget) break; out.push(l); used += t; }
  return out;
}

/** Детерминистична извадка: равномерно по целия файл (не само началото). */
const sample = (arr, k) => arr.length <= k ? arr : Array.from({ length: k }, (_, i) => arr[Math.floor((i + 0.5) * arr.length / k)]);

export function measure(memDir = MEM, { perAgent = PER_AGENT } = {}) {
  const rows = [];
  for (const f of readdirSync(memDir).filter((f) => /^[\w-]+\.md$/.test(f) && !/^(_shared|SECURITY|PROCEDURE|PROTOCOL|README)\.md$/.test(f))) {
    const all = sectionLessons(readFileSync(join(memDir, f), "utf8"), "verified");
    if (!all.length) continue;
    let now = 0, before = 0;
    const probes = sample(all, perAgent);
    for (const l of probes) {
      const task = lessonText(l);
      if (select(all, task).includes(l)) now++;
      if (legacySelect(all, task).includes(l)) before++;
    }
    rows.push({ agent: f.replace(/\.md$/, ""), lessons: all.length, probes: probes.length, now, before });
  }
  const P = rows.reduce((s, r) => s + r.probes, 0);
  return { rows, recall: rows.reduce((s, r) => s + r.now, 0) / (P || 1), legacy: rows.reduce((s, r) => s + r.before, 0) / (P || 1) };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const t0 = Date.now();
  const r = measure();
  if (args.includes("--json")) { process.stdout.write(JSON.stringify(r, null, 2) + "\n"); process.exit(0); }
  console.log(`🧠 Достижимост на паметта (задачата = самата поука, извадка по ${PER_AGENT} на агент)`);
  console.log(`   сега: ${(100 * r.recall).toFixed(1)}% · със стария избор (първите 40 реда): ${(100 * r.legacy).toFixed(1)}%  · ${Date.now() - t0} ms`);
  for (const x of r.rows.filter((x) => x.now < x.probes).sort((a, b) => a.now / a.probes - b.now / b.probes).slice(0, 8))
    console.log(`   ▲ ${x.agent.padEnd(22)} ${x.now}/${x.probes} (поуки: ${x.lessons})`);
  if (args.includes("--check")) {
    if (r.recall < THRESHOLD) { console.log(`✗ достижимост ${(100 * r.recall).toFixed(1)}% < ${100 * THRESHOLD}% — поуки се плащат, а не стигат до агента`); process.exit(1); }
    console.log(`✓ достижимост над прага ${100 * THRESHOLD}%`);
  }
}
