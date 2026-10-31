#!/usr/bin/env node
// core-map.mjs — „ядро и листа“: кой файл е ядро (пари, фискал, вход, медицински и лични данни, схема).
//
// Защо (проучване 31.10.2026, „Vibe coding in prod“, Erik Schluntz, Anthropic, Code w/ Claude 2025):
// „Focus your vibe coding on the leaf nodes, not the core architecture“ и „the first part of the code
// that I'll read is the tests“. Листата (изгледи, стилове, текстове, компоненти) се пишат свободно; в
// ядрото първо тест, а човекът чете тестовете. Правилото е детерминистично — без ръчен списък, който
// остарява; продуктовите изключения влизат в CORE_EXTRA с причина.
//
//   node tools/agents/core-map.mjs <файл…>            # кои от тях са ядро
//   node tools/agents/core-map.mjs --diff [base]      # ядро без тест в текущия diff (изход 1)
// Ползва се от pr-triage (ядро без тест → и Изпитателят) и от уменията commit-pr и verify.

import { execFileSync } from "node:child_process";

// Сървърен код по домейни, където грешка струва пари, закон или здраве.
const CORE_RE = /(fiscal|payment|stripe|checkout|billing|webhook|\bauth|session|login-throttle|password|totp|webauthn|crypto|storno|invoice|refund|orders?\b|risk|kill.?switch|emergency|consent|gdpr|entitlement|premium|subscription|\bsales\b|shifts|ledger|wallet|prisma\/schema\.prisma|\/migrations?\/)/i;
// Листа: изгледи, публични файлове, компоненти и страници (UI), стилове, документи.
const LEAF_RE = /(\/views\/|\/public\/|\/components\/|\/vendor\/|page\.tsx$|layout\.tsx$|\.ejs$|\.css$|\.html$|\.md$|\.svg$|\.png$|\.jpe?g$|\.webp$)/i;
// Продуктови изключения (път → причина), когато ключовите думи не стигат.
export const CORE_EXTRA = [
  [/^treydar\/src\/(exchange|executor|position|sizing)/i, "трейдинг: поръчки и размер на позицията"],
  [/^CSPos\/(src\/lib\/(money|vat|euro|db)|desktop\/main)/i, "каса: пари, ДДС, евро, офлайн база"],
  [/^medqr\/src\/(db|crypto|share)/i, "медицински профил (чл. 9 GDPR)"],
];
export const TEST_RE = /(\.test\.|\.spec\.|__tests__\/|\/tests?\/|\/e2e\/)/i;

// Агентският слой и документите имат свои гейтове (gate.mjs, live-gate) — тук се съди само кодът на продуктите.
const NOT_PRODUCT = /^(\.claude|tools|docs|\.github|agents-dashboard)\//;

export function isCore(file) {
  const f = String(file);
  if (NOT_PRODUCT.test(f) || TEST_RE.test(f) || LEAF_RE.test(f)) return false;
  return CORE_RE.test(f) || CORE_EXTRA.some(([re]) => re.test(f));
}

/** {core, tests, coreWithoutTest}: ядро без нито един променен тест в същия продукт. */
export function coreReport(files) {
  const core = files.filter(isCore);
  const tests = files.filter((f) => TEST_RE.test(f));
  const top = (f) => f.split("/")[0];
  const testedProducts = new Set(tests.map(top));
  const untested = core.filter((f) => !testedProducts.has(top(f)));
  return { core, tests, coreWithoutTest: untested };
}

async function runCli() {
  const argv = process.argv.slice(2);
  if (argv[0] === "--diff") {
    const base = argv[1] || "origin/main";
    const files = execFileSync("git", ["diff", "--name-only", `${base}...HEAD`], { encoding: "utf8" }).split("\n").filter(Boolean)
      .concat(execFileSync("git", ["diff", "--name-only", "HEAD"], { encoding: "utf8" }).split("\n").filter(Boolean));
    const r = coreReport([...new Set(files)]);
    if (!r.core.length) { console.log("✓ core-map: diff-ът не пипа ядро — листа."); process.exit(0); }
    console.log(`ядро (${r.core.length}): ${r.core.join(", ")}`);
    if (r.coreWithoutTest.length) {
      console.log(`✗ ядро без тест в същия продукт: ${r.coreWithoutTest.join(", ")} — първо тест (умение test-driven-development), човекът чете тестовете.`);
      process.exit(1);
    }
    console.log("✓ ядрото идва с тестове.");
    process.exit(0);
  }
  for (const f of argv) console.log(`${isCore(f) ? "ядро " : "листо"}  ${f}`);
}

if (import.meta.url === `file://${process.argv[1]}`) await runCli();
