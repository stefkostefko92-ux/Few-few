#!/usr/bin/env node
// Прилага D1 миграции локално, зарежда емитнатите данни и пресъздава rollups.
// Аналог на scripts/import.mjs в СИГМА. С --catchup сам пресмята прозореца.
//
// Употреба:
//   node scripts/import.mjs [--catchup] [--remote]

import { execSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const etlRoot = resolve(__dirname, "..");
const webRoot = resolve(etlRoot, "../web");
const dbPkg = resolve(etlRoot, "../../packages/db");

const args = process.argv.slice(2);
const remote = args.includes("--remote");
const catchup = args.includes("--catchup");
const loc = remote ? "--remote" : "--local";

function run(cmd, cwd = webRoot) {
  console.log(`$ ${cmd}`);
  execSync(cmd, { cwd, stdio: "inherit" });
}

// 1) Миграции.
run(`wrangler d1 migrations apply car-monitor ${loc}`);

// 2) Зареждане на данни. При --catchup сваля целия наличен прозорец, иначе скорошен.
const sinceArg = catchup ? "" : `--out "${resolve(etlRoot, "data/listings.sql")}"`;
run(
  `node --experimental-strip-types "${resolve(etlRoot, "scripts/load-listings.mjs")}" --apply ${sinceArg}`,
  etlRoot,
);

// 3) Пресъздаване на derived таблиците (rollups + search_index).
run(`wrangler d1 execute car-monitor ${loc} --file="${resolve(dbPkg, "rollups.sql")}"`);

console.log("Готово: миграции + данни + rollups приложени.");
