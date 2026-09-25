import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "fs";
import path from "path";

// Правило на репото: всяка страница носи поне 5 ключови думи и една от тях е
// „Carbon Stealth“. В Next.js `keywords` на страница ЗАМЕНЯ тези от layout-а
// (не се сливат), затова 15 страници бяха без бранда, макар layout-ът да го
// има. Страница без собствен масив наследява layout-а — проверява се и той.

const APP = path.join(process.cwd(), "src/app");

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = path.join(dir, n);
    return statSync(p).isDirectory() ? files(p) : /^(page|layout)\.tsx$/.test(n) ? [p] : [];
  });
}

test("keywords: ≥5 и „Carbon Stealth“ на всяка страница със собствен масив", () => {
  let checked = 0;
  for (const f of files(APP)) {
    const src = readFileSync(f, "utf8");
    const m = /keywords: \[([\s\S]*?)\]/.exec(src);
    if (!m) continue;
    const words = [...m[1]!.matchAll(/"([^"]+)"/g)].map((x) => x[1]);
    const rel = path.relative(APP, f);
    assert.ok(words.length >= 5, `${rel}: само ${words.length} ключови думи (нужни ≥5)`);
    assert.ok(words.includes("Carbon Stealth"), `${rel}: липсва „Carbon Stealth“ в keywords`);
    checked++;
  }
  // Предпазител: layout + 14 инструмента + конектор.
  assert.ok(checked >= 16, `проверени са само ${checked} файла — регулярният израз вероятно се е счупил`);
});
