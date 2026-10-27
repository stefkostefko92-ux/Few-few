import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { wrapperPrompt, stripOrchestratorStop, expandJobs, parseResult, makeWorktree } from "./live-run.mjs";
import { evalMode } from "../../lib/eval-mode.mjs";

test("обвивката пуска агента по id и иска дословния отговор", () => {
  const p = wrapperPrompt("seo", "провери sitemap");
  assert.match(p, /subagent_type: seo/);
  assert.match(p, /дословно/);
  assert.match(p, /провери sitemap$/);
  assert.match(p, /ВЕДНЪЖ/);
  assert.match(p, /run_in_background: false/);
  assert.match(p, /никога бележка за дубликата/);
});

test("от Stop куките отпадат само тези на оркестратора", () => {
  const s = stripOrchestratorStop({ hooks: { Stop: [{ hooks: [{ command: "node .claude/hooks/session-dod.mjs" }, { command: "node x.mjs" }] }, { hooks: [{ command: "node .claude/hooks/artifact-sync.mjs" }] }], SubagentStop: [{ hooks: [{ command: "dod-check" }] }] } });
  assert.deepEqual(s.hooks.Stop, [{ hooks: [{ command: "node x.mjs" }] }]);
  assert.equal(s.hooks.SubagentStop.length, 1);
});

test("задачите се разгъват по опити, а изходът се чете от JSON на claude -p", () => {
  const jobs = expandJobs("kasadjiyata:kasadjiyata:3,seo", (id) => `задача ${id}`);
  assert.deepEqual(jobs.map((j) => j.name), ["kasadjiyata.1.txt", "kasadjiyata.2.txt", "kasadjiyata.3.txt", "seo.txt"]);
  assert.deepEqual(parseResult('{"result":"ок","total_cost_usd":0.25}'), { text: "ок", costUsd: 0.25 });
  assert.equal(parseResult("суров").text, "суров");
});

// Хванато на 27.10.2026: AGENT_MEMORY_SYNC=0 спираше само фоновия sync, а memory-capture публикуваше поуки
// в agents/memory направо от копието (общи refs) — оценката учеше и опит 2 виждаше поуката на опит 1.
test("копието за оценка е в eval режим (не учи), копието за преглед на PR — не", () => {
  const measured = makeWorktree("HEAD");
  const learning = makeWorktree("HEAD", null, { measure: false });
  try {
    assert.equal(evalMode(measured.dir)?.label, "live-run");
    assert.equal(evalMode(learning.dir), null);
    const settings = JSON.parse(readFileSync(join(measured.dir, ".claude", "settings.json"), "utf8"));
    assert.ok(!JSON.stringify(settings.hooks?.Stop || []).includes("session-dod"));
  } finally { measured.cleanup(); learning.cleanup(); }
  assert.equal(existsSync(measured.dir), false);
});
