import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import { activeBatch, startBatch, endBatch, BATCH_FILE } from "./learning-batch.mjs";

const repo = () => { const d = mkdtempSync(join(tmpdir(), "batch-")); execFileSync("git", ["init", "-q", d]); return d; };

test("партидата е активна до изтичането си и се затваря", () => {
  const d = repo();
  try {
    assert.equal(activeBatch(d), null);
    startBatch(d, { label: "pr-review", minutes: 30 });
    assert.equal(activeBatch(d)?.label, "pr-review");
    assert.equal(activeBatch(d, Date.now() + 31 * 60_000), null); // изтекла
    endBatch(d);
    assert.equal(activeBatch(d), null);
  } finally { rmSync(d, { recursive: true, force: true }); }
});

test("ръчно записан далечен край не спира правилото безсрочно", () => {
  const d = repo();
  try {
    writeFileSync(join(d, ".git", BATCH_FILE), JSON.stringify({ label: "x", until: "3000-01-01T00:00:00Z" }));
    assert.equal(activeBatch(d), null);
  } finally { rmSync(d, { recursive: true, force: true }); }
});
