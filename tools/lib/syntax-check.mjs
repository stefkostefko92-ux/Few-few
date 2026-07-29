#!/usr/bin/env node
// syntax-check.mjs — `node --check` върху ВСЕКИ наш .mjs файл.
//
// Защо. Българският е източникът на истината, а типографските кавички са „ … “. В JS низ,
// отворен с права кавичка, вътрешната ПРАВА кавичка го затваря:
//
//     test("липсва „Статус:" — грешка", ...)
//                            ^ тук низът свършва → SyntaxError
//
// Този клас дефект удари ПЕТ пъти в една сесия. `node --test` го лови само за файлове, които някой
// тест внася; инструмент без тест (напр. `flow-ledger.mjs`) щеше да гръмне чак в реален ран, в
// най-лошия момент. Сметката е проста: проверката струва под секунда, дефектът струва цял цикъл.
//
// Поправката НЕ е дисциплина, а гейт. Дисциплината вече се провали пет пъти.
//
//   node tools/lib/syntax-check.mjs            # провери всичко (изход 1 при синтактична грешка)
//   node tools/lib/syntax-check.mjs --json

import { spawn } from "node:child_process";
import { readdirSync } from "node:fs";
import { cpus } from "node:os";
import { join, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const JSON_OUT = process.argv.includes("--json");

// Нашият код: инструментите и куките. Продуктите имат свои toolchain-ове и гейтове.
const ROOTS = [join(ROOT, "tools"), join(ROOT, ".claude", "hooks")];
const SKIP = new Set(["node_modules", ".git", "dist", "build", "coverage", "fixtures"]);

export function collectFiles(dirs = ROOTS) {
  const out = [];
  const walk = (d) => {
    let e; try { e = readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const x of e) {
      if (x.isDirectory()) { if (!SKIP.has(x.name)) walk(join(d, x.name)); }
      else if (/\.(mjs|js)$/.test(x.name)) out.push(join(d, x.name));
    }
  };
  dirs.forEach(walk);
  return out.sort();
}

function check(file) {
  return new Promise((resolve) => {
    const p = spawn(process.execPath, ["--check", file], { cwd: ROOT });
    let err = "";
    p.stderr.on("data", (d) => { err += d; });
    p.on("close", (code) => resolve({ file: relative(ROOT, file), ok: code === 0, err: err.trim() }));
    p.on("error", (e) => resolve({ file: relative(ROOT, file), ok: false, err: String(e) }));
  });
}

export async function checkAll(files = collectFiles()) {
  const limit = Math.max(2, Math.min(16, (cpus() || []).length || 4));
  const queue = [...files];
  const results = [];
  await Promise.all(Array.from({ length: limit }, async () => {
    for (let f = queue.shift(); f; f = queue.shift()) results.push(await check(f));
  }));
  return {
    checked: results.length,
    bad: results.filter((r) => !r.ok).sort((a, b) => a.file.localeCompare(b.file)),
  };
}

// CLI само при пряко извикване. БЕЗ този пазач тялото тичаше при `import` от тест и `process.exit`
// убиваше самия тест-рънър — от 5 теста се изпълняваше 1, а изходът изглеждаше зелен. Точно същият
// клас „зелено, защото е сляпо“, който гоним другаде.
async function main() {
  const { checked, bad } = await checkAll();
  if (JSON_OUT) {
    console.log(JSON.stringify({ checked, bad }, null, 2));
    process.exit(bad.length ? 1 : 0);
  }
  if (!bad.length) {
    console.log(`✓ syntax-check: ${checked} файла се парсват чисто.`);
    process.exit(0);
  }
  console.error(`✗ syntax-check: ${bad.length}/${checked} файла НЕ се парсват:\n`);
  for (const b of bad) {
    // Първите редове на грешката носят файла:реда и самия ред — останалото е стек, безполезен тук.
    console.error(`  ${b.file}`);
    for (const l of b.err.split("\n").slice(0, 4)) console.error(`      ${l}`);
    console.error("");
  }
  console.error(`Честа причина: права кавичка вътре в „ … “ затваря JS низа. Ползвай „ … “ или премахни кавичките.`);
  process.exit(1);
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
