// package-plugin.test.mjs — plugin пакетажникът (CI auto-discovery).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { collectPluginAssets, manifest } from "./package-plugin.mjs";

const REGISTRY = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "agents-dashboard", "agents.json");

test("пакетът носи ВСЕКИ регистриран агент (без _memory/_orchestration/README) + skills", () => {
  const a = collectPluginAssets();
  // `>= 27` минаваше и когато пакетът изпуснеше агент — праг не е покритие. Сравняваме с регистъра:
  // плъгин, който вози 27 от 28, е тихо непълен точно за новия агент.
  const roster = new Set(JSON.parse(readFileSync(REGISTRY, "utf8")).agents.map((x) => `${x.id}.md`));
  const packed = new Set(a.agents);
  const missing = [...roster].filter((f) => !packed.has(f));
  assert.deepEqual(missing, [], `плъгинът не вози: ${missing.join(", ")}`);
  assert.ok(!a.agents.some((f) => f.startsWith("_") || f === "README.md"));
  assert.ok(a.skills.length >= 20, `skills: ${a.skills.length}`);
});

test("манифестът има задължителното name (kebab-case) + честното hooks предупреждение", () => {
  const m = manifest({ agents: 28, skills: 21 });
  assert.match(m.name, /^[a-z0-9-]+$/);
  assert.ok(/hooks.*проектен|НЕ пътува/.test(m.description));
});
