// drift-lint.test.mjs — гейтът за дрейф остава зелен на чисто репо (CI auto-discover).
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";

const TOOL = join(dirname(fileURLToPath(import.meta.url)), "drift-lint.mjs");

test("drift-lint: репото е без дрейф (нула счупени пътища, нула memory дрейф, консистентна бройка)", () => {
  const out = JSON.parse(execFileSync("node", [TOOL, "--json"], { encoding: "utf8" }));
  assert.equal(out.brokenPaths.length, 0, "счупени файлови референции: " + JSON.stringify(out.brokenPaths));
  assert.equal(out.memoryDrift.length, 0, "memory↔domain дрейф: " + JSON.stringify(out.memoryDrift));
  assert.equal(out.countConsistency.length, 0, "бройка/ростер несъответствия: " + JSON.stringify(out.countConsistency));
});
