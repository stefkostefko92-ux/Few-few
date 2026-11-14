// source-check.test.mjs — мъртвите източници на проверените поуки (файл, който вече го няма, ред извън файла).
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { sourceOf, repoRefs, deadRefs, scan } from "./source-check.mjs";

const HERE = fileURLToPath(new URL(".", import.meta.url));

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "srcchk-"));
  mkdirSync(join(root, "tools", "agents"), { recursive: true });
  mkdirSync(join(root, "medqr", "src"), { recursive: true });
  mkdirSync(join(root, ".claude", "agents", "_memory"), { recursive: true });
  writeFileSync(join(root, "tools", "agents", "live.mjs"), "a\nb\nc\n");
  writeFileSync(join(root, "medqr", "src", "db.js"), "x\n".repeat(50));
  writeFileSync(join(root, ".claude", "agents", "_memory", "kodadjiyata.md"), [
    "# памет", "", "## Проверени поуки (verified)",
    "- **2026-11-01:** жив файл, ред в обхвата _(ревю; verified; medqr/src/db.js:23 + тест)_",
    "- **2026-11-02:** изтрит файл _(ревю; verified; tools/agents/old-tool.mjs:10)_",
    "- **2026-11-03:** ред извън файла _(ревю; verified; tools/agents/live.mjs:40)_",
    "- **2026-11-04:** само URL и чуждо репо _(ревю; verified; https://example.com/x.md + obra/superpowers@abc:skills/x.md)_",
    "- **2026-11-05 (пресверена 2026-11-06):** диапазон в обхвата _(ревю; verified; tools/agents/live.mjs:2-3)_",
    "", "## Карантина (непроверени — НЕ са факт)",
    "- **2026-11-06:** не се гледа _(x; unverified; tools/agents/nyama.mjs:1)_",
  ].join("\n"));
  return root;
}

test("sourceOf: източникът е след „verified;“ в последните скоби _( … )_", () => {
  assert.equal(sourceOf("- **2026-11-01:** текст _(обхват; verified; medqr/src/db.js:23 + тест)_"), "medqr/src/db.js:23 + тест");
  assert.equal(sourceOf("- **2026-11-01:** без източник"), null);
});

test("repoRefs: само пътища под истинска папка от репото, с ред или диапазон", () => {
  const top = new Set(["medqr", "tools", ".claude"]);
  assert.deepEqual(repoRefs("medqr/src/db.js:23 + tools/agents/x.mjs + https://a.b/c.md + obra/superpowers@1:skills/s.md", top), [
    { path: "medqr/src/db.js", line: 23 }, { path: "tools/agents/x.mjs", line: null },
  ]);
  assert.deepEqual(repoRefs("tools/agents/live.mjs:2-3", top), [{ path: "tools/agents/live.mjs", line: 3 }]);
  assert.deepEqual(repoRefs("medqr/node_modules/x/index.js:5", top), [], "зависимостите не са в репото");
  assert.deepEqual(repoRefs("node tools/agents/oversee.mjs → изход 0", top), [{ path: "tools/agents/oversee.mjs", line: null }]);
});

test("scan: изтрит файл и ред извън файла са мъртви; живите, URL-ите и Карантината — не", () => {
  const root = fixture();
  try {
    const r = scan(root);
    const k = r.find((a) => a.agent === "kodadjiyata");
    assert.equal(k.lessons, 5);
    assert.equal(k.withRefs, 4);
    assert.deepEqual(k.dead.map((d) => [d.date, d.path, d.problem.split(" ")[0]]), [
      ["2026-11-02", "tools/agents/old-tool.mjs", "липсва"],
      ["2026-11-03", "tools/agents/live.mjs", "ред"],
    ]);
    assert.deepEqual(deadRefs([{ path: "medqr/src/db.js", line: 51 }], root).map((d) => d.problem), ["ред 51 > 50 реда"]);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("CLI: доклад, който не гейтва (L1) — изход 0 и с мъртви източници; --json е машинен", () => {
  const root = fixture();
  try {
    const run = (...a) => spawnSync(process.execPath, [join(HERE, "source-check.mjs"), ...a], { encoding: "utf8", env: { ...process.env, SOURCE_CHECK_ROOT: root } });
    const out = run();
    assert.equal(out.status, 0, out.stderr);
    assert.match(out.stdout, /2 мъртви източника/);
    assert.match(out.stdout, /kodadjiyata/);
    const json = JSON.parse(run("--json").stdout);
    assert.equal(json.dead, 2);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
