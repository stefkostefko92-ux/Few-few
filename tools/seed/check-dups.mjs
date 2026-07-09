#!/usr/bin/env node
// check-dups.mjs — засича дублирани slug-ове из всички zabobovdol сийд файлове.
// „Ръцете" на агента Сийдъра: преди да обявиш сийд за готов, увери се, че няма два
// записа с един и същ slug в различни seed-*.ts (иначе upsert-ите се пребиват).
//
// Употреба:  node tools/seed/check-dups.mjs [glob-папка]
//   по подразбиране сканира zabobovdol/prisma/seed-*.ts
import fs from "node:fs";
import path from "node:path";

const dir = process.argv[2] || "zabobovdol/prisma";
let files;
try {
  files = fs.readdirSync(dir).filter((f) => /^seed.*\.ts$/.test(f)).map((f) => path.join(dir, f));
} catch (e) {
  console.error(`✘ Не мога да чета ${dir}: ${e.message}`);
  process.exit(2);
}
if (!files.length) { console.error(`Няма seed-*.ts в ${dir}`); process.exit(2); }

const seen = new Map(); // slug -> [ "file:line", … ]
const slugRe = /\bslug\s*:\s*["'`]([^"'`]+)["'`]/g;

for (const file of files) {
  const lines = fs.readFileSync(file, "utf8").split("\n");
  lines.forEach((line, i) => {
    let m;
    while ((m = slugRe.exec(line)) !== null) {
      const slug = m[1];
      const where = `${file}:${i + 1}`;
      if (!seen.has(slug)) seen.set(slug, []);
      seen.get(slug).push(where);
    }
  });
}

const dups = [...seen.entries()].filter(([, locs]) => locs.length > 1);
const total = [...seen.keys()].length;
console.log(`Сканирани ${files.length} файла · ${total} уникални slug-а\n`);

if (!dups.length) { console.log("✔ Няма дублирани slug-ове."); process.exit(0); }

console.log(`✘ ${dups.length} дублирани slug-а:`);
for (const [slug, locs] of dups) {
  console.log(`  „${slug}" →`);
  locs.forEach((l) => console.log(`     ${l}`));
}
console.log("\nЕдин slug = един запис. Преименувай или обедини дублиращите се.");
process.exit(1);
