#!/usr/bin/env node
// Добавя/обновява админ в data/admins.json (bcrypt хеш). Употреба:
//   node scripts/hash-admin.mjs <потребител> <парола>
// Папката за данни се взима от MASTILKO_DATA_DIR (по подразбиране ./data).
import bcrypt from "bcryptjs";
import { promises as fs } from "fs";
import path from "path";

const [, , user, pass] = process.argv;
if (!user || !pass) {
  console.error("Употреба: node scripts/hash-admin.mjs <потребител> <парола>");
  process.exit(1);
}

const dir = process.env.MASTILKO_DATA_DIR || path.join(process.cwd(), "data");
const file = path.join(dir, "admins.json");

let table = {};
try {
  table = JSON.parse(await fs.readFile(file, "utf8"));
} catch {
  /* първи админ — започваме от празно */
}
table[user] = bcrypt.hashSync(pass, 10);

await fs.mkdir(dir, { recursive: true });
await fs.writeFile(file, JSON.stringify(table, null, 2), "utf8");
console.log(`✔ Админ „${user}“ е записан в ${file}`);
