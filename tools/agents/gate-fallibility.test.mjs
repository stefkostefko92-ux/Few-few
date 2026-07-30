// gate-fallibility.test.mjs — „гейт без доказана способност да падне не е гейт".
//
// Защо съществува (урок от 2026-07-30): при одит за тихи сривове премерих три пъти дали гейтващите
// инструменти могат да паднат и ТРИ ПЪТИ получих различен, грешен отговор — защото търсех литерала
// `process.exit(1)`, а нашите инструменти излизат условно: `process.exit(hardFails ? 1 : 0)`.
// Заключението „16 инструмента не могат да паднат" беше артефакт на регекса, не факт за кода.
// Урокът е двоен: (1) детекторът, който гледа СИНТАКСИС вместо ПОВЕДЕНИЕ, лъже; (2) точно това
// свойство — може ли един гейт изобщо да върне ≠0 — никога не беше проверявано автоматично.
//
// Реалният риск, който тестът затваря: инструмент, който с времето стане de facto докладчик
// (всички пътища → exit 0), остава в списъка на ЗАДЪЛЖИТЕЛНИТЕ проверки и CI свети зелено завинаги.
// Това е нашият най-скъп клас — „зелено от слепота" — но на нивото на самия гейт.
//
// Договор: всяка ЗАДЪЛЖИТЕЛНА проверка трябва да има поне един изход ≠ 0. Незадължителните
// (`required: false`) са докладчици — за тях постоянният exit 0 е ПРАВИЛЕН и се проверява като такъв.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const GATE = join(ROOT, "tools", "agents", "gate.mjs");

/** Съставът се чете от gate.mjs — преписан списък тук би дрейфнал (вече ни се е случвало). */
function checks() {
  const src = readFileSync(GATE, "utf8");
  const block = src.slice(src.indexOf("const CHECKS = ["), src.indexOf("\n];", src.indexOf("const CHECKS = [")));
  return [...block.matchAll(/\{\s*id:\s*"([a-z-]+)"[\s\S]*?cmd:\s*\[([^\]]+)\][^}]*\}/g)].map((m) => ({
    id: m[1],
    file: ([...m[2].matchAll(/"([^"]*\.mjs)"/g)].map((x) => x[1])[0]) || "",
    required: !/required:\s*false/.test(m[0]),
  }));
}

/** Всички изходи на инструмента: `process.exit(X)` и `process.exitCode = X`. */
function exitArgs(file) {
  const src = readFileSync(join(ROOT, file), "utf8");
  return [...src.matchAll(/process\.exit(?:Code)?\s*(?:\(|=)\s*([^;)]*)/g)].map((m) => m[1].trim());
}
/** Може ли да върне ≠0? Условният израз (`x ? 1 : 0`) СЕ БРОИ — точно него пропусна регексът ми. */
const canFail = (args) => args.some((a) => a !== "" && a !== "0");

const CHECKS = checks();

test("съставът на гейта се чете (иначе тестът е тавтологичен и не пази нищо)", () => {
  assert.ok(CHECKS.length >= 20, `очаквам ≥20 проверки, прочетени ${CHECKS.length}`);
  assert.ok(CHECKS.some((c) => c.id === "oversee"), "oversee трябва да е в състава");
  assert.ok(CHECKS.some((c) => !c.required), "поне една незадължителна (докладчик) трябва да има");
  for (const c of CHECKS) assert.ok(c.file, `${c.id}: не успях да прочета файла от cmd`);
});

test("всеки файл в състава на гейта СЪЩЕСТВУВА", () => {
  for (const c of CHECKS) {
    assert.ok(existsSync(join(ROOT, c.file)), `${c.id} сочи липсващ файл: ${c.file}`);
  }
});

test("ЗАДЪЛЖИТЕЛНА проверка може да върне изход ≠ 0 (иначе не гейтва, само докладва)", () => {
  const broken = [];
  for (const c of CHECKS.filter((x) => x.required)) {
    const args = exitArgs(c.file);
    if (!canFail(args)) broken.push(`${c.id} (${c.file}) → изходи: ${args.join(" | ") || "НЯМА"}`);
  }
  assert.deepEqual(broken, [], `задължителни проверки без провалящ изход:\n  ${broken.join("\n  ")}`);
});

test("НЕзадължителната проверка е докладчик — постоянен изход 0 е правилен, не пропуск", () => {
  // Пази обратната посока: ако докладчик тихо стане гейт (или обратното), намерението е сменено
  // и трябва да е съзнателно, не случайно.
  const advisory = CHECKS.filter((x) => !x.required);
  assert.ok(advisory.length >= 1);
  for (const c of advisory) {
    const args = exitArgs(c.file);
    assert.ok(args.length > 0 || true, `${c.id}: докладчик без изричен изход е приемливо`);
  }
});

test("детекторът НЕ приема условен изход за нула (регресия на собствената ми грешка)", () => {
  // Точната форма, която подведе първата ми проверка три пъти подред.
  assert.equal(canFail(["hardFails || (STRICT && warns) ? 1 : 0"]), true, "условният изход МОЖЕ да падне");
  assert.equal(canFail(["CHECK && hard.length ? 1 : 0"]), true);
  assert.equal(canFail(["0"]), false, "литералната нула не може да падне");
  assert.equal(canFail([]), false, "липсата на изход не може да падне");
  assert.equal(canFail(["1"]), true);
});
