// eval-mode.test.mjs — режимът за живи проверки (2026-09-23): изтича сам, изключва личната памет само
// когато е поискано и никога не пуска „поука" от измислен вход в паметта.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { evalMode, setEvalMode, clearEvalMode, MAX_MINUTES } from "../lib/eval-mode.mjs";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const PRELOAD = join(REPO, ".claude", "hooks", "memory-preload.mjs");
const CAPTURE = join(REPO, ".claude", "hooks", "memory-capture.mjs");
const LESSON = "- **2026-09-20:** уникална поука за проверка на режима _(т; verified; https://example.org/x)_";

function sandbox() {
  const d = mkdtempSync(join(tmpdir(), "evalmode-"));
  spawnSync("git", ["init", "-q"], { cwd: d });
  const mem = join(d, ".claude", "agents", "_memory");
  mkdirSync(mem, { recursive: true });
  writeFileSync(join(mem, "testagent.md"), `# П\n\n## Проверени поуки (verified)\n${LESSON}\n\n## Карантина\n`);
  for (const f of ["SECURITY.md", "PROCEDURE.md", "_shared.md"]) writeFileSync(join(mem, f), "# x\n\n## Доктрина\n- правило\n\n## Процедура\n- стъпка\n\n## Споделени поуки\n- споделено\n");
  return d;
}
const preload = (d) => spawnSync(process.execPath, [PRELOAD], { input: JSON.stringify({ agent_type: "testagent", prompt: "уникална поука проверка режим" }), encoding: "utf8", env: { ...process.env, CLAUDE_PROJECT_DIR: d, AGENT_MEMORY_SYNC: "0" } }).stdout;

test("изтича сам и таванът не се заобикаля", () => {
  const d = sandbox();
  try {
    const now = Date.parse("2026-09-23T10:00:00Z");
    const r = setEvalMode(d, { label: "x", memory: "off", minutes: 10_000 }, now);
    assert.equal(Date.parse(r.until) - now, MAX_MINUTES * 60_000, "таван на продължителността");
    assert.equal(evalMode(d, now)?.memory, "off");
    assert.equal(evalMode(d, now + MAX_MINUTES * 60_000 + 1), null, "след изтичане куките го игнорират");
    clearEvalMode(d);
    assert.equal(evalMode(d, now), null);
  } finally { rmSync(d, { recursive: true, force: true }); }
});

test("preload: „без памет“ маха личните поуки, но не и доктрината; „с памет“ ги оставя", () => {
  const d = sandbox();
  try {
    assert.match(preload(d), /уникална поука за проверка/, "нормален старт носи поуката");
    setEvalMode(d, { label: "a", memory: "off", minutes: 5 });
    const off = preload(d);
    assert.doesNotMatch(off, /уникална поука за проверка/, "вариант без памет");
    assert.match(off, /правило/, "статичният префикс остава");
    setEvalMode(d, { label: "b", memory: "on", minutes: 5 });
    assert.match(preload(d), /уникална поука за проверка/);
  } finally { rmSync(d, { recursive: true, force: true }); }
});

test("capture: в режим за проверка нищо не се записва в паметта", () => {
  const d = sandbox();
  try {
    setEvalMode(d, { label: "c", memory: "on", minutes: 5 });
    const block = "```learn\nagent: testagent\ndate: 2026-09-23\nlessons:\n  - text: поука от измислен вход\n    confidence: verified\n    source: https://example.org/y\n    scope: t\n```";
    spawnSync(process.execPath, [CAPTURE], { input: JSON.stringify({ hook_event_name: "SubagentStop", last_assistant_message: block }), encoding: "utf8", env: { ...process.env, CLAUDE_PROJECT_DIR: d, AGENT_MEMORY_SYNC: "0" } });
    const branch = spawnSync("git", ["rev-parse", "-q", "--verify", "agents/memory"], { cwd: d, encoding: "utf8" });
    assert.notEqual(branch.status, 0, "клонът на паметта не е създаден");
    assert.doesNotMatch(readFileSync(join(d, ".claude/agents/_memory/testagent.md"), "utf8"), /измислен вход/);
  } finally { rmSync(d, { recursive: true, force: true }); }
});
