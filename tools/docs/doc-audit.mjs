#!/usr/bin/env node
// tools/docs/doc-audit.mjs — „ръката" на Летописецът (v1.0).
//
// Статичен скан на здравето на документацията: липсващи README, счупени относителни
// markdown връзки, недовършени маркери, липсващ CHANGELOG/llms.txt. Zero-dep, near-zero-FP.
//
// Употреба: node tools/docs/doc-audit.mjs [път] [--json] [--strict]
// Не замества четенето/ревюто — допълва го.

import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join, relative, dirname, resolve } from "node:path";

const ROOT = process.argv[2] && !process.argv[2].startsWith("--") ? process.argv[2] : ".";
const JSON_OUT = process.argv.includes("--json");
const STRICT = process.argv.includes("--strict");
const SKIP = new Set(["node_modules", ".git", "dist", "build", ".next", "out", "coverage", "vendor", "Pods", ".gradle"]);

const findings = [];
const add = (sev, rule, file, line, msg) => findings.push({ sev, rule, file: relative(ROOT, file) || file, line, msg });
const read = p => { try { return readFileSync(p, "utf8"); } catch { return ""; } };

const mdFiles = [];
(function walk(dir) {
  let e; try { e = readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const x of e) {
    if (x.isDirectory()) { if (!SKIP.has(x.name) && !x.name.startsWith(".")) walk(join(dir, x.name)); }
    else if (/\.mdx?$/i.test(x.name)) mdFiles.push(join(dir, x.name));
  }
})(ROOT);

// продуктови папки (с package.json) без README / CHANGELOG / llms.txt
const products = readdirSync(ROOT, { withFileTypes: true })
  .filter(d => d.isDirectory() && !d.name.startsWith(".") && !SKIP.has(d.name) && d.name !== "tools" && existsSync(join(ROOT, d.name, "package.json")))
  .map(d => d.name);

for (const prod of products) {
  const dir = join(ROOT, prod);
  if (!existsSync(join(dir, "README.md")) && !existsSync(join(dir, "readme.md")))
    add("warn", "no-readme", dir, 0, `Продукт „${prod}" няма README.md — първото нещо, което чете нов разработчик/агент.`);
  if (!existsSync(join(dir, "CHANGELOG.md")))
    add("info", "no-changelog", dir, 0, `Продукт „${prod}" няма CHANGELOG.md (Keep a Changelog + semver).`);
  // llms.txt само за уеб продукти (има public/ или app/)
  const web = existsSync(join(dir, "public")) || existsSync(join(dir, "src", "app")) || existsSync(join(dir, "app"));
  if (web && !existsSync(join(dir, "public", "llms.txt")) && !existsSync(join(dir, "llms.txt")))
    add("info", "no-llms", dir, 0, `Уеб продукт „${prod}" без llms.txt (машинно резюме за AI агенти; координирай със SEO).`);
}

// съдържание: недовършени маркери + счупени относителни връзки
const linkRe = /\[[^\]]*\]\(([^)]+)\)/g;
for (const f of mdFiles) {
  const t = read(f), lines = t.split("\n");
  lines.forEach((ln, i) => {
    // `XXX{2,}` с флаг `i` ловеше `xxxx` в примерни команди — фалшив позитив. Стеснено до ГЛАВНИ X,
    // които НЕ са част от име на файл/идентификатор (`backup-XXXX.sql.gz` е примерен аргумент, а
    // `+359 XX XXX XXXX` в правен документ е истински незапълнен плейсхолдър).
    if (/\b(TODO|TBD|FIXME|WIP)\b|lorem ipsum|<placeholder>/i.test(ln) || /(?<![-_/\w])XXX+(?![-_.\w])/.test(ln))
      add("info", "unfinished", f, i + 1, "Недовършен маркер (TODO/TBD/FIXME/lorem) в публикуван документ — довърши преди merge.");
  });
  let m;
  while ((m = linkRe.exec(t))) {
    let target = m[1].trim().split(/\s+/)[0].replace(/[#?].*$/, "");
    if (!target || /^(https?:|mailto:|tel:|#|data:)/i.test(target)) continue;
    const abs = resolve(dirname(f), target);
    if (!existsSync(abs))
      add("warn", "broken-link", f, t.slice(0, m.index).split("\n").length, `Счупена относителна връзка: \`${target}\` не съществува.`);
  }
}

const order = { block: 0, warn: 1, info: 2 };
findings.sort((a, b) => order[a.sev] - order[b.sev] || a.file.localeCompare(b.file));
const blockers = findings.filter(x => x.sev === "block").length;

if (JSON_OUT) {
  console.log(JSON.stringify({ root: ROOT, products: products.length, mdFiles: mdFiles.length, findings, summary: { blockers, warns: findings.filter(x => x.sev === "warn").length, infos: findings.filter(x => x.sev === "info").length } }, null, 2));
  process.exit(STRICT && blockers ? 1 : 0);
}
const ic = { block: "✗", warn: "▲", info: "·" };
console.log(`\n📚  Летописецът — одит на документацията (${products.length} продукта, ${mdFiles.length} markdown файла)\n`);
if (!findings.length) console.log("  ✓ Няма чести проблеми в доковете.");
for (const x of findings.slice(0, 200)) console.log(`  ${ic[x.sev]} [${x.rule}] ${x.file}${x.line ? ":" + x.line : ""}\n      ${x.msg}`);
if (findings.length > 200) console.log(`  … и още ${findings.length - 200}`);
console.log(`\nИтог: ${blockers} блокери · ${findings.filter(x => x.sev === "warn").length} предупреждения · ${findings.filter(x => x.sev === "info").length} бележки`);
console.log(blockers ? "СТАТУС: има блокери." : "СТАТУС: няма твърди блокери (ревю все пак задължително).");
process.exit(STRICT && blockers ? 1 : 0);
