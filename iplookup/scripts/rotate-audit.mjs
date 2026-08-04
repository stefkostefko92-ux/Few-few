#!/usr/bin/env node
/**
 * Запечатва одиторския дневник и започва нов.
 *
 * Срокът на съхранение изисква старите записи да могат да се извадят и после да
 * бъдат унищожени. Но веригата от хешове не понася изрязване: махнеш ли
 * началото, всичко след него виси в празното и дневникът изглежда повреден.
 *
 * Затова тук не се реже нищо. Текущият файл се ЗАПЕЧАТВА (премества се в архив
 * заедно с печат, който носи броя записи, последното звено и SHA-256 на самия
 * файл), а новият дневник продължава от същото звено. Двата файла заедно остават
 * една непрекъсната верига; а когато архивът бъде унищожен по срок, новият файл
 * честно показва, че началото му е другаде, вместо да се преструва, че историята
 * започва от нула.
 *
 * Употреба:
 *   node scripts/rotate-audit.mjs [--dir <папка>] [--force]
 *
 * Отказва да запечата повредена верига, освен с `--force`: повреденият дневник е
 * находка и се разследва, а не се прибира тихо в архива.
 */

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
};
const force = args.includes("--force");

const directory = flag("dir", process.env.IPLOOKUP_AUDIT_DIR?.trim() || join(process.cwd(), "data", "audit"));
const logPath = join(directory, "audit.jsonl");
const continuationPath = join(directory, "continuation.txt");
const archiveDir = join(directory, "archive");

if (!existsSync(logPath)) {
  process.stderr.write(`Няма дневник за запечатване: ${logPath}\n`);
  process.exit(2);
}

const GENESIS = "0".repeat(64);
const sha256 = (text) => createHash("sha256").update(text, "utf8").digest("hex");

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
  throw new Error(`тип ${typeof value}`);
}

const raw = readFileSync(logPath, "utf8");
const lines = raw.split("\n").filter((line) => line.trim());

if (lines.length === 0) {
  process.stdout.write("Дневникът е празен — няма какво да се запечата.\n");
  process.exit(0);
}

// Началото може да е звено на предишен архив, ако това не е първото въртене.
let expectedPrev = GENESIS;
if (existsSync(continuationPath)) {
  const saved = readFileSync(continuationPath, "utf8").trim();
  if (/^[0-9a-f]{64}$/.test(saved)) expectedPrev = saved;
}
const startsFrom = expectedPrev;

const problems = [];
let tip = expectedPrev;
let first = null;
let last = null;

for (let index = 0; index < lines.length; index++) {
  const record = JSON.parse(lines[index]);
  const { prev, hash, ...rest } = record;
  if (prev !== expectedPrev) problems.push(`ред ${index + 1}: прекъсната връзка`);
  const recomputed = sha256(`${prev}\n${canonicalize(rest)}`);
  if (recomputed !== hash) problems.push(`ред ${index + 1}: променено съдържание`);
  expectedPrev = recomputed;
  tip = recomputed;
  if (index === 0) first = record.ts;
  last = record.ts;
}

if (problems.length > 0 && !force) {
  process.stderr.write(
    `Веригата е повредена (${problems.length} находки) — запечатването е спряно.\n` +
      "Повреден дневник е находка и се разследва, а не се прибира тихо в архива.\n" +
      "Ако наистина искаш да го запечаташ както е, добави --force.\n",
  );
  process.exit(1);
}

mkdirSync(archiveDir, { recursive: true, mode: 0o700 });

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const archivePath = join(archiveDir, `audit-${stamp}.jsonl`);
renameSync(logPath, archivePath);

const seal = {
  sealedAt: new Date().toISOString(),
  archive: archivePath,
  entryCount: lines.length,
  firstEntryAt: first,
  lastEntryAt: last,
  startsFrom,
  tip,
  fileSha256: sha256(raw),
  chainIntact: problems.length === 0,
  problems,
};
writeFileSync(join(archiveDir, `audit-${stamp}.seal.json`), `${JSON.stringify(seal, null, 2)}\n`, { mode: 0o600 });

// Новият дневник продължава от същото звено.
writeFileSync(continuationPath, `${tip}\n`, { mode: 0o600 });
writeFileSync(logPath, "", { mode: 0o600 });

process.stdout.write(
  `Запечатани ${lines.length} записа.\n` +
    `Архив: ${archivePath}\n` +
    `Печат: ${join(archiveDir, `audit-${stamp}.seal.json`)}\n` +
    `Новият дневник продължава от ${tip}\n\n` +
    "Архивът се съхранява според срока, определен от администратора, и се\n" +
    "унищожава документирано. Печатът остава — по него се доказва какво е\n" +
    "съдържал архивът, дори след унищожаването му.\n",
);
