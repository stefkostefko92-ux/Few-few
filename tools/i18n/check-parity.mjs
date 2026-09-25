#!/usr/bin/env node
// check-parity.mjs — проверка на паритета на преводните ключове между езици.
// „Ръцете" на агента Преводач: засича липсващи и непреведени ключове, преди да
// обявиш локализацията за готова. Първият подаден файл е източникът на истината (BG).
//
// Употреба:
//   node tools/i18n/check-parity.mjs bg.json en.json it.json
//   node tools/i18n/check-parity.mjs locales/*.json
//
// Работи с вложени JSON речници (deep keys, dot-нотация). За инлайн i18n (medqr)
// експортирай речниците като JSON или адаптирай (виж README).
import fs from "node:fs";
import path from "node:path";

const files = process.argv.slice(2);
if (files.length < 2) {
  console.error("Употреба: node check-parity.mjs <източник.json> <език2.json> [език3.json …]");
  process.exit(2);
}

function flatten(obj, prefix = "", out = {}) {
  for (const [k, v] of Object.entries(obj ?? {})) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object" && !Array.isArray(v)) flatten(v, key, out);
    else out[key] = v;
  }
  return out;
}

const locales = files.map((f) => {
  let data;
  try { data = JSON.parse(fs.readFileSync(f, "utf8")); }
  catch (e) { console.error(`✘ Не мога да прочета ${f}: ${e.message}`); process.exit(2); }
  return { name: path.basename(f), flat: flatten(data) };
});

const [src, ...rest] = locales;
const srcKeys = new Set(Object.keys(src.flat));
let problems = 0;

console.log(`Източник на истината: ${src.name} (${srcKeys.size} ключа)\n`);

for (const loc of rest) {
  const keys = new Set(Object.keys(loc.flat));
  const missing = [...srcKeys].filter((k) => !keys.has(k));
  const extra = [...keys].filter((k) => !srcKeys.has(k));
  const untranslated = [...keys].filter(
    (k) => srcKeys.has(k) && String(loc.flat[k]).trim() === String(src.flat[k]).trim() && String(src.flat[k]).trim() !== ""
  );
  const empty = [...keys].filter((k) => String(loc.flat[k]).trim() === "");

  console.log(`── ${loc.name} ──`);
  console.log(`  липсващи ключове: ${missing.length}`);
  missing.slice(0, 20).forEach((k) => console.log(`    - ${k}`));
  if (missing.length > 20) console.log(`    … и още ${missing.length - 20}`);
  if (extra.length) console.log(`  излишни (няма ги в източника): ${extra.length}`);
  if (untranslated.length) console.log(`  вероятно непреведени (= източника): ${untranslated.length}`);
  untranslated.slice(0, 10).forEach((k) => console.log(`    ~ ${k}`));
  if (empty.length) console.log(`  празни стойности: ${empty.length}`);
  console.log("");
  problems += missing.length + untranslated.length + empty.length;
}

if (problems === 0) { console.log("✔ Пълен паритет — всеки език има всеки ключ, без празни/непреведени."); process.exit(0); }
console.log(`✘ ${problems} проблема за оправяне (липсващи + непреведени + празни).`);
process.exit(1);
