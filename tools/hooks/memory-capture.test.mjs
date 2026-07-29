// memory-capture.test.mjs — поведенчески тест на СЪРЦЕТО на самообучението.
//
// Дефектът, който фиксира (най-тежкият тих провал, намиран дотук): `export { x as y } from`
// е РЕ-ЕКСПОРТ — изнася за други модули, но НЕ създава локална променлива. След унифицирането
// на източник-предиката `sourceIsReal(...)` вътре в main() хвърляше ReferenceError при ВСЯКО
// захващане, а fail-open catch-ът („никога не блокирай агента") го маскираше до нула симптоми:
// hook-ът излизаше с 0, паметта не растеше, версията не мърдаше — учебният цикъл на ЦЕЛИЯ флот
// мълчеше и изглеждаше като „празен ден", не като счупен. Никой съществуващ тест не пускаше
// РЕАЛНИЯ CLI път с реална поука — точно това прави този.

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const HOOK = join(REPO, ".claude", "hooks", "memory-capture.mjs");

function fixtureProject() {
  const root = mkdtempSync(join(tmpdir(), "memcap-"));
  mkdirSync(join(root, ".claude", "agents", "_memory"), { recursive: true });
  mkdirSync(join(root, "agents-dashboard"), { recursive: true });
  writeFileSync(join(root, ".claude", "agents", "_memory", "testagent.md"),
    "# Памет\n\n## Проверени поуки (verified)\n\n## Карантина (непроверени — НЕ са факт)\n");
  writeFileSync(join(root, "agents-dashboard", "agents.json"), JSON.stringify({
    meta: {}, agents: [{ id: "testagent", name: "Тест", knowledge: { lessons: 0 },
      evolution: [{ version: "0.1.0", date: "2026-01-01", event: "Раждане", detail: "-" }], activity: [] }],
  }, null, 2));
  return root;
}

function runCapture(root, learnBlock) {
  const transcript = join(root, "t.jsonl");
  writeFileSync(transcript, JSON.stringify({ message: { content: [{ type: "text", text: learnBlock }] } }) + "\n");
  return spawnSync(process.execPath, [HOOK], {
    input: JSON.stringify({ transcript_path: transcript }),
    encoding: "utf8", timeout: 20000,
    env: { ...process.env, CLAUDE_PROJECT_DIR: root },
  });
}

const BLOCK = (conf, src) => "```learn\nagent: testagent\ndate: 2026-07-29\nlessons:\n" +
  `  - text: тестова поука за регресията на захващането\n    confidence: ${conf}\n    source: ${src}\n    scope: тест\n` + "```";

test("verified поука с реален източник СЕ ЗАПИСВА в паметта (крахът беше точно тук)", () => {
  const root = fixtureProject();
  try {
    const r = runCapture(root, BLOCK("verified", "https://web.dev/articles/lcp"));
    assert.equal(r.status, 0, r.stderr);
    const mem = readFileSync(join(root, ".claude", "agents", "_memory", "testagent.md"), "utf8");
    assert.match(mem.split("## Карантина")[0], /тестова поука за регресията/,
      "поуката ЛИПСВА от «Проверени» — захващането пак мълчи (ReferenceError класът?)");
    // и версията се вдига от проверено учене (0.1 → 0.2)
    const dash = JSON.parse(readFileSync(join(root, "agents-dashboard", "agents.json"), "utf8"));
    const evo = dash.agents[0].evolution;
    assert.notEqual(evo[evo.length - 1].version, "0.1.0", "проверено учене трябва да вдига версията");
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("«verified» без реален източник пада в Карантина (не вярвай на самооценката)", () => {
  const root = fixtureProject();
  try {
    runCapture(root, BLOCK("verified", "просто така"));
    const mem = readFileSync(join(root, ".claude", "agents", "_memory", "testagent.md"), "utf8");
    assert.doesNotMatch(mem.split("## Карантина")[0], /тестова поука/);
    assert.match(mem.split("## Карантина")[1], /тестова поука/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("блок без agent: хедър е no-op (не гадае получателя)", () => {
  const root = fixtureProject();
  try {
    runCapture(root, "```learn\nlessons:\n  - text: сирак\n    confidence: verified\n    source: https://a.bg/x\n```");
    const mem = readFileSync(join(root, ".claude", "agents", "_memory", "testagent.md"), "utf8");
    assert.doesNotMatch(mem, /сирак/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
