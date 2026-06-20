#!/usr/bin/env node
// Сваля сурови обяви от активните адаптери, нормализира ги през @car-monitor/ingest
// и емитва SQL файл в data/. Прилага само с --apply (аналог на scripts/load-eop.mjs).
//
// Употреба:
//   node --experimental-strip-types scripts/load-listings.mjs [--apply] [--out data/listings.sql]

import { writeFile, mkdir } from "node:fs/promises";
import { execSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeListing } from "@car-monitor/ingest";
import { enabledAdapters } from "../src/adapters.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const outIdx = args.indexOf("--out");
const out = outIdx >= 0 ? args[outIdx + 1] : resolve(root, "data/listings.sql");

function sqlValue(v) {
  if (v == null) return "NULL";
  if (typeof v === "number") return String(v);
  return `'${String(v).replace(/'/g, "''")}'`;
}

function insert(table, row) {
  const cols = Object.keys(row);
  return `INSERT OR REPLACE INTO ${table} (${cols.join(", ")}) VALUES (${cols
    .map((c) => sqlValue(row[c]))
    .join(", ")});`;
}

// Контекст без външни данни (CLI: медианите се преизчисляват от rollups след зареждане).
const ctx = {
  eurPerUnit: (c) => (c === "EUR" ? 1 : c === "BGN" ? 0.511292 : null),
  modelMedianEur: () => null,
  vinActiveElsewhere: () => false,
};

const lines = ["-- Генерирано от load-listings.mjs", "PRAGMA foreign_keys = OFF;"];
let count = 0;

for (const adapter of enabledAdapters()) {
  const raws = await adapter.fetch({ since: "2020-01-01", until: new Date().toISOString().slice(0, 10) });
  for (const raw of raws) {
    const { seller, vehicle, listing, events } = normalizeListing(raw, ctx);
    lines.push(insert("sellers", seller));
    lines.push(insert("vehicles", vehicle));
    lines.push(insert("listings", listing));
    for (const e of events) lines.push(insert("events", e));
    count++;
  }
}

await mkdir(dirname(out), { recursive: true });
await writeFile(out, lines.join("\n") + "\n", "utf8");
console.log(`Записани ${count} обяви → ${out}`);

if (apply) {
  console.log("Прилагане към локалната D1 (wrangler)...");
  execSync(`wrangler d1 execute car-monitor --local --file="${out}"`, {
    cwd: resolve(root, "../web"),
    stdio: "inherit",
  });
}
