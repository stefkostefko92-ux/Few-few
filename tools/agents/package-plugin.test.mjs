// package-plugin.test.mjs — plugin пакетажникът (CI auto-discovery).
import { test } from "node:test";
import assert from "node:assert/strict";
import { collectPluginAssets, manifest } from "./package-plugin.mjs";

test("събира 27-те агента (без _memory/_orchestration/README) + skills", () => {
  const a = collectPluginAssets();
  assert.ok(a.agents.length >= 27, `агенти: ${a.agents.length}`);
  assert.ok(!a.agents.some((f) => f.startsWith("_") || f === "README.md"));
  assert.ok(a.skills.length >= 20, `skills: ${a.skills.length}`);
});

test("манифестът има задължителното name (kebab-case) + честното hooks предупреждение", () => {
  const m = manifest({ agents: 27, skills: 21 });
  assert.match(m.name, /^[a-z0-9-]+$/);
  assert.ok(/hooks.*проектен|НЕ пътува/.test(m.description));
});
