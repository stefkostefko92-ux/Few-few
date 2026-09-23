// git-sync.test.mjs — авто-комитът на memory-capture срещу ИСТИНСКО временно git репо.
//
// Дефектът, който фиксира (на живо, 2026-09-21): `git add <3 файла>` + голо `git commit` комитва
// ЦЕЛИЯ индекс. Докато човекът беше по средата на merge на 746 комита (629 файла в индекса), агент
// научи поука → SubagentStop → „auto: izpitatelya научи — памет + версия + табло" погълна целия merge
// и го пушна. Два инварианта, всеки с мутация:
//   (1) ОТВОРЕНА git операция (merge/rebase/cherry-pick/revert) → авто-комитът не пипа нищо;
//   (2) чуждо стажирано съдържание НЕ влиза в авто-комита и ОСТАВА стажирано (`commit --only -- пътища`).
// Скриптът се взима от gitSyncScript() — същият низ, който hook-ът спавнва (push е изключен).

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { gitSyncScript } from "../../.claude/hooks/memory-capture.mjs";
import { withMutation } from "../lib/mutation.mjs";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const HOOK = join(REPO, ".claude", "hooks", "memory-capture.mjs");
const AGENT = "testagent";
const OURS = [`.claude/agents/_memory/${AGENT}.md`, "agents-dashboard/agents.json", "agents-dashboard/index.html"];

function git(cwd, ...args) {
  const r = spawnSync("git", args, { cwd, encoding: "utf8", env: { ...process.env, GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@t", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@t" } });
  return { status: r.status, out: (r.stdout + r.stderr).trim() };
}

/** Временно репо с нашите три файла в HEAD и един чужд файл. Връща корена. */
function fixtureRepo() {
  const root = mkdtempSync(join(tmpdir(), "gitsync-"));
  mkdirSync(join(root, ".claude", "agents", "_memory"), { recursive: true });
  mkdirSync(join(root, "agents-dashboard"), { recursive: true });
  for (const p of OURS) writeFileSync(join(root, p), `v1 ${p}\n`);
  writeFileSync(join(root, "foreign.txt"), "v1 foreign\n");
  assert.equal(git(root, "init", "-q", "-b", "main").status, 0);
  git(root, "config", "commit.gpgsign", "false");
  assert.equal(git(root, "add", "-A").status, 0);
  assert.equal(git(root, "commit", "-q", "-m", "init").status, 0, "init commit");
  return root;
}

function runSync(root, script = gitSyncScript(AGENT, { projectDir: root, push: false })) {
  assert.ok(script, "скриптът се генерира");
  const r = spawnSync("sh", ["-c", script], { cwd: root, encoding: "utf8", env: { ...process.env, GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@t", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@t" } });
  return r.status;
}
const headCount = (root) => Number(git(root, "rev-list", "--count", "HEAD").out);
const lastFiles = (root) => git(root, "show", "--name-only", "--format=", "HEAD").out.split("\n").filter(Boolean).sort();
const staged = (root) => git(root, "diff", "--cached", "--name-only").out.split("\n").filter(Boolean).sort();

test("КОНТРОЛА: нова поука → авто-комит само с нашите файлове", () => {
  const root = fixtureRepo();
  try {
    writeFileSync(join(root, OURS[0]), "v2 памет\n");
    runSync(root);
    assert.equal(headCount(root), 2, "има един авто-комит");
    assert.deepEqual(lastFiles(root), [OURS[0]]);
    assert.match(git(root, "log", "-1", "--format=%s").out, /^auto: testagent научи/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("нищо наше не е променено → нищо не се комитва (дори при чуждо стажирано)", () => {
  const root = fixtureRepo();
  try {
    writeFileSync(join(root, "foreign.txt"), "v2 foreign\n");
    git(root, "add", "foreign.txt");
    runSync(root);
    assert.equal(headCount(root), 1, "без авто-комит");
    assert.deepEqual(staged(root), ["foreign.txt"], "чуждото остава стажирано, непокътнато");
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("(2) чуждо стажирано съдържание НЕ влиза в авто-комита и остава стажирано", () => {
  const root = fixtureRepo();
  try {
    writeFileSync(join(root, "foreign.txt"), "v2 foreign\n");
    writeFileSync(join(root, "new-foreign.txt"), "нов чужд файл\n");
    git(root, "add", "foreign.txt", "new-foreign.txt");
    writeFileSync(join(root, OURS[0]), "v2 памет\n");
    writeFileSync(join(root, OURS[1]), "v2 табло\n");
    runSync(root);
    assert.equal(headCount(root), 2);
    assert.deepEqual(lastFiles(root), [OURS[0], OURS[1]].sort(), "само нашите два променени файла");
    assert.deepEqual(staged(root), ["foreign.txt", "new-foreign.txt"], "чуждото е ОЩЕ в индекса след авто-комита");
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("(1) отворен MERGE → авто-комитът не пипа нищо (реалният дефект: погълна merge на 746 комита)", () => {
  const root = fixtureRepo();
  try {
    // Клон с промяна по чужд файл; после merge --no-commit → MERGE_HEAD съществува, индексът е пълен.
    git(root, "checkout", "-q", "-b", "feature");
    writeFileSync(join(root, "foreign.txt"), "feature\n");
    git(root, "commit", "-q", "-am", "feature");
    git(root, "checkout", "-q", "main");
    writeFileSync(join(root, "other.txt"), "main\n");
    git(root, "add", "other.txt");
    git(root, "commit", "-q", "-m", "main move");
    const m = git(root, "merge", "--no-commit", "--no-ff", "feature");
    assert.equal(git(root, "rev-parse", "-q", "--verify", "MERGE_HEAD").status, 0, "MERGE_HEAD е отворен: " + m.out);
    const before = headCount(root);
    // Агентът учи по средата на merge-а.
    writeFileSync(join(root, OURS[0]), "v2 памет по време на merge\n");
    runSync(root);
    assert.equal(headCount(root), before, "нула комити по време на отворен merge");
    assert.equal(git(root, "rev-parse", "-q", "--verify", "MERGE_HEAD").status, 0, "merge-ът е още отворен — на човека");
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("(1) отворен CHERRY-PICK (конфликт) → също не пипа", () => {
  const root = fixtureRepo();
  try {
    git(root, "checkout", "-q", "-b", "side");
    writeFileSync(join(root, "foreign.txt"), "side\n");
    git(root, "commit", "-q", "-am", "side");
    git(root, "checkout", "-q", "main");
    writeFileSync(join(root, "foreign.txt"), "main conflict\n");
    git(root, "commit", "-q", "-am", "main conflict");
    git(root, "cherry-pick", "side"); // конфликт → CHERRY_PICK_HEAD
    assert.equal(git(root, "rev-parse", "-q", "--verify", "CHERRY_PICK_HEAD").status, 0, "CHERRY_PICK_HEAD е отворен");
    const before = headCount(root);
    writeFileSync(join(root, OURS[0]), "v2\n");
    runSync(root);
    assert.equal(headCount(root), before);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

/** Спрян на конфликт rebase: rebase-merge папката съществува, HEAD е detached, индексът е конфликтен. */
function openRebase(root) {
  git(root, "checkout", "-q", "-b", "side");
  writeFileSync(join(root, "foreign.txt"), "side\n");
  git(root, "commit", "-q", "-am", "side");
  git(root, "checkout", "-q", "main");
  writeFileSync(join(root, "foreign.txt"), "main conflict\n");
  git(root, "commit", "-q", "-am", "main conflict");
  git(root, "checkout", "-q", "side");
  git(root, "rebase", "main"); // конфликт → спира
  const dir = git(root, "rev-parse", "--git-path", "rebase-merge").out;
  assert.ok(existsSync(join(root, dir)) || existsSync(dir), "rebase-merge папката съществува (rebase е отворен)");
}

test("(1) отворен REBASE (конфликт) → не пипа", () => {
  const root = fixtureRepo();
  try {
    openRebase(root);
    const before = headCount(root);
    writeFileSync(join(root, OURS[0]), "v2\n");
    runSync(root);
    assert.equal(headCount(root), before, "нула комити по време на rebase");
  } finally { rmSync(root, { recursive: true, force: true }); }
});

// Само `--only` НЕ стига: git сам отказва частичен commit по време на merge/cherry-pick („cannot do a
// partial commit during a merge") — там `--only` е втора линия. Но по време на REBASE частичният commit
// е разрешен и без гарда авто-комитът вкарва чужд комит в средата на rebase-а на човека. Затова
// мутацията се доказва върху rebase — сценарият, в който само гардът пази.
test("МУТАЦИЯ: без гарда за отворена операция авто-комитът комитва по средата на rebase (тестът хапе)", () => {
  const root = fixtureRepo();
  try {
    openRebase(root);
    writeFileSync(join(root, OURS[0]), "v2\n");
    const before = headCount(root);
    const script = gitSyncScript(AGENT, { projectDir: root, push: false });
    const mutated = script.split("\n").filter((l) => !/MERGE_HEAD|rebase-merge/.test(l)).join("\n");
    assert.notEqual(mutated, script, "мутацията се приложи");
    runSync(root, mutated);
    assert.equal(headCount(root), before + 1, "мутантът комитва по време на rebase — точно дефектът");
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("МУТАЦИЯ: без `--only -- пътища` чуждото стажирано влиза в авто-комита (тестът хапе)", () => {
  const root = fixtureRepo();
  try {
    writeFileSync(join(root, "foreign.txt"), "v2 foreign\n");
    git(root, "add", "foreign.txt");
    writeFileSync(join(root, OURS[0]), "v2\n");
    const script = gitSyncScript(AGENT, { projectDir: root, push: false });
    // Само на commit реда: махаме `--only` и списъка с пътища (старият голо-commit).
    const mutated = script.replace(/(commit) --only (-m "[^"]*") -- [^\n]*?(>\/dev\/null)/, "$1 $2 $3");
    assert.notEqual(mutated, script, "мутацията се приложи");
    assert.match(mutated, /commit -m "[^"]*" >\/dev\/null/, "commit редът е голо-commit");
    runSync(root, mutated);
    assert.ok(lastFiles(root).includes("foreign.txt"), "мутантът е погълнал чуждия файл");
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("gitSyncScript: инжекция в agentId се отхвърля; push към main е изключен по подразбиране", () => {
  assert.equal(gitSyncScript("x; rm -rf /"), null);
  assert.equal(gitSyncScript("../etc"), null);
  const s = gitSyncScript(AGENT, { projectDir: "/tmp/x" });
  assert.match(s, /"main".*\[ "0" = "1" \] \|\| exit 0/, "на main не пушва без AGENT_MEMORY_PUSH_MAIN=1");
  assert.match(s, /commit --only /);
  assert.ok(!gitSyncScript(AGENT, { projectDir: "/tmp/x", push: false }).includes("git push"));
});

test("hook-ът реално ползва gitSyncScript (иначе тестовете горе мерят функция, която никой не вика)", () => {
  const src = readFileSync(HOOK, "utf8");
  assert.match(src, /const script = gitSyncScript\(agentId/, "bgGitSync строи скрипта през gitSyncScript");
  // Мутация: върнат стар голо-commit скрипт → инвариант (2) пада. Доказваме върху самия файл.
  withMutation(HOOK, (s) => s.replace("commit --only -m", "commit -m").replace(/ -- \$\{paths\} >\/dev\/null/, " >/dev/null"), () => {
    const r = spawnSync(process.execPath, ["--input-type=module", "-e",
      `import { gitSyncScript } from ${JSON.stringify("file://" + HOOK)}; process.stdout.write(gitSyncScript("a", { projectDir: "/x", push: false }))`],
      { encoding: "utf8" });
    assert.ok(!/commit --only/.test(r.stdout), "мутантът НЕ комитва с --only");
  });
});
