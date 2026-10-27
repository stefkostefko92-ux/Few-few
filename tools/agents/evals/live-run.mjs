#!/usr/bin/env node
// live-run.mjs — пуска НАШИ агенти така, както тичат в продукция, и връща дословния им отговор.
//
// Защо (2026-10-27): паметта, процедурата и блокът ПРЕДАВАНЕ не стигаха до агентите от юли, а всички
// тестове бяха зелени — те мереха какво връщат куките, не какво агентът вижда. Единственото, което хвана
// дупката, беше агент, пуснат истински. Този двигател прави това повторяемо:
//   • всяко пускане е НОВА headless сесия (`claude -p`) — уменията и дефинициите се зареждат наново, както
//     в нова работна сесия; в текущата сесия умение, създадено по-късно, не стига до агентите;
//   • в ИЗОЛИРАНО копие на репото (git worktree на дадения ref) — агентът не може да пипне работното дърво;
//   • главната сесия пуска агента през Agent tool — минава SubagentStart/SubagentStop куките, умението
//     agent-doctrine, картата и паметта, т.е. целия продукционен път;
//   • Stop куките на оркестратора (session-dod, artifact-sync) са махнати само в копието: те съдят главната
//     сесия и подменяха отговора; AGENT_MEMORY_SYNC=0 — оценката мери, не пише в паметта.
//
//   node tools/agents/evals/live-run.mjs --jobs kasadjiyata:kasadjiyata:3,seo:seo --out <папка> [--ref HEAD]
//     job = <агент>:<spec id>[:опити]  → <папка>/<spec>.txt или <spec>.<n>.txt
//
// Изисква `claude` CLI с вход (локално или в облачна сесия). Без него → изход 2 с ясно съобщение.

import { execFile, execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
export const ROOT = join(HERE, "..", "..", "..");
export const ORCHESTRATOR_STOP_HOOKS = /session-dod|artifact-sync/;
export const ALLOWED = ["Agent", "Read", "Grep", "Glob", "WebFetch", "WebSearch"];

/** Обвивката за главната сесия: пусни агента със задачата дословно, върни дословно отговора. */
export function wrapperPrompt(agent, task) {
  return `Пусни нашия агент ${agent} през Agent tool (subagent_type: ${agent}) със задачата по-долу, дословно и без добавки. ` +
    `След това върни САМО дословния му отговор — без коментар, без съкращения, без обобщение.\n\nЗАДАЧА:\n${task}`;
}

/** Махни Stop куките на оркестратора от settings на копието (агентските куки остават). */
export function stripOrchestratorStop(settings) {
  const s = JSON.parse(JSON.stringify(settings));
  if (Array.isArray(s.hooks?.Stop)) {
    s.hooks.Stop = s.hooks.Stop
      .map((g) => ({ ...g, hooks: (g.hooks || []).filter((h) => !ORCHESTRATOR_STOP_HOOKS.test(String(h.command || ""))) }))
      .filter((g) => g.hooks.length);
  }
  return s;
}

/** `агент:spec[:k]` → задачи с имена на изходите. */
export function expandJobs(spec, readTask) {
  const jobs = [];
  for (const item of String(spec || "").split(",").map((x) => x.trim()).filter(Boolean)) {
    const [agent, specId, k] = item.split(":");
    const n = Math.max(1, Number(k) || 1);
    const task = readTask(specId || agent);
    for (let i = 1; i <= n; i++) jobs.push({ agent, specId: specId || agent, name: n > 1 ? `${specId || agent}.${i}.txt` : `${specId || agent}.txt`, task });
  }
  return jobs;
}

/** JSON изходът на `claude -p --output-format json` → текст и цена; невалиден → суров текст. */
export function parseResult(out) {
  try { const j = JSON.parse(out); return { text: String(j.result || ""), costUsd: Number(j.total_cost_usd) || 0 }; }
  catch { return { text: String(out || ""), costUsd: 0 }; }
}

export function claudeAvailable() {
  try { execFileSync("claude", ["--version"], { stdio: "ignore" }); return true; } catch { return false; }
}

/** Изолирано копие на ref-а с махнати Stop куки на оркестратора. Връща пътя и функция за почистване. */
export function makeWorktree(ref = "HEAD") {
  const dir = mkdtempSync(join(tmpdir(), "live-run-"));
  rmSync(dir, { recursive: true, force: true });
  execFileSync("git", ["-C", ROOT, "worktree", "add", "--detach", dir, ref], { stdio: "ignore" });
  const sp = join(dir, ".claude", "settings.json");
  writeFileSync(sp, JSON.stringify(stripOrchestratorStop(JSON.parse(readFileSync(sp, "utf8"))), null, 2) + "\n");
  const cleanup = () => { try { execFileSync("git", ["-C", ROOT, "worktree", "remove", "--force", dir], { stdio: "ignore" }); } catch { rmSync(dir, { recursive: true, force: true }); } };
  return { dir, cleanup };
}

/** Пуска задачите (конкурентно) в копието. Връща [{...job, ok, text, costUsd, err, seconds}]. */
export async function runJobs(jobs, { wt, concurrency = 3, timeoutMs = 900000, onDone = () => {} } = {}) {
  const results = new Array(jobs.length);
  let i = 0;
  const one = (j) => new Promise((resolve) => {
    const t0 = Date.now();
    execFile("claude", ["-p", wrapperPrompt(j.agent, j.task), "--allowedTools", ...ALLOWED, "--output-format", "json"],
      { cwd: wt, timeout: timeoutMs, maxBuffer: 1 << 26, env: { ...process.env, CLAUDE_PROJECT_DIR: wt, AGENT_MEMORY_SYNC: "0" } },
      (err, stdout, stderr) => {
        const r = parseResult(stdout);
        resolve({ ...j, ok: !err && !!r.text.trim(), text: r.text, costUsd: r.costUsd, err: err ? String(stderr || err.message).slice(0, 300) : "", seconds: Math.round((Date.now() - t0) / 1000) });
      });
  });
  await Promise.all(Array.from({ length: Math.min(concurrency, jobs.length) }, async () => {
    while (i < jobs.length) { const k = i++; results[k] = await one(jobs[k]); onDone(results[k]); }
  }));
  return results;
}

async function main(argv) {
  const val = (f) => { const k = argv.indexOf(f); return k >= 0 ? argv[k + 1] : null; };
  if (!claudeAvailable()) { console.error("live-run: няма `claude` CLI с вход — живото пускане не е възможно тук."); process.exit(2); }
  const out = val("--out");
  if (!out || !val("--jobs")) { console.error("употреба: live-run.mjs --jobs агент:spec[:k],… --out <папка> [--ref HEAD] [--concurrency 3]"); process.exit(2); }
  const specDir = join(ROOT, "tools", "agents", "evals", "specs");
  const jobs = expandJobs(val("--jobs"), (id) => {
    const f = join(specDir, id + ".json");
    if (!existsSync(f)) throw new Error(`няма spec „${id}"`);
    return JSON.parse(readFileSync(f, "utf8")).task;
  });
  mkdirSync(out, { recursive: true });
  const { dir, cleanup } = makeWorktree(val("--ref") || "HEAD");
  try {
    const res = await runJobs(jobs, { wt: dir, concurrency: Number(val("--concurrency")) || 3, onDone: (r) => {
      if (r.ok) writeFileSync(join(out, r.name), r.text);
      console.log(`${r.ok ? "✓" : "✗"} ${r.name} · ${r.agent} · ${r.text.length} зн. · $${r.costUsd.toFixed(2)} · ${r.seconds}s${r.err ? " · " + r.err : ""}`);
    } });
    const cost = res.reduce((a, r) => a + r.costUsd, 0);
    console.log(`готово: ${res.filter((r) => r.ok).length}/${res.length} · $${cost.toFixed(2)}`);
    process.exitCode = res.every((r) => r.ok) ? 0 : 1;
  } finally { cleanup(); }
}

if (import.meta.url === `file://${process.argv[1]}`) await main(process.argv.slice(2));
