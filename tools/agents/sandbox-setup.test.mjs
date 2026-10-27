// sandbox-setup.test.mjs — сливането само стеснява и пробата не пише.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { buildBlock, mergeSandbox, missingDeps } from "./sandbox-setup.mjs";

const TOOL = join(dirname(fileURLToPath(import.meta.url)), "sandbox-setup.mjs");

test("buildBlock: строгият режим добавя двата ключа, обикновеният — не", () => {
  assert.equal(buildBlock().allowUnsandboxedCommands, undefined);
  const s = buildBlock({ strict: true });
  assert.equal(s.allowUnsandboxedCommands, false);
  assert.equal(s.failIfUnavailable, true);
  assert.ok(s.credentials.files.every((f) => f.mode === "deny"));
});

test("mergeSandbox: пази чуждите ключове и записи, добавя нашите без дубли", () => {
  const existing = { model: "opus", sandbox: { excludedCommands: ["docker compose *"], network: { allowedDomains: ["example.org", "github.com"] }, credentials: { files: [{ path: "~/.ssh", mode: "deny" }] } } };
  const m = mergeSandbox(existing, buildBlock());
  assert.equal(m.model, "opus");
  assert.deepEqual(m.sandbox.excludedCommands, ["docker compose *"]);
  assert.ok(m.sandbox.network.allowedDomains.includes("example.org"));
  assert.equal(m.sandbox.network.allowedDomains.filter((d) => d === "github.com").length, 1);
  assert.equal(m.sandbox.credentials.files.filter((f) => f.path === "~/.ssh").length, 1);
});

test("mergeSandbox: вече затегнато не се отпуска от обикновения режим", () => {
  const m = mergeSandbox({ sandbox: { allowUnsandboxedCommands: false, failIfUnavailable: true } }, buildBlock());
  assert.equal(m.sandbox.allowUnsandboxedCommands, false);
  assert.equal(m.sandbox.failIfUnavailable, true);
});

test("missingDeps: на Linux иска bwrap и socat, на macOS — нищо", () => {
  assert.deepEqual(missingDeps("linux", () => false), ["bwrap", "socat"]);
  assert.deepEqual(missingDeps("darwin", () => false), []);
});

test("CLI: без --apply не пише, с --apply пише и пази резервно копие", () => {
  const dir = mkdtempSync(join(tmpdir(), "sbx-"));
  try {
    const f = join(dir, "settings.json");
    writeFileSync(f, JSON.stringify({ theme: "dark" }));
    spawnSync(process.execPath, [TOOL, "--settings-file", f], { encoding: "utf8" });
    assert.deepEqual(JSON.parse(readFileSync(f, "utf8")), { theme: "dark" }, "пробата не бива да пише");
    spawnSync(process.execPath, [TOOL, "--settings-file", f, "--apply", "--strict"], { encoding: "utf8" });
    const s = JSON.parse(readFileSync(f, "utf8"));
    assert.equal(s.theme, "dark");
    assert.equal(s.sandbox.enabled, true);
    assert.equal(s.sandbox.allowUnsandboxedCommands, false);
    assert.ok(readdirSync(dir).some((n) => n.startsWith("settings.json.bak-")), "резервно копие");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
