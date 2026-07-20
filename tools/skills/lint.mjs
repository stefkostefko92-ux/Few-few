#!/usr/bin/env node
// lint.mjs — валидатор на нашия skills слой (.claude/skills/*/SKILL.md).
// Skills са on-demand работни процеси (виж CLAUDE.md). Този гейт пази стандарта: всеки skill има
// валиден frontmatter (name == папка, непразно description), непразно тяло, и реферираните scripts
// съществуват. Zero-dep, fail-closed за CI.
//
//   node tools/skills/lint.mjs          # човешки отчет, exit 1 при провал
//   node tools/skills/lint.mjs --json

import { readdirSync, readFileSync, existsSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

export const SKILLS_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "..", ".claude", "skills");

// Минимален YAML-frontmatter парсер (name/description) — без зависимости.
export function parseFrontmatter(md) {
  const m = md.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) return null;
  const body = md.slice(m[0].length).trim();
  const fm = {};
  const lines = m[1].split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const kv = line.match(/^([a-zA-Z_][\w-]*):\s*(.*)$/);
    if (!kv) continue;
    let [, key, val] = kv;
    if (val === ">-" || val === ">" || val === "|" || val === "|-") {
      // folded/block скаляр — събери отстъпените редове отдолу
      const buf = [];
      while (i + 1 < lines.length && /^\s+\S/.test(lines[i + 1])) buf.push(lines[++i].trim());
      val = buf.join(" ");
    } else {
      val = val.replace(/^["']|["']$/g, "");
    }
    fm[key] = val;
  }
  return { fm, body };
}

export function lintSkill(dir, name) {
  const errs = [], warns = [];
  const skillMd = join(dir, "SKILL.md");
  if (!existsSync(skillMd)) return { name, errs: ["липсва SKILL.md"], warns };
  const md = readFileSync(skillMd, "utf8");
  const parsed = parseFrontmatter(md);
  if (!parsed) return { name, errs: ["невалиден/липсващ YAML frontmatter (--- … ---)"], warns };
  const { fm, body } = parsed;
  if (!fm.name) errs.push("липсва name във frontmatter");
  else if (fm.name !== name) errs.push(`name „${fm.name}" ≠ име на папката „${name}"`);
  if (fm.name && !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(fm.name)) errs.push(`name „${fm.name}" не е kebab-case`);
  if (!fm.description) errs.push("липсва description (основният тригер механизъм)");
  else if (fm.description.length < 40) warns.push(`description е кратко (${fm.description.length}зн.) — добави кога се задейства`);
  if (!body || body.length < 30) errs.push("тялото на SKILL.md е празно/твърде кратко");
  // реферирани scripts/ файлове съществуват (лов на счупени пътища от вида scripts/foo)
  for (const ref of body.match(/scripts\/[\w./-]+/g) || []) {
    if (!existsSync(join(dir, ref))) warns.push(`реферира несъществуващ ${ref}`);
  }
  return { name, errs, warns };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const JSON_OUT = process.argv.includes("--json");
  const names = existsSync(SKILLS_DIR)
    ? readdirSync(SKILLS_DIR).filter((f) => statSync(join(SKILLS_DIR, f)).isDirectory())
    : [];
  const results = names.map((n) => lintSkill(join(SKILLS_DIR, n), n));
  const hardFails = results.reduce((a, r) => a + r.errs.length, 0);
  const warns = results.reduce((a, r) => a + r.warns.length, 0);
  if (JSON_OUT) { console.log(JSON.stringify({ skills: results.length, hardFails, warns, results }, null, 2)); process.exit(hardFails ? 1 : 0); }
  const g = (s) => `\x1b[32m${s}\x1b[0m`, r = (s) => `\x1b[31m${s}\x1b[0m`, y = (s) => `\x1b[33m${s}\x1b[0m`;
  console.log(`\n🧩  Skills lint — ${results.length} skill-а\n`);
  for (const res of results) {
    console.log(`  ${res.errs.length ? r("✗") : res.warns.length ? y("▲") : g("✓")} ${res.name}`);
    res.errs.forEach((e) => console.log(`      ✗ ${e}`));
    res.warns.forEach((w) => console.log(`      ▲ ${w}`));
  }
  console.log(`\nИтог: ${results.length} skill-а · ${hardFails} твърди · ${warns} предупреждения`);
  process.exit(hardFails ? 1 : 0);
}
