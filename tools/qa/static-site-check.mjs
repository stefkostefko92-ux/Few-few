#!/usr/bin/env node
// static-site-check.mjs — гейт за СТАТИЧНИТЕ продукти (напр. `kebab/`), които нямат билд, тестове
// и `package.json`. Досега такъв продукт нямаше НИКАКВА проверка: счупен линк към локален файл или
// липсващи ключови думи стигаха до продукция без нищо да ги е спряло.
//
// Не измисляме гейт, който не съществува — проверяваме това, което Е проверимо върху статичен HTML:
//   1) всеки локален `href`/`src` сочи съществуващ файл (счупен асет = счупена страница);
//   2) всяка страница носи ≥5 ключови думи, една от които „Carbon Stealth" (законът в CLAUDE.md);
//   3) всяка страница има `<title>` и `lang` на `<html>` (минимум за достъпност и SEO).
//
//   node tools/qa/static-site-check.mjs kebab
//   node tools/qa/static-site-check.mjs kebab --json

import { readdirSync, readFileSync, existsSync, statSync } from "node:fs";
import { join, dirname, resolve, relative } from "node:path";

const argv = process.argv.slice(2);
const JSON_OUT = argv.includes("--json");
const DIR = argv.find((a) => !a.startsWith("--"));

export const MIN_KEYWORDS = 5;
export const BRAND = "Carbon Stealth";

export function htmlFiles(dir) {
  const out = [];
  (function walk(d) {
    let e; try { e = readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const x of e) {
      if (x.isDirectory()) { if (!["node_modules", ".git", "dist"].includes(x.name)) walk(join(d, x.name)); }
      else if (/\.html?$/i.test(x.name)) out.push(join(d, x.name));
    }
  })(dir);
  return out.sort();
}

/** Локални цели на href/src — външните (http, //, mailto, tel, data, #) не се проверяват. */
export function localTargets(html) {
  const out = new Set();
  for (const m of String(html).matchAll(/\b(?:href|src)\s*=\s*["']([^"']+)["']/gi)) {
    const t = m[1].trim();
    if (!t || /^(?:https?:)?\/\//i.test(t) || /^(?:mailto|tel|data|javascript):/i.test(t) || t.startsWith("#")) continue;
    out.add(t.split(/[?#]/)[0]);
  }
  return [...out];
}

export function keywordsOf(html) {
  const m = String(html).match(/<meta\s+name\s*=\s*["']keywords["']\s+content\s*=\s*["']([^"']*)["']/i);
  if (!m) return null;
  return m[1].split(",").map((s) => s.trim()).filter(Boolean);
}

export function checkFile(file, root, html) {
  const errs = [];
  for (const t of localTargets(html)) {
    const base = t.startsWith("/") ? root : dirname(file);
    const p = resolve(base, t.replace(/^\//, ""));
    // Директория е валидна цел (index.html); иначе искаме реален файл.
    const ok = existsSync(p) && (statSync(p).isFile() || existsSync(join(p, "index.html")));
    if (!ok) errs.push(`счупена локална препратка: ${t}`);
  }
  const kw = keywordsOf(html);
  if (kw === null) errs.push("липсва <meta name=\"keywords\"> (законът: ≥5 ключови думи)");
  else {
    if (kw.length < MIN_KEYWORDS) errs.push(`само ${kw.length} ключови думи (минимум ${MIN_KEYWORDS})`);
    if (!kw.some((k) => k.toLowerCase().includes(BRAND.toLowerCase()))) errs.push(`липсва задължителната ключова дума „${BRAND}"`);
  }
  // `\S` след `<title>` съвпада със самото `<` на затварящия таг → празен `<title></title>`
  // минаваше за непразен. Искаме реален знак, който не е начало на таг.
  if (!/<title>\s*[^<\s]/i.test(html)) errs.push("липсва непразен <title>");
  if (!/<html[^>]*\slang\s*=\s*["'][a-z]/i.test(html)) errs.push("липсва lang на <html> (достъпност)");
  return errs;
}

export function checkSite(dir) {
  const files = htmlFiles(dir);
  const results = files.map((f) => ({ file: relative(dir, f), errs: checkFile(f, dir, readFileSync(f, "utf8")) }));
  return { dir, files: files.length, results, failed: results.filter((r) => r.errs.length) };
}

function main() {
  if (!DIR || !existsSync(DIR)) { console.error("употреба: static-site-check.mjs <папка> [--json]"); process.exit(2); }
  const r = checkSite(DIR);
  if (JSON_OUT) { console.log(JSON.stringify(r, null, 2)); process.exit(r.failed.length ? 1 : 0); }
  const g = (s) => `\x1b[32m${s}\x1b[0m`, red = (s) => `\x1b[31m${s}\x1b[0m`;
  console.log(`\n🧱  Статичен сайт „${r.dir}" — ${r.files} HTML файла\n`);
  if (!r.files) { console.log("  няма HTML файлове — нищо за проверка\n"); process.exit(0); }
  for (const x of r.failed) {
    console.log(`  ${red("✗")} ${x.file}`);
    for (const e of x.errs) console.log(`      ${e}`);
  }
  if (!r.failed.length) console.log(g("  ✓ всички локални препратки съществуват · ключовите думи и title/lang са налице"));
  console.log(r.failed.length ? red(`\nСТАТУС: ${r.failed.length} файла с проблеми.\n`) : g("\nСТАТУС: чисто.\n"));
  process.exit(r.failed.length ? 1 : 0);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
