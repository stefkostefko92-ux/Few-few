// usage-capture.test.mjs — реалната употреба на токени (2026-09-23). Измерено върху 517 пускания: над
// 90% от цената е в цикъла с инструменти, а отчетността на флота беше оценка на статичния текст (<8%).
// Проверяваме: точно сумиране от транскрипта · нула текст от задачата в записа · правилна цена по модел ·
// доставка в agents/memory без да се пипа клонът на задачата · записите оцеляват при сгъване на main ·
// артефактът не се републикува заради запис за употреба.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { summarizeTranscript, priceOf, costOf, aggregate, loadPrices, parseLedger } from "../lib/usage.mjs";
import { MutationNotApplied } from "../lib/mutation.mjs";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const LIB = join(REPO, "tools", "lib", "memory-branch.mjs");
const HOOK = join(REPO, ".claude", "hooks", "usage-capture.mjs");
const ARTSYNC = join(REPO, ".claude", "hooks", "artifact-sync.mjs");
const ENV = { GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@t", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@t" };
const git = (cwd, ...a) => { const r = spawnSync("git", a, { cwd, encoding: "utf8", env: { ...process.env, ...ENV } }); return (r.stdout + r.stderr).trim(); };
const TASK_SECRET = "ТАЙНА-ЗАДАЧА-клиент-Иванов";
let v = 0;

/** Транскрипт на субагент: 3 хода с употреба, 2 инструмента, текст на задачата вътре. */
function transcript(dir, name = "agent-abc123.jsonl") {
  const u = (i, cr, cw, o) => ({ input_tokens: i, cache_read_input_tokens: cr, cache_creation_input_tokens: cw, output_tokens: o });
  const lines = [
    { timestamp: "2026-09-23T06:00:00.000Z", effort: "high", message: { role: "user", content: [{ type: "text", text: TASK_SECRET }] } },
    { timestamp: "2026-09-23T06:00:05.000Z", message: { model: "claude-opus-5", role: "assistant", usage: u(3, 0, 20000, 100), content: [{ type: "tool_use", id: "1", name: "Read", input: {} }] } },
    { timestamp: "2026-09-23T06:00:06.000Z", message: { role: "user", content: [{ type: "tool_result", tool_use_id: "1", content: "x".repeat(4000) }] } },
    { timestamp: "2026-09-23T06:00:10.000Z", message: { model: "claude-opus-5", role: "assistant", usage: u(1, 20000, 1500, 200), content: [{ type: "tool_use", id: "2", name: "Grep", input: {} }] } },
    { timestamp: "2026-09-23T06:00:20.000Z", message: { model: "claude-opus-5", role: "assistant", usage: u(1, 21500, 300, 700), content: [{ type: "text", text: "готово" }] } },
  ];
  const p = join(dir, name);
  writeFileSync(p, lines.map((l) => JSON.stringify(l)).join("\n") + "\n");
  return p;
}

test("сумиране: ходове, токени по вид, инструменти, обем, старт, връх, продължителност — точно", () => {
  const d = mkdtempSync(join(tmpdir(), "usage-"));
  try {
    const r = summarizeTranscript(transcript(d), { agentType: "kodadjiyata" });
    assert.deepEqual(
      { turns: r.turns, input: r.input, cacheRead: r.cacheRead, cacheWrite: r.cacheWrite, output: r.output, tools: r.tools, startCtx: r.startCtx, peakCtx: r.peakCtx, durationSec: r.durationSec, model: r.model, effort: r.effort, agent: r.agent },
      { turns: 3, input: 5, cacheRead: 41500, cacheWrite: 21800, output: 1000, tools: 2, startCtx: 20003, peakCtx: 21801, durationSec: 20, model: "opus-5", effort: "high", agent: "kodadjiyata" });
    assert.equal(r.resultBytes, 4000);
    assert.ok(!JSON.stringify(r).includes(TASK_SECRET), "ЗАПИСЪТ Е САМО ЧИСЛА — нула текст от задачата");
  } finally { rmSync(d, { recursive: true, force: true }); }
});

test("цени: най-дългото съвпадение (opus-5-5 ≠ opus-5), изрично кеш-четене, дата отзад се маха", () => {
  const p = loadPrices();
  assert.equal(priceOf("opus-5-5", p).id, "opus-5-5");
  assert.equal(priceOf("claude-opus-5", p).id, "opus-5");
  assert.equal(priceOf("haiku-4-5-20251001", p).id, "haiku-4-5");
  const rec = { model: "opus-5", input: 1e6, cacheRead: 1e6, cacheWrite: 1e6, output: 1e6 };
  assert.equal(costOf(rec, p), 5 + 0.5 + 6.25 + 25);
  assert.equal(costOf({ ...rec, model: "fable-5-1" }, p), 10 + 0.25 + 12.5 + 50, "Fable 5.1: кеш-четене $0.25, не 0.1×");
  const a = aggregate([{ ...rec, agent: "x", turns: 70 }, { ...rec, model: "sonnet-5", agent: "y", turns: 10 }], p);
  assert.equal(a.long.runs, 1);
  assert.deepEqual(parseLedger('{"id":"a","n":1}\n{"id":"a","n":2}\n{"id":"b"}').map((r) => r.id), ["a", "b"], "дедуп по id");
  assert.equal(parseLedger('{"id":"a","turns":3}\n{"id":"a","turns":17}')[0].turns, 17, "върнат от DoD агент: по-късният (пълният) запис побеждава");
});

function repo() {
  const root = mkdtempSync(join(tmpdir(), "usage-repo-"));
  const origin = join(root, "origin.git"), work = join(root, "work");
  git(root, "init", "-q", "--bare", "-b", "main", origin);
  mkdirSync(join(work, "agents-dashboard"), { recursive: true });
  mkdirSync(join(work, ".claude/agents/_memory"), { recursive: true });
  git(work, "init", "-q", "-b", "main");
  writeFileSync(join(work, "agents-dashboard/index.html"), "<p>табло</p>\n");
  writeFileSync(join(work, ".claude/agents/_memory/testagent.md"), "# П\n\n## Проверени поуки (verified)\n\n## Карантина\n");
  git(work, "add", "-A"); git(work, "commit", "-q", "-m", "init");
  git(work, "remote", "add", "origin", origin); git(work, "push", "-q", "origin", "main"); git(work, "fetch", "-q", "origin");
  return { root, origin, work };
}

test("кука → буфер в .git → доставка в agents/memory; клонът на задачата е чист; записът оцелява при сгъване на main", async () => {
  const f = repo();
  try {
    const tp = transcript(f.root);
    const env = { ...process.env, ...ENV, CLAUDE_PROJECT_DIR: f.work, AGENT_MEMORY_SYNC: "0" };
    const r = spawnSync(process.execPath, [HOOK], { input: JSON.stringify({ hook_event_name: "SubagentStop", agent_transcript_path: tp, agent_type: "kodadjiyata", effort: { level: "high" } }), encoding: "utf8", env });
    assert.equal(r.status, 0, r.stderr);
    assert.equal(git(f.work, "status", "--porcelain"), "", "клонът на задачата е чист");
    const lib = await import(pathToFileURL(LIB).href + `?v=${++v}`);
    const fl = lib.flushUsage(f.work);
    assert.equal(fl.flushed, 1);
    const sy = lib.syncMemoryBranch(f.work, {});
    assert.ok(sy.pushed, sy.steps.join(" · "));
    const onBranch = git(f.work, "show", "origin/agents/memory:tools/agents/evals/usage.jsonl");
    assert.match(onBranch, /"agent":"kodadjiyata"/);
    assert.ok(!onBranch.includes(TASK_SECRET));
    // main напредва → сгъване: дневникът за употреба не бива да изчезне.
    writeFileSync(join(f.work, "продукт.txt"), "x\n"); git(f.work, "add", "-A"); git(f.work, "commit", "-q", "-m", "продукт"); git(f.work, "push", "-q", "origin", "main");
    const sy2 = lib.syncMemoryBranch(f.work, {});
    assert.ok(sy2.steps.includes("сгънат main"), sy2.steps.join(" · "));
    assert.match(git(f.work, "show", "origin/agents/memory:tools/agents/evals/usage.jsonl"), /"agent":"kodadjiyata"/, "оцелява при сгъване");
    assert.equal(lib.flushUsage(f.work).flushed, 0, "буферът е изчистен");
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("МУТАЦИЯ: сгъване без append-only обединяване изтрива телеметрията (тестът хапе)", async () => {
  const f = repo();
  try {
    const src = readFileSync(LIB, "utf8");
    const m = src.replace("  Object.assign(files, appendOnlyUnion(cwd, base, other));\n", "");
    if (m === src) throw new MutationNotApplied(LIB);
    const tmp = LIB.replace(/\.mjs$/, `.mutant-${process.pid}-${++v}.mjs`);
    writeFileSync(tmp, m);
    try {
      const lib = await import(pathToFileURL(tmp).href);
      const { appendPendingUsage } = lib;
      appendPendingUsage(f.work, { v: 1, id: "run1", agent: "seo", model: "sonnet-5", turns: 1, input: 1, cacheRead: 0, cacheWrite: 0, output: 1 });
      lib.flushUsage(f.work); lib.syncMemoryBranch(f.work, {});
      writeFileSync(join(f.work, "продукт.txt"), "x\n"); git(f.work, "add", "-A"); git(f.work, "commit", "-q", "-m", "продукт"); git(f.work, "push", "-q", "origin", "main");
      lib.syncMemoryBranch(f.work, {});
      assert.doesNotMatch(git(f.work, "show", "origin/agents/memory:tools/agents/evals/usage.jsonl"), /run1/, "мутантът губи записа при сгъване");
    } finally { rmSync(tmp, { force: true }); }
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("артефактът НЕ се републикува заради запис за употреба (сравнява се дървото на таблото)", async () => {
  const f = repo();
  try {
    const lib = await import(pathToFileURL(LIB).href + `?v=${++v}`);
    lib.publishLessons(f.work, { testagent: { verified: ["- **2026-09-23:** поука _(т; verified; https://example.org/a)_"] } });
    const tip = git(f.work, "rev-parse", "agents/memory");
    const env = { ...process.env, CLAUDE_PROJECT_DIR: f.work };
    spawnSync(process.execPath, [join(REPO, "tools/docs/build-artifact.mjs"), "--mark-published", tip], { encoding: "utf8", env });
    lib.appendPendingUsage(f.work, { v: 1, id: "run9", agent: "seo", model: "sonnet-5", turns: 1, input: 1, cacheRead: 0, cacheWrite: 0, output: 1 });
    lib.flushUsage(f.work);
    assert.notEqual(git(f.work, "rev-parse", "agents/memory"), tip, "клонът на паметта е напреднал");
    assert.equal(spawnSync(process.execPath, [ARTSYNC], { input: "{}", encoding: "utf8", env }).status, 0, "таблото не е пипано → без републикуване");
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});
