// Студио пулт (28.11.2026, живата проба): главната нишка там е диспечерът, а Stop куките session-dod и
// artifact-sync искаха от него commit и републикуване на артефакта („Двата hook-а искат действия, които не
// мога“). Те са напомняния за работната сесия, не пазачи — с STUDIOPULT=1 (средата на процеса на CLI, която
// задава само пултът; агентът не може да я смени) мълчат. Без нея поведението е същото.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const HOOKS = join(import.meta.dirname, "..", "..", ".claude", "hooks");
const run = (hook, cwd, extra = {}) =>
  spawnSync(process.execPath, [join(HOOKS, hook)], { input: "{}", encoding: "utf8", env: { ...process.env, CLAUDE_PROJECT_DIR: cwd, ...extra } });

function dirtyRepo() {
  const d = mkdtempSync(join(tmpdir(), "pult-quiet-"));
  const g = (...a) => spawnSync("git", a, { cwd: d, encoding: "utf8" });
  g("init", "-q");
  g("config", "user.email", "t@example.invalid");
  g("config", "user.name", "t");
  writeFileSync(join(d, "a.txt"), "1");
  g("add", "a.txt");
  g("commit", "-qm", "init");
  writeFileSync(join(d, "a.txt"), "2"); // проследен и променен → Session-DoD иска commit
  return d;
}

test("session-dod: без STUDIOPULT иска commit (2); със STUDIOPULT=1 мълчи (0)", () => {
  const d = dirtyRepo();
  try {
    assert.equal(run("session-dod.mjs", d).status, 2);
    const q = run("session-dod.mjs", d, { STUDIOPULT: "1" });
    assert.equal(q.status, 0);
    assert.equal(q.stderr, "");
  } finally {
    rmSync(d, { recursive: true, force: true });
  }
});

test("artifact-sync: със STUDIOPULT=1 мълчи (0, без изход)", () => {
  const d = dirtyRepo();
  try {
    const q = run("artifact-sync.mjs", d, { STUDIOPULT: "1" });
    assert.equal(q.status, 0);
    assert.equal(q.stderr + q.stdout, "");
  } finally {
    rmSync(d, { recursive: true, force: true });
  }
});

test("само точно „1“ — друга стойност не изключва напомнянето", () => {
  const d = dirtyRepo();
  try {
    assert.equal(run("session-dod.mjs", d, { STUDIOPULT: "yes" }).status, 2);
  } finally {
    rmSync(d, { recursive: true, force: true });
  }
});
