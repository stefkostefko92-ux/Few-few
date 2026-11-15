// ablation-watch.test.mjs — нов модел ⇒ ритуалът за аблация е дължим; кандидатите стоят дословно.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { familyOf, currentModels, assess, ritualCommands, STAMP } from "./ablation-watch.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..");

test("семейство от id на модела; непознато → null", () => {
  assert.equal(familyOf("opus-5-5"), "opus");
  assert.equal(familyOf("sonnet-5-5"), "sonnet");
  assert.equal(familyOf("<synthetic>"), null);
  assert.equal(familyOf(undefined), null);
});

test("текущият модел е последният обслужен по ts, не най-честият", () => {
  const recs = [
    { model: "opus-5-5", ts: "2026-11-08T10:00" }, { model: "opus-5-5", ts: "2026-11-08T11:00" },
    { model: "opus-6", ts: "2026-11-09T09:00" }, { model: "sonnet-5-5", ts: "2026-11-01T09:00" }, { model: "x", ts: "2026-12-01" },
  ];
  assert.deepEqual(currentModels(recs), { opus: "opus-6", sonnet: "sonnet-5-5" });
});

test("нов модел в печатано семейство → дължимо; непечатано семейство не тригерира", () => {
  const stamp = { last: { models: { opus: "opus-5-5", sonnet: "sonnet-5-5" }, jobs: "kodadjiyata:kodadjiyata:6" },
    candidates: [{ id: "a", path: "P.md", find: "- **Ред А:**" }, { id: "b", path: "P.md", find: "- **Изтрит ред:**" }] };
  const read = () => "x\n- **Ред А:** нещо\n";
  const same = assess(stamp, { opus: "opus-5-5", sonnet: "sonnet-5-5", haiku: "haiku-4-5" }, read);
  assert.equal(same.due, false, "haiku не е в печата — не тригерира");
  assert.equal(assess(stamp, { opus: "opus-5-5" }, read).due, false, "семейство без записи ≠ нов модел");
  const moved = assess(stamp, { opus: "opus-6", sonnet: "sonnet-5-5" }, read);
  assert.equal(moved.due, true);
  assert.deepEqual(moved.changed, [{ family: "opus", from: "opus-5-5", to: "opus-6" }]);
  assert.deepEqual(moved.candidates.map((c) => [c.id, c.present]), [["a", true], ["b", false]]);
  const cmds = ritualCommands(stamp, moved.candidates, "/tmp/abl");
  assert.match(cmds[0], /live-run\.mjs --jobs kodadjiyata:kodadjiyata:6 --out \/tmp\/abl\/base$/);
  assert.equal(cmds.filter((c) => c.includes("--patch")).length, 1, "само живият кандидат получава рамо");
  assert.ok(cmds[1].includes("'P.md::- **Ред А:**::'"));
  assert.match(cmds.at(-1), /eval\.mjs --run/);
});

test("истинският печат: всеки кандидат стои дословно; пазач не е кандидат", () => {
  const stamp = JSON.parse(readFileSync(join(REPO, STAMP), "utf8"));
  assert.ok(stamp.last?.models?.opus && stamp.last?.jobs, "печатът носи модели и рамена");
  const r = assess(stamp, {}, (p) => readFileSync(join(REPO, p), "utf8"));
  for (const c of r.candidates) {
    assert.ok(c.present, `кандидатът ${c.id} не стои дословно в ${c.path}`);
    assert.doesNotMatch(c.path, /guard-/, "пазачите не са кандидати за аблация");
  }
});

test("CLI: доклад с изход 0; нов модел печата ритуала; --stamp пише новия модел", () => {
  const root = mkdtempSync(join(tmpdir(), "abl-"));
  try {
    mkdirSync(join(root, "tools", "agents", "evals"), { recursive: true });
    mkdirSync(join(root, "doc"), { recursive: true });
    writeFileSync(join(root, "doc", "P.md"), "- **Ред А:** x\n");
    writeFileSync(join(root, STAMP), JSON.stringify({ last: { date: "2026-10-31", ref: "abc", models: { opus: "opus-5-5" }, jobs: "kodadjiyata:kodadjiyata:6", result: "r" },
      candidates: [{ id: "a", path: "doc/P.md", find: "- **Ред А:**" }] }));
    const recs = join(root, "recs.json");
    writeFileSync(recs, JSON.stringify([{ model: "opus-6", ts: "2026-11-10T10:00" }]));
    const run = (...a) => spawnSync(process.execPath, [join(HERE, "ablation-watch.mjs"), ...a], { encoding: "utf8", env: { ...process.env, CLAUDE_PROJECT_DIR: root, ABLATION_RECORDS: recs } });
    const r = run();
    assert.equal(r.status, 0);
    assert.match(r.stdout, /нов модел opus: opus-5-5 → opus-6/);
    assert.match(r.stdout, /--patch 'doc\/P\.md::- \*\*Ред А:\*\*::'/);
    assert.equal(run("--stamp").status, 2, "без --ref/--result не печата");
    const s = run("--stamp", "--ref", "def", "--result", "махнат ред А: равно");
    assert.equal(s.status, 0, s.stderr);
    const after = JSON.parse(readFileSync(join(root, STAMP), "utf8"));
    assert.deepEqual(after.last.models, { opus: "opus-6" });
    assert.equal(after.last.ref, "def");
    assert.match(run().stdout, /няма нов модел/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
