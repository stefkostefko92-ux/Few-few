// session-hooks.test.mjs — трите нови сесийни hook-а: PreCompact/Stop/UserPromptSubmit (CI auto-discovery).
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildSnapshot } from "../../.claude/hooks/precompact-save.mjs";
import { checkClean } from "../../.claude/hooks/session-dod.mjs";
import { scanPrompt } from "../../.claude/hooks/guard-prompt.mjs";

// ── precompact-save ──
test("снимката носи клон/статус/комити + инструкция за закотвяне", () => {
  const s = buildSnapshot({ branch: "claude/x", status: " M a.ts", log: "abc фикс", when: "2026-07-23" });
  assert.ok(s.includes("claude/x") && s.includes("M a.ts") && s.includes("abc фикс"));
  assert.ok(/закотви се за тези ФАКТИ/.test(s));
});

test("чисто дърво → „чисто дърво' в снимката", () => {
  assert.ok(buildSnapshot({ branch: "b", status: "", log: "x", when: "t" }).includes("чисто дърво"));
});

// ── session-dod ──
test("промени по проследени файлове → не е ок; чисто/само untracked → ок", () => {
  assert.equal(checkClean([" M tools/a.mjs", "?? scratch.txt"]).ok, false);
  assert.equal(checkClean(["?? scratch.txt", ""]).ok, true);
  assert.equal(checkClean([""]).ok, true);
});

// ── guard-prompt ──
test("реална на вид тайна → блок; чист промпт → ок", () => {
  assert.equal(scanPrompt("ключът ми е sk-ant-ABCDEFGHIJKLMNOPQRSTUVWX123").ok, false);
  assert.equal(scanPrompt("поправи бъга в medqr/server.js").ok, true);
});

test("байпас маркер [секрет-ок] пропуска нарочен пример", () => {
  const r = scanPrompt("[секрет-ок] пример: sk-ant-ABCDEFGHIJKLMNOPQRSTUVWX123");
  assert.equal(r.ok, true);
  assert.equal(r.bypass, true);
});

test("PEM/GitHub/Stripe шаблоните хващат", () => {
  assert.equal(scanPrompt("-----BEGIN RSA PRIVATE KEY-----").ok, false);
  assert.equal(scanPrompt("ghp_" + "A".repeat(36)).ok, false);
  assert.equal(scanPrompt("sk_live_" + "a1B2".repeat(6)).ok, false);
});
