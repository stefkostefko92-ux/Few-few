// json-exit-parity.test.mjs — машинният изход (--json) носи СЪЩАТА присъда като текстовия.
//
// Реален дефект (2026-08-03): `flow-cost.mjs` и `token-budget.mjs` подаваха ЗАКОВАН `0` на
// `emitJsonNow` в `--json` пътя. Затова `--check --json` излизаше 0 дори при червено състояние —
// тих зелен, който всеки consumer на машинния изход (табло, CI скрипт) би приел за „чисто".
// Конвенцията на всички наши --check инструменти е обратната: --json носи гейт-присъдата.
//
// `gate-fallibility.test.mjs` НЕ хвана това — той чете само `process.exit(...)`, не аргумента на
// `emitJsonNow`. Затова тук проверяваме ПОВЕДЕНИЕ, не текст: при изкуствено червено състояние
// `--check` и `--check --json` трябва да дадат ЕДНАКЪВ ненулев изход. Мутацията е in-place и се
// възстановява във finally (byte-verify), защото инструментите извеждат ROOT от __dirname —
// копие в /tmp гледа друг корен и не възпроизвежда състоянието (научено: замърсен тест лъже).

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const run = (rel, args) => spawnSync(process.execPath, [join(ROOT, rel), ...args],
  { cwd: ROOT, encoding: "utf8" }).status;

/** Временно прави инструмента ЧЕРВЕН чрез точкова замяна, пуска fn, връща файла байт-за-байт. */
function whileRed(rel, find, replace, fn) {
  const path = join(ROOT, rel);
  const original = readFileSync(path, "utf8");
  assert.ok(original.includes(find), `${rel}: не намирам „${find}" за мутация`);
  writeFileSync(path, original.replace(find, replace));
  try { return fn(); }
  finally {
    writeFileSync(path, original);
    assert.equal(readFileSync(path, "utf8"), original, `${rel}: възстановяването се провали`);
  }
}

const CASES = [
  { rel: "tools/agents/token-budget.mjs", find: "PREFIX_TOKEN_HARD = 6000", replace: "PREFIX_TOKEN_HARD = 100" },
  { rel: "tools/agents/flow-cost.mjs", find: "TAX_WARN = 0.45", replace: "TAX_WARN = 0.01" },
];

for (const c of CASES) {
  test(`${c.rel}: --check --json носи СЪЩАТА присъда като --check (при червено)`, () => {
    whileRed(c.rel, c.find, c.replace, () => {
      const plain = run(c.rel, ["--check"]);
      const json = run(c.rel, ["--check", "--json"]);
      assert.notEqual(plain, 0, `${c.rel} --check би трябвало да е червено при мутацията`);
      assert.equal(json, plain, `${c.rel}: --json дава ${json}, а --check дава ${plain} — машинният изход лъже`);
    });
  });

  test(`${c.rel}: при ЗЕЛЕНО и двата пътя са 0`, () => {
    assert.equal(run(c.rel, ["--check"]), 0, `${c.rel} --check трябва да е зелен днес`);
    assert.equal(run(c.rel, ["--check", "--json"]), 0, `${c.rel} --check --json трябва да е зелен днес`);
  });
}

test("детекторът за закован exit хваща формата, който пропусна дефекта", () => {
  // gate-fallibility гледа само process.exit; този клас минаваше през emitJsonNow(value, 0).
  // Тук проверяваме, че НИКОЙ --check-способен инструмент не подава литерална 0 на emitJsonNow.
  
  const walk = (d) => readdirSync(d).flatMap((f) => {
    const p = join(d, f);
    return statSync(p).isDirectory() ? walk(p) : p.endsWith(".mjs") && !p.includes(".test.") ? [p] : [];
  });
  const offenders = [];
  for (const f of walk(join(ROOT, "tools"))) {
    const src = readFileSync(f, "utf8");
    if (!src.includes('"--check"')) continue;                 // само --check-способни
    // emitJsonNow(..., 0) със закована нула — многоредов, затова flat-ваме
    const flat = src.replace(/\s+/g, " ");
    for (const m of flat.matchAll(/emitJsonNow\([^;]*?\},\s*(\d+)\s*\)/g)) {
      if (m[1] === "0") offenders.push(f.replace(ROOT + "/", ""));
    }
  }
  assert.deepEqual(offenders, [], `--check инструменти със закован 0 в --json (тих зелен):\n  ${offenders.join("\n  ")}`);
});
