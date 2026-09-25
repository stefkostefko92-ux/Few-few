#!/usr/bin/env node
// check.mjs — лек линт-гейт: всеки файл се парсва, модулите спазват къщните правила (≤300 реда,
// нула console/TODO), генерираният galaxy.js реално отговаря на текущия src/ (не е забравен stale).
import { readdirSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { bundle } from "./build.mjs";

const DIR = dirname(fileURLToPath(import.meta.url));
const errors = [];
const list = (dir, ext) => readdirSync(join(DIR, dir)).filter((f) => f.endsWith(ext)).map((f) => `${dir}/${f}`);
const modules = list("src", ".js");
const all = [...modules, ...list("test", ".js"), "build.mjs", "check.mjs"];

for (const f of all) {
  try {
    execFileSync(process.execPath, ["--check", join(DIR, f)], { stdio: "pipe" });
  } catch (err) {
    errors.push(`${f}: синтактична грешка\n${String(err.stderr).trim()}`);
  }
}
for (const f of modules) {
  const text = readFileSync(join(DIR, f), "utf8");
  const lines = text.split("\n").length - 1;
  if (lines > 300) errors.push(`${f}: ${lines} реда — раздели модула (лимит 300)`);
  if (/\bconsole\./.test(text)) errors.push(`${f}: console.* не се качва`);
  if (/\b(TODO|FIXME)\b/.test(text)) errors.push(`${f}: недовършен маркер (TODO/FIXME)`);
}

const generated = readFileSync(join(DIR, "..", "galaxy.js"), "utf8");
if (generated !== bundle()) errors.push("galaxy.js е остарял спрямо src/ — пусни: node galaxy/build.mjs");

if (errors.length) {
  process.stderr.write(`${errors.map((e) => `✘ ${e}`).join("\n")}\n`);
  process.exit(1);
}
process.stdout.write(`✓ galaxy check: ${all.length} файла парсват, ${modules.length} модула в правилата, galaxy.js е свеж\n`);
