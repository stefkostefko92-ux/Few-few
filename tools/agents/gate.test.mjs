// gate.test.mjs — гейтът трябва да остане ЕДИН източник.
//
// Дефектът, който този тест пази да не се върне: списъкът с проверки беше преписан на ръка в
// `agents.yml` (15 стъпки) и `agents-sweep.yml` (10) и двата се раздалечиха — седмичният „пълен"
// sweep тихо пропускаше пет проверки. Никой не го е решавал; просто дрейфна. Затова тук се
// проверява, че workflow-ите ВИКАТ gate.mjs, вместо да преписват стъпки.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const GATE = join(ROOT, "tools", "agents", "gate.mjs");
const wf = (n) => readFileSync(join(ROOT, ".github", "workflows", n), "utf8");

// `--list` е машинно четимият изглед на списъка — ползваме него, не парсваме сорса.
const listing = execFileSync(process.execPath, [GATE, "--list"], { encoding: "utf8" });
const ids = [...listing.matchAll(/^\s+[✓·]\s+(\S+)/gm)].map((m) => m[1]);

test("гейтът съдържа реален списък с проверки", () => {
  assert.ok(ids.length >= 15, `очаквам поне 15 проверки, намерих ${ids.length}`);
  assert.equal(new Set(ids).size, ids.length, "няма дублирани id-та");
});

test("всяка проверка сочи СЪЩЕСТВУВАЩ скрипт (иначе гейтът пада по грешна причина)", () => {
  const src = readFileSync(GATE, "utf8");
  const paths = [...src.matchAll(/cmd:\s*\["([^"]+)"/g)].map((m) => m[1]);
  assert.ok(paths.length >= 15);
  for (const p of paths) assert.ok(existsSync(join(ROOT, p)), `липсва скрипт: ${p}`);
});

test("критичните проверки са ЗАДЪЛЖИТЕЛНИ, не съветващи", () => {
  const required = [...listing.matchAll(/^\s+✓\s+(\S+)/gm)].map((m) => m[1]);
  for (const must of ["oversee", "error-ledger", "defect-rate", "token-budget", "consistency", "eval-check"])
    assert.ok(required.includes(must), `${must} трябва да гейтва, не само да докладва`);
});

test("и двата workflow-а викат gate.mjs — един източник, не два преписа", () => {
  for (const name of ["agents.yml", "agents-sweep.yml"]) {
    const y = wf(name);
    assert.match(y, /node tools\/agents\/gate\.mjs/, `${name} трябва да вика gate.mjs`);
  }
});

test("workflow-ите вече НЕ преписват отделните проверки на ръка (там дрейфът се раждаше)", () => {
  // Ако някой пак изброи проверките в YAML, този тест пада и връща разговора към gate.mjs.
  const inlined = ["oversee.mjs", "drift-lint.mjs", "consistency-audit.mjs", "recovery-audit.mjs", "token-budget.mjs"];
  for (const name of ["agents.yml", "agents-sweep.yml"]) {
    const runLines = wf(name).split("\n").filter((l) => /^\s*(run:|\s+node )/.test(l)).join("\n");
    for (const tool of inlined)
      assert.ok(!runLines.includes(tool), `${name} пак изброява ${tool} на ръка — добави я в gate.mjs вместо тук`);
  }
});

test("--list не пуска нищо (безопасен е за четене на състава)", () => {
  assert.match(listing, /Гейт на агентския слой/);
  assert.ok(!/СТАТУС/.test(listing), "--list само описва, не изпълнява");
});
