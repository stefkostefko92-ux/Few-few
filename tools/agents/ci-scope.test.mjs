// ci-scope.test.mjs — обхватът на CI гейта трябва да покрива това, което гейтът ПРОВЕРЯВА.
//
// Дефектът, който това затваря: `agents.yml` пуска пълния гейт И целия тестов пакет
// (`node --test $(find tools -name '*.test.mjs')`), но `paths:` филтърът беше само
// `tools/agents/**`, `tools/memory/**`, `tools/skills/**`. Тоест PR, който променя
// `tools/seo/`, `tools/lib/`, `tools/qa/`, `tools/security/`… минаваше БЕЗ да пусне нито
// един тест — при това с 412 налични теста. Собственият ми push с `prelaunch-audit.mjs`
// и `emit.mjs` мина само защото случайно бе пипнал и `errors.jsonl` под `tools/agents/`.
//
// Гейт, чийто ОБХВАТ е по-тесен от това, което ПРОВЕРЯВА, е зелен по слепота — точно както
// инжекционният гейт, който четеше `agents.json` вместо дефинициите, и `trajectory-audit`,
// който беше зелен, защото дневникът му липсваше.
//
// Тестът е формулиран като ИНВАРИАНТ, не като списък: всяка папка под `tools/`, в която има
// поне един `*.test.mjs`, трябва да е покрита от филтъра. Така нова папка с тестове не може
// тихо да остане извън CI.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const WF = join(ROOT, ".github", "workflows", "agents.yml");

/** Папките под tools/, които съдържат поне един тест — тоест които гейтът реално изпълнява. */
function toolDirsWithTests() {
  const out = new Set();
  const walk = (rel) => {
    for (const e of readdirSync(join(ROOT, rel), { withFileTypes: true })) {
      const child = `${rel}/${e.name}`;
      if (e.isDirectory()) walk(child);
      else if (e.name.endsWith(".test.mjs")) out.add(rel);
    }
  };
  walk("tools");
  return [...out];
}

/** Пътищата от `paths:` блоковете на workflow-а (и push, и pull_request). */
function workflowPaths(yaml) {
  return yaml.split("\n")
    .map((l) => l.match(/^\s+-\s+"([^"]+)"\s*$/))
    .filter(Boolean)
    .map((m) => m[1]);
}

/** Съвпада ли път-шаблон като „tools/**" с конкретна папка? */
function covers(pattern, dir) {
  if (!pattern.endsWith("/**")) return false;
  const base = pattern.slice(0, -3);
  return dir === base || dir.startsWith(base + "/");
}

test("CI филтърът покрива всяка папка под tools/, в която има тестове", () => {
  const patterns = workflowPaths(readFileSync(WF, "utf8"));
  const dirs = toolDirsWithTests();
  assert.ok(dirs.length > 5, `очаквах много папки с тестове, намерих ${dirs.length}`);
  const uncovered = dirs.filter((d) => !patterns.some((p) => covers(p, d)));
  assert.deepEqual(uncovered, [],
    `тези папки имат тестове, но промяна в тях НЕ пуска agents.yml:\n  ${uncovered.join("\n  ")}`);
});

test("гейтът наистина пуска всички тестове (иначе филтърът пази празно)", () => {
  const yaml = readFileSync(WF, "utf8");
  assert.match(yaml, /node --test \$\(find tools -name '\*\.test\.mjs'\)/,
    "стъпката с тестовете е сменена — провери дали този тест още мери правилното нещо");
  assert.match(yaml, /node tools\/agents\/gate\.mjs/, "пълният гейт трябва да се вика от workflow-а");
});

// Отрицателна проверка на самия помощник — предикат, който винаги връща true, би направил
// теста по-горе безсмислен, без нищо да падне.
test("covers() не покрива каквото не трябва", () => {
  assert.equal(covers("tools/**", "tools/seo"), true);
  assert.equal(covers("tools/**", "tools"), true);
  assert.equal(covers("tools/agents/**", "tools/seo"), false);
  assert.equal(covers("tools/agents/**", "tools/agents/evals"), true);
  assert.equal(covers("tools/agent/**", "tools/agents"), false, "префикс без разделител не е покритие");
  assert.equal(covers("tools", "tools/seo"), false, "шаблон без /** не покрива поддърво");
});
