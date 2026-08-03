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
import { emitJsonNow } from "../lib/emit.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const SKILLS_DIR = join(ROOT, ".claude", "skills");

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

// ── правила от официалния наръчник на Anthropic ───────────────────────────────────────────────
// „The Complete Guide to Building Skills for Claude" (33 стр.) описва изисквания, които са
// МЕХАНИЧНО проверими, а ние ги пазехме само по навик. Всяко от долните е буквално оттам:
//   · папката е kebab-case (без главни, интервали, долни черти);
//   · файлът е точно `SKILL.md` — с уважение към регистъра, никакви варианти;
//   · НУЛА ъглови скоби във frontmatter — то влиза в системния промпт, значи е инжекционна
//     повърхност. Открити 3 реални случая (`<head>`, `адитивно > разрушително`, `LCP<2.5s`);
//   · имена с префикс „claude"/„anthropic" са РЕЗЕРВИРАНИ (имахме `claude-uchitel`);
//   · description до 1024 знака и задължително носи И какво прави, И кога се задейства;
//   · без README.md вътре в папката — документацията е в SKILL.md или references/;
//   · тяло под 5000 думи, иначе подробностите отиват в references/ (прогресивно разкриване).
const RESERVED = /^(claude|anthropic)/i;
const DESC_MAX = 1024;
const BODY_MAX_WORDS = 5000;

export function lintSkill(dir, name) {
  const errs = [], warns = [];
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(name)) errs.push(`папката „${name}" не е kebab-case`);
  // Регистърът на файла: на Linux `skill.md` просто „липсва", но диагнозата е различна и
  // качването в Claude.ai пада с „Could not find SKILL.md". Казваме точната причина.
  const wrongCase = existsSync(dir)
    ? readdirSync(dir).find((f) => f !== "SKILL.md" && f.toLowerCase() === "skill.md")
    : null;
  if (wrongCase) errs.push(`файлът е „${wrongCase}" — трябва точно „SKILL.md" (регистърът е значим)`);
  if (existsSync(join(dir, "README.md"))) {
    errs.push("README.md вътре в папката — документацията отива в SKILL.md или references/");
  }
  const skillMd = join(dir, "SKILL.md");
  if (!existsSync(skillMd)) return { name, errs: [...errs, "липсва SKILL.md"], warns };
  const md = readFileSync(skillMd, "utf8");
  const parsed = parseFrontmatter(md);
  if (!parsed) return { name, errs: ["невалиден/липсващ YAML frontmatter (--- … ---)"], warns };
  const { fm, body } = parsed;
  if (!fm.name) errs.push("липсва name във frontmatter");
  else if (fm.name !== name) errs.push(`name „${fm.name}" ≠ име на папката „${name}"`);
  if (fm.name && !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(fm.name)) errs.push(`name „${fm.name}" не е kebab-case`);
  if (fm.name && RESERVED.test(fm.name)) errs.push(`name „${fm.name}" ползва РЕЗЕРВИРАН префикс (claude/anthropic)`);
  if (!fm.description) errs.push("липсва description (основният тригер механизъм)");
  else if (fm.description.length < 40) warns.push(`description е кратко (${fm.description.length}зн.) — добави кога се задейства`);
  else if (fm.description.length > DESC_MAX) errs.push(`description е ${fm.description.length}зн. > ${DESC_MAX}`);
  // Ъгловите скоби са забранени във всички СТОЙНОСТИ на frontmatter (то влиза дословно в системния
  // промпт → инжекционна повърхност). Гледаме разпарсените стойности, не суровия блок: `>-` е
  // валиден YAML маркер за сгънат скалар и суровата проверка го обяви за нарушение във всичките 21.
  for (const [k, v] of Object.entries(fm)) {
    const hit = String(v).match(/.{0,30}[<>].{0,30}/);
    if (hit) errs.push(`ъглова скоба в „${k}" (забранена — инжекционна повърхност): …${hit[0].trim()}…`);
  }
  if (!body || body.length < 30) errs.push("тялото на SKILL.md е празно/твърде кратко");
  const words = body.trim().split(/\s+/).length;
  if (words > BODY_MAX_WORDS) {
    warns.push(`тялото е ${words} думи > ${BODY_MAX_WORDS} — извади подробностите в references/`);
  }
  // реферирани scripts/ файлове съществуват (лов на счупени пътища от вида scripts/foo)
  for (const ref of body.match(/scripts\/[\w./-]+/g) || []) {
    if (!existsSync(join(dir, ref))) warns.push(`реферира несъществуващ ${ref}`);
  }
  // Реферирани инструменти от репото (`tools/…​.mjs`) — пътят е спрямо КОРЕНА, не спрямо skill-а.
  // Досега се проверяваха само `scripts/` препратките, затова `stripe-payment` цитираше
  // `tools/payments/stripe-lint.mjs` (реалният път е `tools/commerce/…`) и линтът мълчеше.
  // Skill, който вика несъществуващ инструмент, е счупен работен процес — това е ТВЪРД провал,
  // не съвет: изпълняващият агент ще удари „No such file" насред процедурата.
  for (const ref of new Set(body.match(/\btools\/[\w./-]+\.mjs\b/g) || [])) {
    if (!existsSync(join(ROOT, ref))) errs.push(`реферира несъществуващ инструмент ${ref}`);
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
  if (JSON_OUT) { await emitJsonNow({ skills: results.length, hardFails, warns, results }, hardFails ? 1 : 0); }
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
