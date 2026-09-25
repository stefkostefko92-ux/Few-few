#!/usr/bin/env node
// glossary-check.mjs — налага клиничните термини от глосара (Преводач v2.1).
// Чете `.claude/agents/_shared/glossary.md` (BG·EN·IT таблиците) и проверява, че
// locale файловете НЕ разминават одобрен клиничен термин. Безопасно-критично:
// разминаване = провал (после човешка проверка). Без модел, без интернет.
//
// Употреба:  node tools/i18n/glossary-check.mjs en path/to/en.json
//            node tools/i18n/glossary-check.mjs it path/to/it.json
import fs from "node:fs";

const lang = (process.argv[2] || "").toLowerCase();
const file = process.argv[3];
if (!["en", "it"].includes(lang) || !file) {
  console.error("Употреба: node glossary-check.mjs <en|it> <locale.json>"); process.exit(2);
}

const GLOSS = ".claude/agents/_shared/glossary.md";
let md;
try { md = fs.readFileSync(GLOSS, "utf8"); } catch { console.error("✘ Няма глосар:", GLOSS); process.exit(2); }

// Парсни редовете `| BG | EN | IT |` от таблиците.
const rows = [...md.matchAll(/^\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*$/gm)]
  .map((m) => ({ bg: m[1].trim(), en: m[2].trim(), it: m[3].trim() }))
  .filter((r) => r.bg && r.en && r.it && !/^BG\b|^-+$|^—$/.test(r.bg) && r.en !== "EN");

const approved = new Map(rows.map((r) => [r.bg, lang === "en" ? r.en : r.it]));

let locale;
try { locale = JSON.parse(fs.readFileSync(file, "utf8")); } catch (e) { console.error("✘", e.message); process.exit(2); }
const flat = {};
(function walk(o, p = "") { for (const [k, v] of Object.entries(o ?? {})) { const key = p ? `${p}.${k}` : k; if (v && typeof v === "object") walk(v, key); else flat[key] = String(v); } })(locale);

// За всеки одобрен термин: ако стойност в locale съвпада с BG източника (т.е. още е на
// български / непреведена) или се различава от одобрения превод — флагвай.
let problems = 0;
console.log(`Глосар: ${approved.size} клинични/ключови термина · проверявам ${lang.toUpperCase()} (${Object.keys(flat).length} ключа)\n`);
for (const [key, val] of Object.entries(flat)) {
  for (const [bg, want] of approved) {
    if (val === bg) { console.log(`  ⚠ ${key}: още е на BG „${bg}" — трябва „${want}"`); problems++; }
    else if (val.toLowerCase() === want.toLowerCase()) { /* ок */ }
  }
}
if (!problems) console.log("✔ Няма разминавания на клинични термини спрямо глосара.");
else console.log(`\n✘ ${problems} разминавания — поправи или маркирай за човешка проверка (безопасно-критично).`);
process.exit(problems ? 1 : 0);
