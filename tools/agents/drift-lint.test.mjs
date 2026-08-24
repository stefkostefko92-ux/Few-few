// drift-lint.test.mjs — гейтът за дрейф остава зелен на чисто репо (CI auto-discover).
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";

const TOOL = join(dirname(fileURLToPath(import.meta.url)), "drift-lint.mjs");

test("drift-lint: репото е без дрейф (нула счупени пътища, нула memory дрейф, консистентна бройка)", () => {
  const out = JSON.parse(execFileSync("node", [TOOL, "--json"], { encoding: "utf8" }));
  assert.equal(out.brokenPaths.length, 0, "счупени файлови референции: " + JSON.stringify(out.brokenPaths));
  assert.equal(out.memoryDrift.length, 0, "memory↔domain дрейф: " + JSON.stringify(out.memoryDrift));
  assert.equal(out.countConsistency.length, 0, "бройка/ростер несъответствия: " + JSON.stringify(out.countConsistency));
});

// ── Кръг 12 (2026-08-04): ростерни твърдения из ЦЕЛИЯ слой ───────────────────────────────────────
// Два реални дефекта: (а) `tools/memory/README.md` твърдеше „matcher = 10-те агента", а settings.json
// изброява целия ростер — файлът просто не беше в обхвата (проверяваха се три твърдо изброени
// документа); (б) по-важното — българските клони СЪС `\b` бяха МЪРТВИ: в JS `\b` е ASCII-дефинирана,
// затова след кирилско „агента" граница НЕ се получава и `/(\d+)\s+агента\b/` не съвпада НИКОГА.
// Проверката отчиташе „бройката съвпада навсякъде" отчасти по слепота.
import { rosterClaims } from "./drift-lint.mjs";

test("кирилицата и `\\b`: доказваме защо старият шаблон беше мъртъв клон", () => {
  assert.equal(/(\d+)\s+агента\b/.test("шуми в 18 агента —"), false, "ако това стане true, Node е сменил \\b — преразгледай правилото");
  assert.equal(/(\d+)\s+агента/.test("шуми в 18 агента —"), true);
  assert.equal(/(\d+)\s+agents\b/.test("28 agents"), true, "латиницата работи — затова дефектът беше невидим");
});

test("ростерно твърдение с определителен член СЕ хваща (реалният дефект)", () => {
  const c = rosterClaims("Регистрация: `.claude/settings.json` (matcher = 10-те агента).");
  assert.equal(c.length, 1);
  assert.equal(c[0].num, 10);
});

// Измерено върху 125-те .md на слоя: широкото „N агента" дава 7 съвпадения, 6 от които ФАЛШИВИ.
// Тези шест са РЕАЛНИ низове от репото — ако правилото се разшири, този тест ще падне.
for (const [phrase, why] of [
  ["е 20 агента", "историческа поука в паметта (тогавашен размер)"],
  ["дава 23 агента", "историческа поука в паметта"],
  ["от 3 агента", "подмножество, не ростер"],
  ["от 4 агента", "подмножество, не ростер"],
  ["„8(2)“ шуми в 18 агента — затова", "брой засегнати, не ростер"],
  ["поука в ≥3 агента", "праг, не ростер"],
  ["Sonnet 4 subagents", "име на модел, не бройка"],
])
  test(`НЕ вдига по „${phrase}" (${why})`, () => {
    assert.deepEqual(rosterClaims(phrase), [], "правилото се е разширило — ще шуми и ще го изключат");
  });

test("други определителни форми също се хващат (субагента/подагента, интервал около тирето)", () => {
  assert.equal(rosterClaims("всичките 28-те субагента").length, 1);
  assert.equal(rosterClaims("24 - те подагента").length, 1);
});
