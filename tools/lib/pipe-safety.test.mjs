// pipe-safety.test.mjs — ЗАБРАНА на класа „console.log(JSON) + process.exit" в tools/.
//
// Дефектът (измерен): `console.log(JSON.stringify(huge)); process.exit(0)` реже изхода на
// 65 536 байта, когато stdout е ТРЪБА — записът в Node е асинхронен, а exit не чака буфера.
// Към файл същият код работи (файловите записи са синхронни), затова дефектът е невидим при
// ръчна проверка, а CI и таблото четат точно през тръби. `quarantine-review --json` губеше
// 88% от данните МЪЛЧАЛИВО.
//
// Поправката е tools/lib/emit.mjs (emitJson/emitText/finish — задават exitCode, не убиват
// процеса). Този тест прави поправката ЗАДЪЛЖИТЕЛНА: нито един инструмент няма право да
// комбинира JSON изход с process.exit в съседство. Гейт, не дисциплина — дисциплината се
// изчерпва, гейтът остава.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const TOOLS = join(dirname(fileURLToPath(import.meta.url)), "..");

function walk(dir, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.name.endsWith(".mjs") && !e.name.endsWith(".test.mjs")) out.push(p);
  }
  return out;
}

test("никой инструмент не комбинира JSON изход с process.exit (класът на 64 KiB отрязването)", () => {
  const offenders = [];
  for (const f of walk(TOOLS)) {
    const src = readFileSync(f, "utf8");
    const lines = src.split("\n");
    lines.forEach((line, i) => {
      // забранено: console.log(JSON.stringify(...)) и process.exit на СЪЩИЯ или СЪСЕДЕН ред —
      // точно комбинацията, която реже. Самостоятелен console.log без exit е безопасен
      // (процесът излиза естествено и изпразва буфера). Коментарите не са код.
      if (line.trimStart().startsWith("//")) return;
      if (!/console\.log\(JSON\.stringify/.test(line)) return;
      const nearby = lines.slice(i, i + 3).join("\n");
      if (/process\.exit\(/.test(nearby)) offenders.push(`${f.replace(TOOLS, "tools")}:${i + 1}`);
    });
  }
  assert.deepEqual(offenders, [],
    `тези места режат JSON на 64 KiB през тръба — мини през emitJson() от tools/lib/emit.mjs:\n  ${offenders.join("\n  ")}`);
});
