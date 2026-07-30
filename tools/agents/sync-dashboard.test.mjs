// sync-dashboard.test.mjs — таблото не бива да лъже за знанието.
//
// Дефектът (измерен 2026-07-30): паметта е КАНОНИЧНА, таблото я огледалва — `memory-capture.mjs`
// пише `knowledge.lessons = countVerified(id)` при всяко улавяне. Но РЪЧНАТА редакция на паметта
// (курация, дедуп, промоция към _shared — точно каквото правихме цял ден) не минава през куката,
// затова числото в таблото замръзва. 10 от 28 агента бяха разсинхронени в ДВЕ посоки (3665 срещу
// реалните 3642). Нищо не го гейтваше: `oversee` СМЯТА верния брой, но не го сравнява с agents.json.
//
// Тестът пази контракта на CLI-то (изход 1 при разсинхрон) върху ИЗОЛИРАНА фикстура, не върху
// живото репо — иначе би мутирал реалните данни.

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const TOOL = join(ROOT, "tools", "agents", "sync-dashboard.mjs");

/** Мини-репо: един агент с N проверени поуки в паметта и произволно число в таблото. */
function fixture(memLessons, dashLessons) {
  const root = mkdtempSync(join(tmpdir(), "dashsync-"));
  mkdirSync(join(root, ".claude", "agents", "_memory"), { recursive: true });
  mkdirSync(join(root, "agents-dashboard"), { recursive: true });
  const bullets = Array.from({ length: memLessons },
    (_, i) => `- **2026-07-3${i % 10}:** поука ${i}. _(тест; verified; "tools/x.mjs:${i + 1}")_`).join("\n");
  writeFileSync(join(root, ".claude", "agents", "_memory", "testagent.md"),
    `# Памет\n\n## Проверени поуки\n${bullets}\n\n## Карантина\n`);
  writeFileSync(join(root, "agents-dashboard", "agents.json"),
    JSON.stringify({ agents: [{ id: "testagent", knowledge: { lessons: dashLessons } }] }, null, 2) + "\n");
  return root;
}
const run = (root, ...args) =>
  spawnSync(process.execPath, [TOOL, ...args], { encoding: "utf8", env: { ...process.env, CLAUDE_PROJECT_DIR: root } });
const shown = (root) =>
  JSON.parse(readFileSync(join(root, "agents-dashboard", "agents.json"), "utf8")).agents[0].knowledge.lessons;

test("--check ПАДА при разсинхрон (иначе не гейтва нищо)", () => {
  const root = fixture(5, 9);
  try {
    const r = run(root, "--check");
    assert.equal(r.status, 1, "разсинхрон 9≠5 трябва да върне изход 1");
    assert.match(r.stderr, /табло=\s*9/);
    assert.match(r.stderr, /памет=\s*5/);
    assert.equal(shown(root), 9, "--check НЕ бива да пише (само проверява)");
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("--check минава, когато таблото отговаря на паметта", () => {
  const root = fixture(4, 4);
  try {
    const r = run(root, "--check");
    assert.equal(r.status, 0);
    assert.match(r.stdout, /изравнено/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("синхронът изравнява и в ДВЕТЕ посоки (таблото беше и по-високо, и по-ниско)", () => {
  for (const [mem, dash] of [[7, 3], [3, 7]]) {
    const root = fixture(mem, dash);
    try {
      assert.equal(run(root).status, 0);
      assert.equal(shown(root), mem, `паметта (${mem}) е канонична, не таблото (${dash})`);
      assert.equal(run(root, "--check").status, 0, "след синхрон --check трябва да минава");
    } finally { rmSync(root, { recursive: true, force: true }); }
  }
});

test("живото репо е изравнено (регресия — днес беше 10 разсинхрона)", () => {
  const r = spawnSync(process.execPath, [TOOL, "--check"], { cwd: ROOT, encoding: "utf8" });
  assert.equal(r.status, 0, `табло↔памет разсинхрон в репото:\n${r.stderr}`);
});

test("проверката е в състава на гейта (иначе поправката не се налага)", () => {
  const gate = readFileSync(join(ROOT, "tools", "agents", "gate.mjs"), "utf8");
  assert.match(gate, /sync-dashboard\.mjs/, "dashboard-sync трябва да е в gate.mjs");
  assert.match(gate, /id:\s*"dashboard-sync"/);
  // Задължителна, не докладчик — иначе таблото може да лъже безнаказано.
  const rec = gate.slice(gate.indexOf('id: "dashboard-sync"'));
  assert.ok(!/required:\s*false/.test(rec.slice(0, rec.indexOf("}"))), "трябва да е ЗАДЪЛЖИТЕЛНА");
});
