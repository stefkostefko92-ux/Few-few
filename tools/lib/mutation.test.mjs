// mutation.test.mjs — помощникът трябва да ХВАЩА не-експеримента, иначе сам е фалшива увереност.

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
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
