#!/usr/bin/env node
// tools/qa/test-audit.mjs — „ръката" на Изпитателят (v1.0).
//
// Статичен скан на тестовото здраве per продукт (монорепо). Zero-dep, near-zero-FP.
// Докладва СИГНАЛИ, не присъда. --strict → exit 1 при блокери (CI гейт).
//
// Употреба: node tools/qa/test-audit.mjs [път] [--json] [--strict]
// Не замества реалното пускане на тестовете — допълва го.

import { readdirSync, readFileSync, existsSync, statSync } from "node:fs";
import { join, relative, extname, basename } from "node:path";

const ROOT = process.argv[2] && !process.argv[2].startsWith("--") ? process.argv[2] : ".";
const JSON_OUT = process.argv.includes("--json");
const STRICT = process.argv.includes("--strict");
const SKIP = new Set(["node_modules", ".git", "dist", "build", ".next", "out", "coverage", "vendor", ".claude", "tools", "deploy", "agents-dashboard"]);
const TEST_EXT = new Set([".js", ".ts", ".tsx", ".jsx", ".mjs", ".cjs"]);

const findings = [];
const add = (sev, rule, file, line, msg) => findings.push({ sev, rule, file: relative(ROOT, file) || file, line, msg });
const read = p => { try { return readFileSync(p, "utf8"); } catch { return ""; } };
const lineOf = (t, i) => t.slice(0, i).split("\n").length;

// продуктови директории = папки в корена с package.json (без служебните)
const products = readdirSync(ROOT, { withFileTypes: true })
  .filter(d => d.isDirectory() && !d.name.startsWith(".") && !SKIP.has(d.name) && existsSync(join(ROOT, d.name, "package.json")))
  .map(d => d.name);

const allTestFiles = [];
function walk(dir, out) {
  let e; try { e = readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const x of e) {
    if (x.isDirectory()) { if (!SKIP.has(x.name) && !x.name.startsWith(".")) walk(join(dir, x.name), out); }
    // `.e2e.` също е тестов файл. Без него `medqr/test/webauthn.e2e.mjs` и подобните бяха СЛЯПО
    // ПЕТНО — нито flaky-sleep, нито `.only` проверката са ги гледали някога.
    else if (TEST_EXT.has(extname(x.name)) && /\.(test|spec|e2e)\.|(^|\/)__tests__\//.test(x.name)) out.push(join(dir, x.name));
  }
}

for (const prod of products) {
  const dir = join(ROOT, prod), pkg = read(join(dir, "package.json"));
  let hasTestScript = false;
  try { const j = JSON.parse(pkg); hasTestScript = !!(j.scripts && j.scripts.test && !/no test specified/i.test(j.scripts.test)); } catch {}
  const tf = []; walk(dir, tf);
  allTestFiles.push(...tf);
  const hasConfig = ["vitest.config", "jest.config", "playwright.config"].some(c => TEST_EXT.has(".ts") && [".ts", ".js", ".mjs", ".cjs"].some(ext => existsSync(join(dir, c + ext))));

  if (!tf.length && !hasTestScript)
    add("warn", "no-tests", dir, 0, `Продукт „${prod}" няма тестови файлове/скрипт. Критичните потоци трябва да имат поне e2e.`);
  else if (!hasTestScript)
    add("info", "no-test-script", dir, 0, `Продукт „${prod}" има тестови файлове, но липсва \`test\` скрипт в package.json (CI не ги пуска).`);
  if (tf.length && !hasConfig)
    add("info", "no-test-config", dir, 0, `Продукт „${prod}" — не открих vitest/jest/playwright config (провери как се пускат тестовете).`);
}

// сканирай съдържанието на тестовите файлове за анти-паттерни
for (const f of allTestFiles) {
  const t = read(f);
  let m;
  const onlyRe = /(?:^|[^.\w])(?:describe|it|test)\.only\s*\(|(?:^|[^.\w])f(?:describe|it)\s*\(/g;
  while ((m = onlyRe.exec(t))) add("warn", "test-only", f, lineOf(t, m.index), "Оставен `.only`/`fdescribe` заключва CI пакета само в този тест (тихо пропуска останалите). Махни преди merge.");
  const skipRe = /(?:describe|it|test)\.skip\s*\(|(?:^|[^.\w])x(?:it|describe)\s*\(/g;
  while ((m = skipRe.exec(t))) add("info", "test-skip", f, lineOf(t, m.index), "`.skip`/`xit` — пропуснат тест; карантинирай с билет, не оставяй тихо изключен завинаги.");
  const sleepRe = /waitForTimeout\s*\(|(?:await\s+)?(?:new\s+Promise[^;]*setTimeout)|\bsleep\s*\(/g;
  if (/playwright|@playwright|page\.|e2e/i.test(t)) while ((m = sleepRe.exec(t))) add("warn", "flaky-sleep", f, lineOf(t, m.index), "Чакане по време (`waitForTimeout`/`sleep`) в e2e → flaky. Чакай по състояние (web-first assertion / `waitForResponse`).");
  // `networkidle` е СЪЩИЯТ клас грешка като sleep, но се пропускаше: чака 500ms тишина по мрежата,
  // затова една шумна фонова заявка (analytics · SSE · long-poll · регистрация на PWA service worker)
  // го държи до тайм-аут. Самият Playwright го обявява за discouraged.
  const idleRe = /waitUntil\s*:\s*["'`]networkidle["'`]|waitForLoadState\s*\(\s*["'`]networkidle["'`]/g;
  while ((m = idleRe.exec(t))) add("warn", "flaky-networkidle", f, lineOf(t, m.index), "`networkidle` е антипатърн (шумна фонова заявка го държи до тайм-аут). Чакай по конкретен елемент/assertion.");
}

const order = { block: 0, warn: 1, info: 2 };
findings.sort((a, b) => order[a.sev] - order[b.sev] || a.file.localeCompare(b.file));
const blockers = findings.filter(x => x.sev === "block").length;

if (JSON_OUT) {
  console.log(JSON.stringify({ root: ROOT, products: products.length, testFiles: allTestFiles.length, findings, summary: { blockers, warns: findings.filter(x => x.sev === "warn").length, infos: findings.filter(x => x.sev === "info").length } }, null, 2));
  process.exit(STRICT && blockers ? 1 : 0);
}
const ic = { block: "✗", warn: "▲", info: "·" };
console.log(`\n🧪  Изпитателят — тестов одит (${products.length} продукта, ${allTestFiles.length} тестови файла)\n`);
if (!findings.length) console.log("  ✓ Няма чести тестови проблеми. (Пак пусни реалните тестове.)");
for (const x of findings) console.log(`  ${ic[x.sev]} [${x.rule}] ${x.file}${x.line ? ":" + x.line : ""}\n      ${x.msg}`);
console.log(`\nИтог: ${blockers} блокери · ${findings.filter(x => x.sev === "warn").length} предупреждения · ${findings.filter(x => x.sev === "info").length} бележки`);
console.log(blockers ? "СТАТУС: има блокери." : "СТАТУС: няма твърди блокери (реален тест-ран все пак задължителен).");
process.exit(STRICT && blockers ? 1 : 0);
