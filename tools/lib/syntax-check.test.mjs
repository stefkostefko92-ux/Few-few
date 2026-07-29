// syntax-check.test.mjs — метещият синтактичен гейт.
//
// Дефектът, който пази: български е източникът на истината, кавичките са „ … “, а права кавичка
// вътре в JS низ го затваря → SyntaxError. Този клас удари ПЕТ пъти в една сесия. `node --test`
// го лови само за файлове, които някой тест внася; инструмент без тест гърми чак в реален ран.

import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { writeFileSync, rmSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { collectFiles } from "./syntax-check.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const TOOL = join(HERE, "syntax-check.mjs");

test("събира реалните ни .mjs файлове (не празен списък)", () => {
  const files = collectFiles();
  assert.ok(files.length > 50, `очаквам целия инструментариум, намерих ${files.length}`);
  assert.ok(files.some((f) => f.endsWith("gate.mjs")));
  assert.ok(files.some((f) => f.includes(".claude/hooks/")), "куките също се проверяват");
  assert.ok(!files.some((f) => f.includes("node_modules")), "node_modules се пропуска");
});

test("подредбата е детерминистична (същият вход → същият изход)", () => {
  assert.deepEqual(collectFiles(), collectFiles());
});

test("реалното репо се парсва чисто (ако падне — има счупен файл)", () => {
  const out = execFileSync(process.execPath, [TOOL], { encoding: "utf8" });
  assert.match(out, /файла се парсват чисто/);
});

test("хваща точния дефект: права кавичка вътре в „ … “ затваря низа", () => {
  const dir = mkdtempSync(join(tmpdir(), "syncheck-"));
  try {
    const bad = join(dir, "bad.mjs");
    writeFileSync(bad, 'const m = "липсва „Статус:" — това чупи низа";\nexport default m;\n');
    let threw = false, stderr = "";
    try { execFileSync(process.execPath, ["--check", bad], { encoding: "utf8", stdio: "pipe" }); }
    catch (e) { threw = true; stderr = String(e.stderr || ""); }
    assert.ok(threw, "такъв файл ТРЯБВА да е синтактична грешка");
    assert.match(stderr, /SyntaxError/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("валиден български низ със затварящa „ … “ минава", () => {
  const dir = mkdtempSync(join(tmpdir(), "syncheck-ok-"));
  try {
    const good = join(dir, "good.mjs");
    writeFileSync(good, 'const m = "липсва „Статус:“ — това е наред";\nexport default m;\n');
    execFileSync(process.execPath, ["--check", good], { stdio: "pipe" });
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
