#!/usr/bin/env node
/*
 * Помощен скрипт: превръща CSV файл с тегления в data/<game>.json.
 *
 * Употреба:
 *   node scripts/import-csv.mjs <game> <input.csv>
 *   game ∈ { 5x35, 6x42, 6x48 }
 *
 * CSV ред: ДАТА, n1, n2, ...   (датата е по желание; разделител , ; таб или интервал)
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const GAMES = {
  "5x35": { pool: 35, picks: 5 },
  "6x42": { pool: 42, picks: 6 },
  "6x48": { pool: 48, picks: 6 },
};

const [, , gameId, inputPath] = process.argv;
if (!gameId || !inputPath || !GAMES[gameId]) {
  console.error("Употреба: node scripts/import-csv.mjs <5x35|6x42|6x48> <input.csv>");
  process.exit(1);
}

const game = GAMES[gameId];
const text = readFileSync(inputPath, "utf8");
const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

const draws = [];
const errors = [];

function pad(x) {
  x = String(x);
  return x.length < 2 ? "0" + x : x;
}
function normDate(d) {
  if (!d) return null;
  let m = d.match(/^(\d{4})[-./](\d{1,2})[-./](\d{1,2})$/);
  if (m) return `${m[1]}-${pad(m[2])}-${pad(m[3])}`;
  m = d.match(/^(\d{1,2})[-./](\d{1,2})[-./](\d{4})$/);
  if (m) return `${m[3]}-${pad(m[2])}-${pad(m[1])}`;
  return d;
}

lines.forEach((line, i) => {
  const tokens = line.split(/[,;\t ]+/).filter(Boolean);
  let date = null;
  let nums = tokens;
  if (/^\d{1,4}[-./]\d{1,2}[-./]\d{1,4}$/.test(tokens[0])) {
    date = tokens[0];
    nums = tokens.slice(1);
  }
  const numbers = nums.map((t) => parseInt(t, 10));
  if (numbers.some((x) => Number.isNaN(x))) {
    if (i === 0) return; // вероятно заглавен ред
    errors.push(`Ред ${i + 1}: нечислови стойности`);
    return;
  }
  if (numbers.length !== game.picks) {
    errors.push(`Ред ${i + 1}: очаквани ${game.picks} числа, намерени ${numbers.length}`);
    return;
  }
  if (numbers.some((n) => n < 1 || n > game.pool)) {
    errors.push(`Ред ${i + 1}: число извън 1–${game.pool}`);
    return;
  }
  draws.push({ date: normDate(date), numbers });
});

draws.sort((a, b) => (a.date && b.date ? (a.date < b.date ? -1 : 1) : 0));

const outDir = join(dirname(fileURLToPath(import.meta.url)), "..", "data");
const outPath = join(outDir, gameId + ".json");
writeFileSync(outPath, JSON.stringify(draws, null, 2) + "\n");

console.log(`Записани ${draws.length} тиража в ${outPath}`);
if (errors.length) {
  console.log(`Пропуснати ${errors.length} реда:`);
  errors.slice(0, 10).forEach((e) => console.log("  - " + e));
}
