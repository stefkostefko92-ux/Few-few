// autodeploy-prune.test.mjs — чистенето на releases (prune_releases в deploy/autodeploy.sh) пази целта
// на отката на ВСЕКИ продукт: `$SHARED_ROOT/*/last-good`, не само на korpora. Случаят от 11.10.2026:
// ChatChat разгърнат от свой клон, после деплой на друг продукт от main (чийто autodeploy.sh не
// познава chatchat) изтри папката, към която сочеше /opt/few-few/shared/chatchat/last-good.
// Тестът е ИЗПЪЛНИМ: реже реалната функция от скрипта и я пуска с bash върху временна файлова система.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, existsSync, rmSync, utimesSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const script = readFileSync(join(root, "deploy", "autodeploy.sh"), "utf8");
const fn = (name) => {
  const m = script.match(new RegExp(`^${name}\\(\\) \\{\\n[\\s\\S]*?^\\}`, "m"));
  assert.ok(m, `функцията ${name} съществува`);
  return m[0];
};

function setup(count) {
  const base = mkdtempSync(join(tmpdir(), "prune-"));
  const releases = join(base, "releases");
  const shared = join(base, "shared");
  const srcs = Array.from({ length: count }, (_, i) => {
    const name = `r${i + 1}`;
    const src = join(releases, name, "few-few");
    mkdirSync(join(src, "chatchat"), { recursive: true });
    const t = new Date(Date.UTC(2026, 9, 1 + i));
    utimesSync(join(releases, name), t, t);
    return src;
  });
  return { base, releases, shared, srcs, current: join(base, "current") };
}

function prune(L, env) {
  execFileSync("ln", ["-sfn", L.srcs.at(-1), L.current]);
  const cfg = [
    "set -euo pipefail",
    `SRC="${L.srcs.at(-1)}"`, `CURRENT_LINK="${L.current}"`, `RELEASES_DIR="${L.releases}"`, "KEEP_RELEASES=5",
    ...env,
    fn("prune_releases"), "prune_releases",
  ].join("\n");
  execFileSync("bash", ["-c", cfg], { encoding: "utf8" });
}

const lastGood = (L, product, target) => {
  mkdirSync(join(L.shared, product), { recursive: true });
  writeFileSync(join(L.shared, product, "last-good"), `${target}\n`);
};

test("last-good на продукт, когото скриптът не познава (chatchat), пази своя release", () => {
  const L = setup(7);
  try {
    lastGood(L, "chatchat", join(L.srcs[1], "chatchat"));
    prune(L, [`SHARED_ROOT="${L.shared}"`]);
    assert.ok(existsSync(join(L.releases, "r2")), "r2 е целта на chatchat — остава");
    assert.ok(!existsSync(join(L.releases, "r1")), "r1 е стар и незащитен — изтрит");
    for (const n of ["r3", "r4", "r5", "r6", "r7"]) assert.ok(existsSync(join(L.releases, n)), n);
  } finally {
    rmSync(L.base, { recursive: true, force: true });
  }
});

test("няколко продукта с last-good: всички цели остават; KORPORA_LAST_GOOD извън SHARED_ROOT също", () => {
  const L = setup(8);
  try {
    lastGood(L, "chatchat", join(L.srcs[0], "chatchat"));
    lastGood(L, "piuma", L.srcs[1]);
    const korpora = join(L.base, "elsewhere", "last-good");
    mkdirSync(dirname(korpora), { recursive: true });
    writeFileSync(korpora, `${join(L.srcs[2], "korpora")}\n`);
    prune(L, [`SHARED_ROOT="${L.shared}"`, `KORPORA_LAST_GOOD="${korpora}"`]);
    for (const n of ["r1", "r2", "r3"]) assert.ok(existsSync(join(L.releases, n)), `${n} е цел на откат`);
    for (const n of ["r4", "r5", "r6", "r7", "r8"]) assert.ok(existsSync(join(L.releases, n)), n);
  } finally {
    rmSync(L.base, { recursive: true, force: true });
  }
});

test("без SHARED_ROOT и KORPORA_LAST_GOOD (set -u) — само последните KEEP_RELEASES", () => {
  const L = setup(7);
  try {
    prune(L, []);
    assert.ok(!existsSync(join(L.releases, "r1")));
    assert.ok(!existsSync(join(L.releases, "r2")));
    for (const n of ["r3", "r4", "r5", "r6", "r7"]) assert.ok(existsSync(join(L.releases, n)), n);
  } finally {
    rmSync(L.base, { recursive: true, force: true });
  }
});
