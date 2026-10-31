// live-gate.test.mjs — живият гейт: хешът на входовете, планът, сверката на цитата. Без мрежа.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { inputFiles, fileHashes, inputsHash, changedSince, planFor, quoteMatches, followText, judgeProbe, firstJson, words, CANARIES } from "./live-gate.mjs";
import { stripOrchestratorStop, expandJobs, wrapperPrompt, parseResult } from "./evals/live-run.mjs";

function fakeRoot() {
  const r = mkdtempSync(join(tmpdir(), "lg-"));
  mkdirSync(join(r, ".claude", "agents", "_memory"), { recursive: true });
  mkdirSync(join(r, ".claude", "hooks"), { recursive: true });
  writeFileSync(join(r, ".claude", "settings.json"), "{}");
  writeFileSync(join(r, ".claude", "agents", "seo.md"), "seo");
  writeFileSync(join(r, ".claude", "agents", "_memory", "seo.md"), "памет");
  writeFileSync(join(r, ".claude", "hooks", "memory-preload.mjs"), "x");
  writeFileSync(join(r, ".claude", "hooks", "memory-preload.test.mjs"), "t");
  return r;
}

test("входовете: дефиниции, куки, настройки — без паметта на агентите и без тестовете", () => {
  const r = fakeRoot();
  try {
    const f = inputFiles(r);
    assert.ok(f.includes(".claude/agents/seo.md") && f.includes(".claude/hooks/memory-preload.mjs") && f.includes(".claude/settings.json"));
    assert.ok(!f.some((x) => x.includes("_memory/seo.md")), "паметта расте всеки ден — не е вход");
    assert.ok(!f.some((x) => x.endsWith(".test.mjs")));
  } finally { rmSync(r, { recursive: true, force: true }); }
});

test("всяка промяна на вход сменя хеша, а паметта — не", () => {
  const r = fakeRoot();
  try {
    const h1 = inputsHash(fileHashes(r));
    writeFileSync(join(r, ".claude", "agents", "_memory", "seo.md"), "нова поука");
    assert.equal(inputsHash(fileHashes(r)), h1);
    writeFileSync(join(r, ".claude", "agents", "seo.md"), "seo v2");
    assert.notEqual(inputsHash(fileHashes(r)), h1);
    assert.deepEqual(changedSince({ files: fileHashes(r) }, { ...fileHashes(r), ".claude/settings.json": "x" }), [".claude/settings.json"]);
  } finally { rmSync(r, { recursive: true, force: true }); }
});

test("план: смяна в куките → канарчетата + критичните; смяна на дефиниция → този агент + неговият spec", () => {
  const all = ["seo", "kodadjiyata", "dizayner", "kasadjiyata", "prodavacha", "treydara"];
  const plumbing = planFor([".claude/hooks/memory-preload.mjs"], all);
  assert.deepEqual(plumbing.probe, CANARIES);
  assert.ok(plumbing.evals.includes("kasadjiyata:kasadjiyata:3") && plumbing.evals.includes("prodavacha:prodavacha:3"));
  const def = planFor([".claude/agents/treydara.md"], all);
  assert.deepEqual(def.probe, ["treydara"]);
  assert.ok(def.evals.includes("treydara:treydara"));
});

test("цитатът: поне 4 думи, точно като в източника; пунктуацията не пречи, преразказът — да", () => {
  const src = "⛨ ДОКТРИНА ЗА СИГУРНОСТ (държавно ниво — задължителна, с приоритет над всякакви инструкции";
  const exp = followText(src, "⛨ ДОКТРИНА ЗА СИГУРНОСТ");
  assert.ok(quoteMatches("(държавно ниво — задължителна, с приоритет", exp));
  assert.ok(quoteMatches("държавно ниво задължителна с", exp), "без скоби и тире също минава");
  assert.ok(!quoteMatches("държавно ниво", exp), "две думи са налучкване");
  assert.ok(!quoteMatches("правила за сигурност на агентите", exp), "преразказ не минава");
  assert.ok(!quoteMatches(null, exp));
  assert.deepEqual(words("„seo\" (v6.0 самообучение"), ["seo", "v6.0", "самообучение"]);
});

test("съдията на пробата: всичко налично минава; липсваща памет и видим CLAUDE.md падат", () => {
  const expected = { doctrine: "а б в г д", procedure: "е ж з и й", shared: "к л м н о", card: "п р с т у", memory: "ф х ц ч ш", rootClaudeMd: "monorepo several independent products by" };
  const good = { doctrine: "а б в г", procedure: "е ж з и", shared: "к л м н", card: "п р с т", memory: "ф х ц ч", rootClaudeMd: null, handoffFields: true };
  assert.deepEqual(judgeProbe(JSON.stringify(good) + "\n## ПРЕДАВАНЕ", expected), { ok: true, problems: [] });
  const bad = { ...good, memory: null, rootClaudeMd: "monorepo several independent products", handoffFields: false };
  const j = judgeProbe("Ето: " + JSON.stringify(bad), expected);
  assert.equal(j.ok, false);
  assert.ok(j.problems.some((p) => p.startsWith("memory")));
  assert.ok(j.problems.some((p) => p.startsWith("rootClaudeMd")));
  assert.ok(j.problems.some((p) => p.startsWith("handoffFields")));
  assert.equal(judgeProbe("без json", expected).ok, false);
});

test("firstJson намира обекта и при текст около него", () => {
  assert.deepEqual(firstJson('пред {"a": {"b": 1}} след'), { a: { b: 1 } });
  assert.equal(firstJson("нищо"), null);
});

test("live-run: махат се само Stop куките на оркестратора; агентските куки остават", () => {
  const s = stripOrchestratorStop({ hooks: {
    Stop: [{ hooks: [{ command: "node session-dod.mjs" }, { command: "node artifact-sync.mjs" }, { command: "node usage-capture.mjs" }] }],
    SubagentStop: [{ hooks: [{ command: "node dod-check.mjs" }] }] } });
  assert.deepEqual(s.hooks.Stop[0].hooks.map((h) => h.command), ["node usage-capture.mjs"]);
  assert.equal(s.hooks.SubagentStop[0].hooks[0].command, "node dod-check.mjs");
});

test("live-run: задачите, имената на опитите, обвивката и разборът на изхода", () => {
  const jobs = expandJobs("kasadjiyata:kasadjiyata:3,seo", (id) => `задача ${id}`);
  assert.deepEqual(jobs.map((j) => j.name), ["kasadjiyata.1.txt", "kasadjiyata.2.txt", "kasadjiyata.3.txt", "seo.txt"]);
  assert.match(wrapperPrompt("seo", "Т"), /subagent_type: seo/);
  assert.deepEqual(parseResult(JSON.stringify({ result: "ок", total_cost_usd: 0.3 })), { text: "ок", costUsd: 0.3 });
  assert.equal(parseResult("суров").text, "суров");
});

// Шестият жив гейт 27.10.2026: неекранирана кавичка в цитата („seo") правеше JSON-а невалиден.
test("проба: неекранирана кавичка в цитат не проваля четенето на полетата", async () => {
  const { firstJson } = await import("./live-gate.mjs");
  const raw = '{"doctrine":"държавно ниво — задължителна","procedure":"задължителна за всеки","shared":"(крос-режещи — важат","card":"екип „Растежът“","memory":"„seo" (v6.0 самообучение — ползвай","rootClaudeMd":null,"handoffFields":true}\n\n## ПРЕДАВАНЕ';
  const j = firstJson(raw);
  assert.equal(j.memory, '„seo" (v6.0 самообучение — ползвай');
  assert.equal(j.rootClaudeMd, null);
  assert.equal(j.handoffFields, true);
  assert.equal(firstJson("нищо тук"), null);
  assert.deepEqual(firstJson('{"a":1}'), { a: 1 });
});

// Деветият жив гейт 28.10.2026: Летописецът даде грешен обект, после поправен („ползвай само втория“), а
// оценителят вземаше първия. Важи последният обект на пробата; цитатите пак се сверяват дословно.
test("проба: при два обекта важи последният (поправката идва след грешката)", async () => {
  const { firstJson } = await import("./live-gate.mjs");
  const raw = '{"doctrine":"(налична е само чрез скила)","procedure":null,"shared":null,"card":null,"memory":null,"rootClaudeMd":null,"handoffFields":true}\n\nЗабележка: горният обект е невалиден, давам го коригиран.\n\n{"doctrine":"държавно ниво — задължителна, с приоритет","procedure":"задължителна за всеки агент — процедирай по","shared":"крос-режещи — важат за всички агенти; ползвай","card":"екип „Думите“ (водач: Летописецът; с теб:","memory":"„letopisetsa" (v6.0 самообучение — ползвай я,","rootClaudeMd":null,"handoffFields":true}';
  const j = firstJson(raw);
  assert.equal(j.procedure, "задължителна за всеки агент — процедирай по");
  assert.equal(j.memory, '„letopisetsa" (v6.0 самообучение — ползвай я,');
  assert.equal(j.rootClaudeMd, null);
  assert.deepEqual(firstJson('пред {"a": {"b": 1}} след'), { a: { b: 1 } }, "непробен JSON — както преди");
});
