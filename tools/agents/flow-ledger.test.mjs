// flow-ledger.test.mjs — дневникът на веригите не приема предаване или затваряне без истински поток.
//
// Дефект (23.11.2026): `--handoff --from ai-djiyata --to човек` (празно id) записа ред с `"id":"--from"` —
// `val()` взимаше следващия флаг за стойност, а id-то не се сверяваше със стартираните потоци.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, existsSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const CLI = join(dirname(fileURLToPath(import.meta.url)), "flow-ledger.mjs");
const run = (ledger, ...args) => spawnSync(process.execPath, [CLI, ...args], { encoding: "utf8", env: { ...process.env, FLOW_LEDGER_PATH: ledger } });
const lines = (p) => (existsSync(p) ? readFileSync(p, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)) : []);

test("предаване и затваряне: флаг на мястото на id или непознато id → отказ без запис", () => {
  const dir = mkdtempSync(join(tmpdir(), "fl-"));
  const ledger = join(dir, "_flows.jsonl");
  const start = run(ledger, "--start", "проба", "--lead", "ai-djiyata");
  assert.equal(start.status, 0, start.stderr);
  const id = start.stdout.trim();
  assert.match(id, /^f[0-9a-z]{2,}$/);

  const noId = run(ledger, "--handoff", "--from", "ai-djiyata", "--to", "човек", "--status", "блокер");
  assert.equal(noId.status, 2, "флагът не е id");
  const unknown = run(ledger, "--handoff", "fzzzzzz", "--from", "ai-djiyata", "--to", "човек");
  assert.equal(unknown.status, 2, "id, което не е стартирано");
  const closeFlag = run(ledger, "--close", "--status", "блокиран");
  assert.equal(closeFlag.status, 2, "затваряне без id");
  assert.equal(lines(ledger).length, 1, "нищо не се записва при отказ");

  assert.equal(run(ledger, "--handoff", id, "--from", "ai-djiyata", "--to", "човек", "--status", "блокер").status, 0);
  assert.equal(run(ledger, "--close", id, "--status", "блокиран").status, 0);
  assert.deepEqual(lines(ledger).map((l) => [l.t, l.id]), [["start", id], ["handoff", id], ["close", id]]);
  assert.equal(run(ledger, "--close", id, "--status", "завършен").status, 2, "затворен поток не се затваря втори път");
  assert.equal(run(ledger, "--handoff", id, "--from", "a", "--to", "b", "--status", "блокер").status, 2, "нито получава предаване");
  assert.equal(lines(ledger).length, 3);
  rmSync(dir, { recursive: true, force: true });
});

test("автоматичните потоци от куката (id r…) също се приемат, щом са стартирани", () => {
  const dir = mkdtempSync(join(tmpdir(), "fl-"));
  const ledger = join(dir, "_flows.jsonl");
  writeFileSync(ledger, JSON.stringify({ t: "start", ts: "2026-11-23T08:00:00Z", id: "r7782e8d7", flow: "авто", lead: "kodadjiyata", auto: true }) + "\n");
  assert.equal(run(ledger, "--close", "r7782e8d7", "--status", "завършен").status, 0);
  assert.equal(lines(ledger).length, 2);
  rmSync(dir, { recursive: true, force: true });
});
