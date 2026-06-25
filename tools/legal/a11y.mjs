#!/usr/bin/env node
// a11y.mjs — достъпностен гейт WCAG 2.1 AA / EN 301 549 (Правен агент v2.0).
// EAA е в сила от 28 юни 2025. axe-core хваща ~57% от проблемите — зелено ≠
// съответствие; ръчен преглед (клавиатура, ред на четене) остава задължителен.
//
// Употреба:  node tools/legal/a11y.mjs https://zabobovdol.carbonstealth.eu
// Изисква playwright + @axe-core/playwright.
const url = process.argv[2];
if (!url) { console.error("Употреба: node a11y.mjs <url>"); process.exit(2); }

let chromium, AxeBuilder;
try {
  ({ chromium } = await import("playwright"));
  ({ default: AxeBuilder } = await import("@axe-core/playwright"));
} catch {
  console.error("✘ Липсват playwright и/или @axe-core/playwright.");
  console.error("  npm i -D playwright @axe-core/playwright");
  process.exit(1);
}

const browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
const page = await browser.newPage();
await page.goto(url, { waitUntil: "networkidle", timeout: 30000 }).catch(() => {});

const results = await new AxeBuilder({ page })
  .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "EN-301-549"])
  .analyze();

console.log(`\n# Достъпност (WCAG 2.1 AA) — ${url}\n`);
const v = results.violations.sort((a, b) => ({ critical: 0, serious: 1, moderate: 2, minor: 3 }[a.impact] - { critical: 0, serious: 1, moderate: 2, minor: 3 }[b.impact]));
if (!v.length) console.log("🟢 axe-core: 0 нарушения. ВНИМАНИЕ: покрива ~57% — ръчно провери клавиатура, фокус, ред на четене, контраст в контекст.");
for (const r of v) {
  console.log(`[${(r.impact || "?").toUpperCase()}] ${r.id} — ${r.help}`);
  console.log(`  ${r.nodes.length} елемента · ${r.helpUrl}`);
  r.nodes.slice(0, 3).forEach((n) => console.log(`    ${n.target.join(" ")}`));
}
const counts = v.reduce((a, r) => ((a[r.impact] = (a[r.impact] || 0) + 1), a), {});
console.log(`\nРезюме: ${JSON.stringify(counts)}`);
await browser.close();
process.exit(v.some((r) => ["critical", "serious"].includes(r.impact)) ? 1 : 0);
