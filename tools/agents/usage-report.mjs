#!/usr/bin/env node
// usage-report.mjs — колко РЕАЛНО струват агентите и къде отиват парите (не оценка).
//
// Източници (дедуп по id): дневникът в клона agents/memory · дневникът в работното дърво · локалният
// буфер на тази машина. Цени: tools/agents/prices.json (с дата на сверка и срок).
//
//   node tools/agents/usage-report.mjs                    # доклад
//   node tools/agents/usage-report.mjs --backfill <папка> # внеси транскрипти (agent-*.jsonl) в буфера
//   node tools/agents/usage-report.mjs --check            # СЪВЕТВАЩО в гейта: неизмерено / остарели цени
//   node tools/agents/usage-report.mjs --json

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { summarizeTranscript, parseLedger, aggregate, loadPrices, costParts, USAGE_PATH, costOf, USAGE_RECORD_V } from "../lib/usage.mjs";
import { LOCAL_REF, REMOTE_REF, pendingUsagePath, appendPendingUsage } from "../lib/memory-branch.mjs";

const ROOT = process.env.CLAUDE_PROJECT_DIR || join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const args = process.argv.slice(2);
const TODAY = process.env.OVERSEE_TODAY || new Date().toISOString().slice(0, 10);
const git = (a) => { const r = spawnSync("git", a, { cwd: ROOT, encoding: "utf8", maxBuffer: 1 << 28 }); return r.status === 0 ? r.stdout : ""; };

export function loadRecords(root = ROOT) {
  const texts = [];
  for (const ref of [LOCAL_REF, REMOTE_REF]) texts.push(git(["show", `${ref}:${USAGE_PATH}`]));
  const wt = join(root, USAGE_PATH); if (existsSync(wt)) texts.push(readFileSync(wt, "utf8"));
  const p = pendingUsagePath(root); if (p && existsSync(p)) texts.push(readFileSync(p, "utf8"));
  return parseLedger(...texts);
}

function pricesAge(prices) {
  if (!prices?.checkedAt) return Infinity;
  return Math.round((Date.parse(TODAY) - Date.parse(prices.checkedAt)) / 864e5);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  if (args.includes("--backfill")) {
    const dir = args[args.indexOf("--backfill") + 1];
    // Запис от стара версия (преди дедупа по message.id — надут ~2.7×) се пресмята НАНОВО от
    // транскрипта; parseLedger взема по-късния запис за същия id. Актуален запис не се пипа.
    const have = new Map(loadRecords().map((r) => [r.id, r]));
    let n = 0, redone = 0;
    for (const f of readdirSync(dir).filter((f) => /^agent-.*\.jsonl$/.test(f))) {
      const rec = summarizeTranscript(join(dir, f));
      if (!rec) continue;
      const old = have.get(rec.id);
      if (old && (old.v || 1) >= USAGE_RECORD_V) continue;
      // eval етикетът се пази — иначе живата проверка би влязла в продукционните цифри.
      if (old?.eval && !rec.eval) rec.eval = old.eval;
      if (appendPendingUsage(ROOT, rec)) { n++; if (old) redone++; have.set(rec.id, rec); }
    }
    console.log(`✓ внесени ${n} пускания в буфера (${redone} пресметнати наново от стара версия) — изпрати с: node tools/lib/memory-branch.mjs --sync --flush-usage`);
    process.exit(0);
  }
  const all = loadRecords();
  // Живите проверки (eval-mode) се водят отделно — иначе изкривяват продукционната цена.
  const recs = all.filter((r) => !r.eval);
  const evals = all.filter((r) => r.eval);
  const prices = loadPrices();
  const a = aggregate(recs, prices);
  const startShare = recs.length ? recs.reduce((s, r) => s + (r.startCtx || 0), 0) / recs.reduce((s, r) => s + r.input + r.cacheRead + r.cacheWrite, 0) : 0;
  const firstCost = recs.reduce((s, r) => { const p = costParts({ ...r, cacheRead: 0, output: 0, input: 0, cacheWrite: r.startCtx || 0 }, prices); return s + (p ? p.cacheWrite : 0); }, 0);
  if (args.includes("--json")) { process.stdout.write(JSON.stringify({ ...a, startShare, firstCostShare: a.usd ? firstCost / a.usd : 0 }, null, 2) + "\n"); process.exit(0); }
  const age = pricesAge(prices);
  // --check (съветващо, в гейта): само сигналите, без пълния доклад; винаги exit 0.
  if (args.includes("--check")) {
    const stale = all.filter((r) => (r.v || 1) < USAGE_RECORD_V).length;
    const unpriced = recs.length - a.priced;
    const notes = [];
    if (!recs.length) notes.push("НЕИЗМЕРЕНО — няма записи за пускания");
    if (stale) notes.push(`${stale} записа от стара версия (надути) — пусни --backfill <папка с транскриптите>`);
    if (unpriced) notes.push(`${unpriced} пускания без цена в prices.json`);
    if (age > (prices?.ttlDays || 45)) notes.push(`цените са сверени преди ${age} дни (срок ${prices?.ttlDays})`);
    console.log(notes.length ? `▲ usage: ${notes.join(" · ")}` : `✓ usage: ${recs.length} пускания, всички поценени, цени на ${age} дни`);
    process.exit(0);
  }
  if (!recs.length) {
    console.log("▲ usage: НЕИЗМЕРЕНО — няма записи за пускания (буферът и клонът agents/memory са празни). Празно ≠ евтино.");
    process.exit(0);
  }
  const pct = (x) => `${Math.round(100 * x / (a.usd || 1))}%`;
  console.log(`💸 Реална употреба — ${a.priced} поценени пускания на агенти${a.runs > a.priced ? ` (+${a.runs - a.priced} без цена)` : ""} · ~$${a.usd.toFixed(0)} по цените на API`);
  console.log(`   къде: кеш-запис ${pct(a.parts.cacheWrite)} · кеш-четене ${pct(a.parts.cacheRead)} · изход ${pct(a.parts.output)} · вход ${pct(a.parts.input)}`);
  console.log(`   старт (системен промпт + дефиниция + доктрина + памет + задача): ${(100 * startShare).toFixed(1)}% от обработения вход · до ~${pct(firstCost)} от цената (горна граница: ако стартът се пише в кеша изцяло)`);
  console.log(`   ходове p50 ${a.turns.p50} · p90 ${a.turns.p90} · пускания с ≥60 хода: ${a.long.runs} (${pct(a.long.usd)} от цената)`);
  for (const [m, v] of Object.entries(a.byModel).sort((x, y) => y[1].usd - x[1].usd))
    console.log(`   ${m.padEnd(12)} ${String(v.runs).padStart(4)} пуск. · ~$${(v.usd / v.runs).toFixed(2)}/пускане · ср. ${Math.round(v.turns / v.runs)} хода`);
  console.log("   най-скъпи агенти:");
  for (const [ag, v] of Object.entries(a.byAgent).sort((x, y) => y[1].usd - x[1].usd).slice(0, 8))
    console.log(`     ${ag.padEnd(22)} ${String(v.runs).padStart(3)} пуск. · ~$${v.usd.toFixed(0).padStart(4)} · ср. ${Math.round(v.turns / v.runs)} хода`);
  if (evals.length) {
    console.log("   живи проверки (извън цифрите горе):");
    const by = {};
    for (const r of evals) { const k = `${r.eval} · ${r.agent}`; const c = costOf(r, prices) || 0; const x = (by[k] ??= { runs: 0, usd: 0, turns: 0 }); x.runs++; x.usd += c; x.turns += r.turns; }
    for (const [k, v] of Object.entries(by).sort()) console.log(`     ${k.padEnd(40)} ${v.runs} пуск. · ~${v.usd.toFixed(2)} · ср. ${Math.round(v.turns / v.runs)} хода`);
  }
  if (age > (prices?.ttlDays || 45)) console.log(`▲ цените са сверени преди ${age} дни (срок ${prices?.ttlDays}) — свери tools/agents/prices.json срещу справочника`);
  process.exit(0);
}
