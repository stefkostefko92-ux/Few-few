// mutation.test.mjs — помощникът трябва да ХВАЩА не-експеримента, иначе сам е фалшива увереност.

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync, rmSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { withMutation, replaceOnce, neuterExits, MutationNotApplied } from "./mutation.mjs";

const tmp = (content) => {
  const dir = mkdtempSync(join(tmpdir(), "mut-"));
  const f = join(dir, "target.mjs");
  writeFileSync(f, content);
  return { f, dir, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
};

test("мутация, която НЕ се прилага, ХВЪРЛЯ (иначе е фалшива увереност)", () => {
  const t = tmp("const a = 1;\n");
  try {
    assert.throws(
      () => withMutation(t.f, replaceOnce("НЯМА ГО ТОЗИ НИЗ", "x"), () => "не бива да стигне дотук"),
      MutationNotApplied,
      "точно това ме подведе веднъж: шаблонът липсва, нищо не се чупи, тестът е зелен",
    );
    assert.equal(readFileSync(t.f, "utf8"), "const a = 1;\n", "файлът остава непокътнат");
  } finally { t.cleanup(); }
});

test("наблюдението вижда СЧУПЕНОТО съдържание, после файлът се възстановява", () => {
  const t = tmp("export const x = 1;\n");
  try {
    const seen = withMutation(t.f, replaceOnce("= 1", "= 2"), () => readFileSync(t.f, "utf8"));
    assert.match(seen, /= 2/, "докато трае наблюдението, файлът е счупен");
    assert.equal(readFileSync(t.f, "utf8"), "export const x = 1;\n", "след това — възстановен");
  } finally { t.cleanup(); }
});

test("възстановява дори когато наблюдението ХВЪРЛИ (finally, не 'ако стигнем дотам')", () => {
  const t = tmp("const a = 1;\n");
  try {
    assert.throws(() => withMutation(t.f, replaceOnce("1", "2"), () => { throw new Error("бум"); }), /бум/);
    assert.equal(readFileSync(t.f, "utf8"), "const a = 1;\n");
  } finally { t.cleanup(); }
});

test("neuterExits понася ВЛОЖЕНИ скоби (регексната версия се счупи точно тук)", () => {
  // Реалната форма от oversee.mjs. Първата ми имплементация беше регекс `\(([^;)]*)\)` и спираше
  // на вътрешната скоба → произвеждаше `process.exit(0) ? 1 : 0)`. Трети случай за деня, в който
  // регекс върху вложена структура лъже.
  assert.equal(neuterExits("process.exit(hard || (STRICT && warn) ? 1 : 0);"), "process.exit(0);");
  assert.equal(neuterExits("process.exit(CHECK && hard.length ? 1 : 0);"), "process.exit(0);");
  assert.equal(neuterExits("process.exit(0);"), "process.exit(0);");
  // Няколко изхода в един файл — всички се обезвреждат.
  assert.equal(
    neuterExits("if (a) process.exit(1);\nprocess.exit(f(x) ? 2 : 0);"),
    "if (a) process.exit(0);\nprocess.exit(0);",
  );
  // Скоба вътре в НИЗ не бива да мести края.
  assert.equal(neuterExits(`process.exit(msg === ")" ? 1 : 0);`), "process.exit(0);");
});

test("neuterExits прави РЕАЛНА промяна върху условен изход (иначе мутацията е привидна)", () => {
  const src = "process.exit(hard ? 1 : 0);";
  assert.notEqual(neuterExits(src), src);
});

test("връща стойността на наблюдението (за да се твърди върху нея)", () => {
  const t = tmp("a\n");
  try {
    assert.equal(withMutation(t.f, replaceOnce("a", "b"), () => 42), 42);
  } finally { t.cleanup(); }
});

// ── Кръг 14 (2026-08-04): записът трябва да е АТОМАРЕН ──────────────────────────────────────────
// Реален дефект, хванат от CI: `flow-cost.test` падна с „префиксът 5178 т е над изведения таван
// 4490 т (обвързващ: „Тестове")", а локално беше зелен. Причината НЕ е съдържанието на мутацията, а
// самият запис: `writeFileSync` първо СЪКРАЩАВА файла, после пише, а `node --test` пуска тестовите
// ФАЙЛОВЕ паралелно. Четец, попаднал в този прозорец, вижда ПРАЗЕН файл.
//
// Диагнозата е доказана чрез възпроизвеждане на СЪСТОЯНИЕТО, не на състезанието: изпразване на
// `_memory/izpitatelya.md` дава точно 4490 и точно „Тестове" — а мутиращият тест мутира точно
// `izpitatelya`. (6 паралелни локални пуска не хванаха самото състезание: прозорецът е тесен.)
import { writeAtomic } from "./mutation.mjs";
import { openSync, readSync, closeSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
const ROOT_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

test("writeAtomic никога не оставя файла празен (rename, не truncate+write)", () => {
  const dir = mkdtempSync(join(tmpdir(), "atomic-"));
  const f = join(dir, "a.txt");
  try {
    writeFileSync(f, "СТАРО СЪДЪРЖАНИЕ");
    // Държим отворен дескриптор към СТАРИЯ inode; след rename той още чете старото — точно
    // свойството, което truncate+write няма (там дескрипторът вижда съкратен файл).
    const fd = openSync(f, "r");
    writeAtomic(f, "НОВО");
    const buf = Buffer.alloc(64);
    const n = readSync(fd, buf, 0, 64, 0);
    closeSync(fd);
    assert.equal(buf.slice(0, n).toString(), "СТАРО СЪДЪРЖАНИЕ", "старият четец вижда СТАРОТО, не празно");
    assert.equal(readFileSync(f, "utf8"), "НОВО", "новият четец вижда НОВОТО");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("writeAtomic не оставя временни файлове", () => {
  const dir = mkdtempSync(join(tmpdir(), "atomic-"));
  try {
    writeAtomic(join(dir, "b.txt"), "нещо");
    assert.deepEqual(readdirSync(dir), ["b.txt"], "`.tmp-<pid>` трябва да е преименуван, не оставен");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("мутиращите помощници ползват АТОМАРЕН запис (регресия срещу връщане към writeFileSync)", () => {
  for (const rel of ["tools/lib/mutation.mjs", "tools/agents/deep-audit.test.mjs"]) {
    const src = readFileSync(join(ROOT_DIR, rel), "utf8");
    const body = src.split("\n").filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join("\n");
    assert.doesNotMatch(body, /writeFileSync\(\s*(file|path)\s*,/,
      `${rel}: мутацията на СПОДЕЛЕН файл трябва да е през writeAtomic — иначе паралелен тест чете празно`);
  }
});
