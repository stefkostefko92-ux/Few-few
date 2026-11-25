// session-hooks-2026-11-19.test.mjs — снимката след уплътняване стига до модела; Haiku не се избира; API провалите
// се записват; тайна се спира ПРЕДИ записа; guard-config пази новите ключове (ръководствата на Anthropic, 19.11.2026).
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { snapshotFile, summaryInstructions } from "../../.claude/hooks/precompact-save.mjs";
import { restoreContext, MAX_AGE_MS } from "../../.claude/hooks/session-restore.mjs";
import { modelVerdict } from "../../.claude/hooks/guard-model.mjs";
import { failureEntry } from "../../.claude/hooks/stop-failure.mjs";
import { verdict } from "../../.claude/hooks/guard-secrets.mjs";
import { weakening } from "../../.claude/hooks/guard-config.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const run = (h, payload) => spawnSync(process.execPath, [join(ROOT, ".claude", "hooks", h)], { input: typeof payload === "string" ? payload : JSON.stringify(payload), encoding: "utf8" });
// Тестова тайна — сглобена в рънтайм, никога литерал (доктрината за тестови тайни).
const fakeKey = () => ["sk", "ant", "api03"].join("-") + "-" + "Q".repeat(90) + "AA";

test("PreCompact: stdout е инструкция към обобщението; подагентът пише своя снимка", () => {
  assert.match(snapshotFile(""), /compact-snapshot\.md$/);
  assert.match(snapshotFile("kodadjiyata"), /compact-snapshot\.kodadjiyata\.md$/);
  assert.match(snapshotFile("../evil"), /compact-snapshot\.md$/, "агент с невалидно име не избира път");
  const s = summaryInstructions({ trigger: "auto" });
  assert.match(s, /решение/);
  assert.ok(s.length < 10000);
});

test("SessionStart compact: свежата снимка се връща като ДАННИ; старата или чуждият source — нищо", () => {
  const now = 1_800_000_000_000;
  const io = (age) => ({ read: () => "# Снимка\n- **Клон:** x", mtime: () => now - age, now });
  const ctx = restoreContext({ source: "compact" }, io(1000));
  assert.match(ctx, /ДАННИ/);
  assert.match(ctx, /<snapshot>[\s\S]*Клон[\s\S]*<\/snapshot>/);
  assert.equal(restoreContext({ source: "compact" }, io(MAX_AGE_MS + 1)), "");
  assert.equal(restoreContext({ source: "startup" }, io(1000)), "");
  assert.ok(restoreContext({ source: "compact" }, { ...io(1), read: () => "x".repeat(50000) }).length < 9000, "под тавана на куките");
  assert.equal(run("session-restore.mjs", "{не е json").status, 0, "fail-open");
});

test("PreModelSwitch: Haiku се отказва по ID и по псевдоним; друг модел — без решение", () => {
  assert.match(modelVerdict({ to_model: "claude-haiku-5-5" }), /никога Haiku/);
  assert.match(modelVerdict({ to_model: "claude-sonnet-5-5", requested_model: "haiku" }), /никога Haiku/);
  assert.equal(modelVerdict({ to_model: "claude-opus-5-5", requested_model: "opus" }), "");
  const r = run("guard-model.mjs", { hook_event_name: "PreModelSwitch", to_model: "claude-haiku-5-5", requested_model: "haiku" });
  assert.equal(JSON.parse(r.stdout).hookSpecificOutput.permissionDecision, "deny");
  assert.equal(run("guard-model.mjs", "{").status, 2, "неразбираем payload → смяната се отказва");
});

test("StopFailure: записът е без тайни и без съдържание; непознат вид → unknown", () => {
  const e = failureEntry({ error: "rate_limit", error_details: `429 key ${fakeKey()}`, agent_type: "seo", session_id: "s1", last_assistant_message: "лично съдържание" }, "2026-11-19T00:00:00Z");
  assert.equal(e.error, "rate_limit");
  assert.ok(!e.details.includes("api03"), "тайната е заличена");
  assert.ok(!JSON.stringify(e).includes("лично съдържание"), "съдържанието не се пази");
  assert.equal(failureEntry({ error: "rm -rf" }).error, "unknown");
  assert.equal(failureEntry({ agent_type: "../x" }).agent, "");
});

test("guard-secrets PreToolUse: тайната не стига до диска (exit 2 преди записа); fail-closed при счупен payload", () => {
  const pre = { hook_event_name: "PreToolUse", tool_name: "Write", tool_input: { file_path: "src/a.ts", content: `const k = "${fakeKey()}";` } };
  assert.equal(verdict(pre).exit, 2);
  assert.match(verdict(pre).message, /отказан/);
  assert.equal(run("guard-secrets.mjs", pre).status, 2);
  assert.equal(run("guard-secrets.mjs", { ...pre, tool_input: { file_path: "src/a.ts", content: "export const x = 1;" } }).status, 0);
  assert.equal(run("guard-secrets.mjs", { ...pre, tool_input: { file_path: "tests/a.test.ts", content: fakeKey() } }).status, 0, "фикстурите остават");
  assert.equal(run("guard-secrets.mjs", { ...pre, tool_name: "MultiEdit", tool_input: { file_path: "src/a.ts", edits: [{ new_string: fakeKey() }] } }).status, 2);
  assert.equal(run("guard-secrets.mjs", '{"hook_event_name":"PreToolUse",').status, 2, "счупен PreToolUse payload → отказ");
  assert.equal(run("guard-secrets.mjs", '{"hook_event_name":"PostToolUse",').status, 0, "PostToolUse остава fail-open");
});

test("guard-config: върната автоматична памет, махнат bypass-забранител, Haiku във фоновия модел → отслабване", () => {
  const base = { autoMemoryEnabled: false, permissions: { deny: [], disableBypassPermissionsMode: "disable" }, env: { ANTHROPIC_DEFAULT_HAIKU_MODEL: "claude-sonnet-5-5" }, hooks: {} };
  const clone = () => JSON.parse(JSON.stringify(base));
  assert.equal(weakening("project_settings", clone(), base), null);
  const a = clone(); delete a.autoMemoryEnabled; assert.match(weakening("project_settings", a, base), /автоматична памет/);
  const b = clone(); delete b.permissions.disableBypassPermissionsMode; assert.match(weakening("project_settings", b, base), /disableBypassPermissionsMode/);
  const c = clone(); c.env.ANTHROPIC_DEFAULT_HAIKU_MODEL = "claude-haiku-5-5"; assert.match(weakening("project_settings", c, base), /HAIKU/);
  const d = clone(); delete d.env.ANTHROPIC_DEFAULT_HAIKU_MODEL; assert.match(weakening("project_settings", d, base), /HAIKU/);
  assert.match(weakening("local_settings", { autoMemoryEnabled: true }, null), /autoMemoryEnabled/);
  assert.match(weakening("local_settings", { env: { ANTHROPIC_DEFAULT_HAIKU_MODEL: "haiku" } }, null), /Haiku/);
  assert.equal(weakening("local_settings", { env: { FOO: "1" } }, null), null);
});
