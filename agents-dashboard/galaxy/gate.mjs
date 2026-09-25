#!/usr/bin/env node
// gate.mjs — целият гейт на пакета: check.mjs (линт + freshness на galaxy.js) + node:test + билд.
// Регистриран в tools/agents/gate.mjs (id "galaxy"), за да не изостане от общия гейт на репото.
import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const DIR = dirname(fileURLToPath(import.meta.url));
const run = (args, label) => {
  const r = spawnSync(process.execPath, args, { cwd: DIR, stdio: "inherit" });
  if (r.status !== 0) { console.error(`✘ galaxy/gate: ${label} се провали`); process.exit(r.status || 1); }
};

const testFiles = readdirSync(join(DIR, "test")).filter((f) => f.endsWith(".test.js")).map((f) => `test/${f}`);
run(["check.mjs"], "check.mjs");
run(["--test", ...testFiles], "тестовете");
run(["build.mjs"], "build.mjs");
console.log("✓ galaxy/gate: check + тестове + билд минаха");
