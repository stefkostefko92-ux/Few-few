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
  assert.equal(priceOf("claude-sonnet-5-5", p).id, "sonnet-5-5", "своят ред, не префиксът sonnet-5");
  assert.equal(priceOf("claude-opus-5-5[1m]", p).id, "opus-5-5", "суфиксът на контекста не пречи");
  const noRow = { ...p, models: p.models.filter((r) => r.id !== "sonnet-5-5") };
  assert.equal(priceOf("claude-sonnet-5-5", noRow), null, "нова версия без ред → без цена, не тихо по старата");
  assert.equal(costOf({ model: "sonnet-5-5", input: 0, cacheRead: 1e6, cacheWrite: 0, output: 0 }, p), 0.1, "Sonnet 5.5: кеш-четене 0.05×");
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

test("по-новата версия на записа печели, дори ако стар източник е прочетен по-късно", () => {
  const recs = parseLedger('{"id":"a","v":2,"turns":5}', '{"id":"a","v":1,"turns":17}');
  assert.equal(recs[0].turns, 5);
});

test("backfill: запис с по-висока версия за съществуващ id стига до дневника; същата версия — не", async () => {
  const f = repo();
  try {
    const lib = await import(pathToFileURL(LIB).href + `?v=${++v}`);
    const rec = { id: "runV", agent: "seo", model: "sonnet-5", turns: 1, input: 1, cacheRead: 0, cacheWrite: 0, output: 1 };
    lib.appendPendingUsage(f.work, { ...rec, v: 1 }); assert.equal(lib.flushUsage(f.work).flushed, 1);
    lib.appendPendingUsage(f.work, { ...rec, v: 1, output: 9 }); assert.equal(lib.flushUsage(f.work).flushed, 0, "същата версия не се дублира");
    lib.appendPendingUsage(f.work, { ...rec, v: 2, output: 5 }); assert.equal(lib.flushUsage(f.work).flushed, 1, "по-висока версия се добавя");
    const led = parseLedger(git(f.work, "show", "agents/memory:tools/agents/evals/usage.jsonl"));
    assert.equal(led.find((r) => r.id === "runV").output, 5, "четецът взима v2");
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

// Регресия 2026-11-02: SubagentStop без agent_type (вътрешни помощници) не е „общ“ агент.
test("етикет: SubagentStop без тип и без мета → вътрешен; с тип или с мета → както е", async () => {
  const { agentLabel } = await import(pathToFileURL(HOOK).href);
  assert.equal(agentLabel({ hook_event_name: "SubagentStop" }, { agent: "общ" }), "вътрешен");
  assert.equal(agentLabel({ hook_event_name: "SubagentStop", agent_type: "general-purpose" }, { agent: "general-purpose" }), "general-purpose");
  assert.equal(agentLabel({ hook_event_name: "SubagentStop" }, { agent: "kodadjiyata" }), "kodadjiyata", "мета-файлът каза кой е");
  assert.equal(agentLabel({ hook_event_name: "Stop" }, { agent: "общ" }), "общ");
});

// 2026-11-02 (четвърто проучване): резултатите по инструмент и 1-часовите кеш-записи на своята ставка.
test("резултати по инструмент и 1-часов кеш-запис: броят се отделно и се ценят по ставката си", () => {
  const dir = mkdtempSync(join(tmpdir(), "uc-tb-"));
  const p = transcript(dir);
  const r = summarizeTranscript(p);
  assert.deepEqual(r.toolBytes, { Read: 4000 }, "резултатът на tool_use 1 (Read) е 4000 байта");
  assert.equal(r.cacheWrite1h, undefined, "без 1-часови записи полето липсва");
  const prices = loadPrices();
  const base = { model: "opus-5-5", input: 0, cacheRead: 0, output: 0, cacheWrite: 1e6 };
  const c5 = costOf(base, prices), c1h = costOf({ ...base, cacheWrite1h: 1e6 }, prices);
  assert.ok(Math.abs(c1h / c5 - prices.cache.write1h / prices.cache.write) < 1e-9, "1h запис = write1h/write × 5-мин запис");
  const half = costOf({ ...base, cacheWrite1h: 5e5 }, prices);
  assert.ok(half > c5 && half < c1h);
  const [bad] = [...parseLedger(JSON.stringify({ id: "z", agent: "a", toolBytes: { __proto__: 5, Read: -1 } }))];
  assert.equal(bad.toolBytes, undefined, "речник с отрицателни или прототипни ключове от диска се изхвърля");
  rmSync(dir, { recursive: true, force: true });
});

// Регресия 2026-11-02: Правният Разбирач прочете един PDF 5 пъти (4,7 MB, $3.56 при средно $1.21).
test("повторно четене на същия файл (и страници) се брои с байтовете; друга част от файла — не", () => {
  const dir = mkdtempSync(join(tmpdir(), "uc-rr-"));
  const rd = (id, input) => ({ message: { model: "claude-opus-5-5", role: "assistant", id: `m${id}`, usage: { input_tokens: 1, output_tokens: 1 }, content: [{ type: "tool_use", id, name: "Read", input }] } });
  const res = (id, n) => ({ message: { role: "user", content: [{ type: "tool_result", tool_use_id: id, content: "x".repeat(n) }] } });
  const lines = [rd("a", { file_path: "/t/x.pdf" }), res("a", 1000), rd("b", { file_path: "/t/x.pdf" }), res("b", 1000),
    rd("c", { file_path: "/t/x.pdf", pages: "3" }), res("c", 200), rd("d", { file_path: "/t/x.pdf" }), res("d", 1000)];
  const p = join(dir, "agent-rr.jsonl");
  writeFileSync(p, lines.map((l) => JSON.stringify(l)).join("\n") + "\n");
  const r = summarizeTranscript(p);
  assert.equal(r.rereads, 2);
  assert.equal(r.rereadBytes, 2000);
  assert.equal(r.toolBytes.Read, 3200);
  rmSync(dir, { recursive: true, force: true });
});
