// frontmatter-fields.test.mjs — грешно поле или стойност във frontmatter е твърда грешка, не тих пропуск.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { frontmatterIssues } from "./frontmatter-fields.mjs";

const AGENTS = join(dirname(fileURLToPath(import.meta.url)), "../../.claude/agents");

test("всичките 29 реални дефиниции са с познати полета и валидни стойности", () => {
  const files = readdirSync(AGENTS).filter((f) => f.endsWith(".md") && !f.startsWith("_") && f !== "README.md");
  assert.ok(files.length >= 29);
  for (const f of files) {
    const fm = readFileSync(join(AGENTS, f), "utf8").split(/^---\s*$/m)[1] || "";
    assert.deepEqual(frontmatterIssues(fm), [], f);
  }
});

test("грешно изписани полета и стойности се хващат", () => {
  assert.match(frontmatterIssues("omitClaudeMD: true")[0], /непознато/);
  assert.match(frontmatterIssues("efort: high")[0], /непознато/);
  assert.match(frontmatterIssues("effort: hihg")[0], /невалидна/);
  assert.match(frontmatterIssues("model: gpt-5")[0], /невалидна/);
  assert.match(frontmatterIssues("maxTurns: 0")[0], /невалидна/);
  assert.match(frontmatterIssues("autoCompactWindow: 200k")[0], /100000/);
  assert.match(frontmatterIssues("autoCompactWindow: 50000")[0], /100000/);
  assert.deepEqual(frontmatterIssues("autoCompactWindow: 200000\neffort: medium\nmodel: claude-opus-5-5\nskills:\n  - agent-doctrine"), []);
});
