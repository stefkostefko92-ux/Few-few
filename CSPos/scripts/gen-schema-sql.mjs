// SQL на цялата схема (от празна база) → src/lib/schema-sql.generated.ts.
//
//   node scripts/gen-schema-sql.mjs        # след всяка промяна на prisma/schema.prisma
//
// Вграденият SQL е основата за безопасното обновяване на базата при нова версия
// (src/lib/schema-upgrade.ts): липсващите таблици, колони и индекси се добавят при старт.
// Тестът `supto-complete.test.ts` пада, ако файлът изостане от схемата.

import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sql = execFileSync(
  "npx",
  ["prisma", "migrate", "diff", "--from-empty", "--to-schema-datamodel", "prisma/schema.prisma", "--script"],
  { cwd: root, encoding: "utf8" }
).trim();

const out = [
  "// ГЕНЕРИРАН ФАЙЛ — не се пипа на ръка. `node scripts/gen-schema-sql.mjs` след промяна на схемата.",
  "// Пълният SQL на prisma/schema.prisma (SQLite) — основа на обновяването на базата при старт.",
  "",
  `export const SCHEMA_SQL = ${JSON.stringify(sql)};`,
  "",
].join("\n");
writeFileSync(join(root, "src", "lib", "schema-sql.generated.ts"), out);
process.stdout.write(`▸ src/lib/schema-sql.generated.ts (${sql.length} знака)\n`);
