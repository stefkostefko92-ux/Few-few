import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { bundle } from "../build.mjs";

const DIR = dirname(fileURLToPath(import.meta.url));
const ROOT = join(DIR, "..");

test("bundle() генерира синтактично валиден класически скрипт", () => {
  const src = bundle();
  const tmp = join(ROOT, ".bundle-check.tmp.js");
  writeFileSync(tmp, src);
  try {
    execFileSync(process.execPath, ["--check", tmp]);
  } finally {
    unlinkSync(tmp);
  }
});

test("bundle() излага window.Galaxy с трите публични функции", () => {
  const src = bundle();
  assert.match(src, /window\.Galaxy = \{ createGalaxy, createBackdrop, separateLabels \};/);
});

test("bundle() не съдържа неразрешен export/import (изтекъл ESM синтаксис)", () => {
  const src = bundle();
  assert.doesNotMatch(src, /^\s*export\b/m);
  assert.doesNotMatch(src, /^\s*import\b/m);
});

test("agents-dashboard/galaxy.js на диска е актуален спрямо src/ (не забравен stale билд)", () => {
  const onDisk = readFileSync(join(ROOT, "..", "galaxy.js"), "utf8");
  assert.equal(onDisk, bundle());
});
