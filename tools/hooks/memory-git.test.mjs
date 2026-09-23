// memory-git.test.mjs — авто-комитът на паметта комитва САМО своите файлове.
//
// Дефектът (2026-09-23): скриптът правеше `git add <3 пътя>` и после ГОЛ `git commit` — commit-ът
// взима всичко staged в индекса, не само добавеното. Авто-комитът на razbivacha отнесе и качи
// чужди staged изтривания (vfr/css/fonts.css + WebP снимките), без HTML-а, който още ги сочеше →
// клонът в GitHub остана със счупени препратки. Тестът пуска ИСТИНСКИЯ скрипт в истинско репо.

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, appendFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gitSyncScript } from "../../.claude/hooks/memory-capture.mjs";

const git = (cwd, ...a) => spawnSync("git", a, { cwd, encoding: "utf8" });

test("авто-комитът НЕ взима чужди staged промени (само паметта + таблото)", () => {
  const root = mkdtempSync(join(tmpdir(), "memgit-"));
  try {
    mkdirSync(join(root, ".claude", "agents", "_memory"), { recursive: true });
    mkdirSync(join(root, "agents-dashboard"), { recursive: true });
    mkdirSync(join(root, "product", "css"), { recursive: true });
    writeFileSync(join(root, ".claude", "agents", "_memory", "testagent.md"), "# памет\n");
    writeFileSync(join(root, "agents-dashboard", "agents.json"), "{}\n");
    writeFileSync(join(root, "agents-dashboard", "index.html"), "<!doctype html>\n");
    writeFileSync(join(root, "product", "css", "fonts.css"), "/* чужд файл */\n");
    for (const a of [["init", "-q", "-b", "feature"], ["add", "-A"],
      ["-c", "user.name=t", "-c", "user.email=t@t", "commit", "-q", "-m", "init"]]) {
      assert.equal(git(root, ...a).status, 0);
    }
    // Чужда работа в процес: подготвено изтриване (точно сценарият от инцидента).
    assert.equal(git(root, "rm", "-q", "product/css/fonts.css").status, 0);
    // Агентът научава нещо.
    appendFileSync(join(root, ".claude", "agents", "_memory", "testagent.md"), "- поука\n");

    const script = gitSyncScript("testagent", root, join(root, ".lock"), "0");
    // Изходният код не се съди: без remote последната стъпка (git push) пада — очаквано.
    spawnSync("sh", ["-c", script], { cwd: root, encoding: "utf8" });
    assert.match(git(root, "log", "-1", "--format=%s").stdout, /^auto: testagent научи/, "авто-комитът трябва да е направен");

    const committed = git(root, "show", "--name-only", "--format=", "HEAD").stdout.trim().split("\n");
    assert.deepEqual(committed, [".claude/agents/_memory/testagent.md"],
      "авто-комитът трябва да съдържа само паметта на агента");
    const staged = git(root, "diff", "--cached", "--name-status").stdout.trim();
    assert.equal(staged, "D\tproduct/css/fonts.css", "чуждото staged изтриване трябва да ОСТАНЕ staged, некомитнато");
  } finally { rmSync(root, { recursive: true, force: true }); }
});
