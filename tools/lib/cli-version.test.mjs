// cli-version.test.mjs — минималната версия на Claude Code за агентския слой.
import { test } from "node:test";
import assert from "node:assert/strict";
import { MIN_CLI, parseCliVersion, cliAtLeast, minCliProblem } from "./cli-version.mjs";

test("parseCliVersion: от изхода на `claude --version`", () => {
  assert.equal(parseCliVersion("2.1.322 (Claude Code)"), "2.1.322");
  assert.equal(parseCliVersion("claude 2.1.9"), "2.1.9");
  assert.equal(parseCliVersion("неизвестно"), null);
});

test("cliAtLeast: числово, не лексикографски", () => {
  assert.ok(cliAtLeast("2.1.322", "2.1.319"));
  assert.ok(cliAtLeast("2.1.319", "2.1.319"));
  assert.ok(!cliAtLeast("2.1.318", "2.1.319"));
  assert.ok(!cliAtLeast("2.1.99", "2.1.319"), "99 < 319 като число");
  assert.ok(cliAtLeast("2.2.0", "2.1.319"));
});

test("minCliProblem: под минимума — причина с версията; неизвестна версия — също отказ (fail-closed)", () => {
  assert.equal(MIN_CLI, "2.1.319");
  assert.equal(minCliProblem("2.1.322 (Claude Code)"), "");
  assert.match(minCliProblem("2.1.318 (Claude Code)"), /2\.1\.318 < 2\.1\.319.*worktree/);
  assert.match(minCliProblem("?"), /неизвестна версия/);
});
