#!/usr/bin/env node
/**
 * Проверява целостта на одиторския дневник.
 *
 * Пуска се самостоятелно и нарочно НЕ през приложението: проверката на дневника
 * не бива да зависи от софтуера, който го пише. Този скрипт чете файла и смята
 * веригата наново, с нула зависимости — може да се пусне и от одитор, който не
 * ни се доверява.
 *
 * Употреба: node scripts/verify-audit.mjs [път-до-audit.jsonl]
 * Изходен код: 0 = цял · 1 = има находки · 2 = няма такъв файл.
 */

import { existsSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";

const path =
  process.argv[2] ||
  join(process.env.IPLOOKUP_AUDIT_DIR?.trim() || join(process.cwd(), "data", "audit"), "audit.jsonl");

if (!existsSync(path)) {
  process.stderr.write(`Няма такъв дневник: ${path}\n`);
  process.exit(2);
}

/** Същата канонизация като `src/lib/hash-chain.ts`. Държи се в синхрон на ръка. */
function canonicalize(value) {
  if (value === null) return "null";
  if (typeof value === "number") return JSON.stringify(value);
  if (typeof value === "boolean" || typeof value === "string") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((v) => canonicalize(v === undefined ? null : v)).join(",")}]`;
  if (typeof value === "object") {
    const entries = Object.entries(value)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalize(v)}`).join(",")}}`;
  }
  throw new Error(`тип ${typeof value} не може да се канонизира`);
}

const sha256 = (text) => createHash("sha256").update(text, "utf8").digest("hex");
const GENESIS = "0".repeat(64);

const lines = readFileSync(path, "utf8").split("\n");
const problems = [];
let expectedPrev = GENESIS;
let count = 0;
let tip = GENESIS;

for (let index = 0; index < lines.length; index++) {
  const line = lines[index].trim();
  if (!line) continue;

  let record;
  try {
    record = JSON.parse(line);
  } catch {
    problems.push(`ред ${index + 1}: не е валиден JSON`);
    continue;
  }

  count++;
  const { prev, hash, ...rest } = record;
  if (prev !== expectedPrev) problems.push(`ред ${index + 1}: прекъсната връзка с предишния запис`);

  const recomputed = sha256(`${prev}\n${canonicalize(rest)}`);
  if (recomputed !== hash) problems.push(`ред ${index + 1}: съдържанието не отговаря на записания хеш`);

  // Нататък се продължава с преизчисления хеш — така една тиха промяна в
  // средата къса веригата до края и повредата се вижда по цялата ѝ дължина.
  expectedPrev = recomputed;
  tip = recomputed;
}

process.stdout.write(`Дневник: ${path}\nЗаписи: ${count}\n`);

if (problems.length === 0) {
  // Последното звено се обявява САМО при цяла верига: при повреда то не значи
  // нищо и би създало впечатление, че дневникът има валиден край.
  process.stdout.write(`Последно звено: ${tip}\n\n`);
  process.stdout.write("OK — веригата е цяла. Нито един запис не е променян след вписването.\n");
} else {
  process.stdout.write("Последно звено: не се определя — веригата е повредена.\n\n");
  process.stdout.write(`НАХОДКИ (${problems.length}):\n`);
  for (const problem of problems) process.stdout.write(`  · ${problem}\n`);
  process.exitCode = 1;
}
