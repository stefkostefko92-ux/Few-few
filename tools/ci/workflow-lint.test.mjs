// workflow-lint.test.mjs — job след празен ред не изчезва от проверката (Конвейера, 2026-09-24).
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const LINT = join(dirname(fileURLToPath(import.meta.url)), "workflow-lint.mjs");
function lint(yml) {
  const d = mkdtempSync(join(tmpdir(), "wfl-"));
  mkdirSync(join(d, ".github", "workflows"), { recursive: true });
  writeFileSync(join(d, ".github", "workflows", "x.yml"), yml);
  return spawnSync(process.execPath, [LINT], { cwd: d, encoding: "utf8" });
}
const HEAD = "name: x\non: push\nconcurrency:\n  group: x\n  cancel-in-progress: true\npermissions:\n  contents: read\n\njobs:\n";

test("вторият job след празен ред се проверява (преди изчезваше)", () => {
  const r = lint(HEAD + "  a:\n    runs-on: ubuntu-latest\n    timeout-minutes: 5\n    steps:\n      - run: true\n\n  b:\n    runs-on: ubuntu-latest\n    steps:\n      - run: true\n");
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stdout + r.stderr, /job „b“ няма timeout-minutes/);
  assert.doesNotMatch(r.stdout + r.stderr, /job „a“/);
});

test("всички job-ове с timeout → чисто", () => {
  const r = lint(HEAD + "  a:\n    runs-on: ubuntu-latest\n    timeout-minutes: 5\n\n  b:\n    runs-on: ubuntu-latest\n    timeout-minutes: 5\n");
  assert.equal(r.status, 0, r.stdout + r.stderr);
});
