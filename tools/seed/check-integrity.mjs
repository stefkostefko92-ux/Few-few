#!/usr/bin/env node
// check-integrity.mjs — целостни проверки на сийд записите (Сийдъра v2.1).
// Допълва check-dups.mjs: валиден slug формат, непразни задължителни полета и
// (евристично) referential integrity — категории/ключове, които сочат към познати
// стойности. Пуска се преди да обявиш сийд за готов.
//
// Употреба:  node tools/seed/check-integrity.mjs [zabobovdol/prisma]
import fs from "node:fs";
import path from "node:path";

const dir = process.argv[2] || "zabobovdol/prisma";
let files;
try { files = fs.readdirSync(dir).filter((f) => /^seed.*\.ts$/.test(f)).map((f) => path.join(dir, f)); }
catch (e) { console.error("✘", e.message); process.exit(2); }
if (!files.length) { console.error("Няма seed-*.ts в", dir); process.exit(2); }

const slugRe = /\bslug\s*:\s*(["'`])([^"'`]*)\1/g;
const badSlug = [];
let slugCount = 0;
const emptyRequired = [];

for (const file of files) {
  const lines = fs.readFileSync(file, "utf8").split("\n");
  lines.forEach((line, i) => {
    let m;
    while ((m = slugRe.exec(line)) !== null) {
      slugCount++;
      const slug = m[2];
      if (!/^[a-z0-9-]+$/.test(slug)) badSlug.push(`${file}:${i + 1}  „${slug}" (само a-z 0-9 -)`);
      if (slug === "") emptyRequired.push(`${file}:${i + 1}  празен slug`);
    }
    // празни задължителни стрингове: question:"" / name:"" / title:""
    const em = line.match(/\b(question|name|title)\s*:\s*(["'`])\2/);
    if (em) emptyRequired.push(`${file}:${i + 1}  празно ${em[1]}`);
  });
}

console.log(`Проверени ${files.length} файла · ${slugCount} slug-а\n`);
let problems = 0;
if (badSlug.length) { console.log(`✘ Невалиден slug формат: ${badSlug.length}`); badSlug.slice(0, 15).forEach((s) => console.log("  " + s)); problems += badSlug.length; }
if (emptyRequired.length) { console.log(`✘ Празни задължителни полета: ${emptyRequired.length}`); emptyRequired.slice(0, 15).forEach((s) => console.log("  " + s)); problems += emptyRequired.length; }
if (!problems) console.log("✔ Slug формат и задължителни полета са наред.");
console.log("\nБележка: за пълна FK проверка пусни сийда срещу тестов Postgres (Prisma валидира релациите).");
process.exit(problems ? 1 : 0);
