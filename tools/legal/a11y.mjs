#!/usr/bin/env node
// a11y.mjs — достъпностен гейт WCAG 2.1 AA / EN 301 549 (EAA е в сила от 28 юни 2025).
// axe-core хваща ~57% от проблемите — зелено ≠ съответствие; ръчният преглед (клавиатура,
// фокус, ред на четене) остава задължителен.
//
//   node tools/legal/a11y.mjs <https-url>
//
// ДОГОВОР ЗА ИЗХОД: 0 = проверено, без critical/serious · 1 = има critical/serious ·
//                   2 = НЕ МОЖА да провери (браузър/axe/зареждане).
//
// Старата версия гълташе провален goto → axe анализираше ПРАЗНА страница → „🟢 0 нарушения",
// exit 0. EAA гейт, зелен върху about:blank — същият клас като consent-scan. Вече fail-closed.

import { launchChromium } from "../lib/browser.mjs";
import { finish } from "../lib/emit.mjs";

const IMPACT_ORDER = { critical: 0, serious: 1, moderate: 2, minor: 3 };

/** Чиста присъда по axe нарушения + състояние на зареждането — тествана отделно от I/O. */
export function verdict({ loaded, violations = [] }) {
  if (!loaded) return { code: 2, label: "неизмерено — страницата не се зареди; това НЕ е зелено" };
  const bad = violations.filter((r) => ["critical", "serious"].includes(r.impact)).length;
  if (bad) return { code: 1, label: `${bad} critical/serious нарушения` };
  return { code: 0, label: "0 critical/serious от axe (~57% покритие — ръчният преглед остава)" };
}

async function main() {
  const url = process.argv[2];
  if (!url || !/^https?:\/\//.test(url)) {
    console.error("Употреба: node tools/legal/a11y.mjs <http(s) URL>");
    return finish(2);
  }

  let AxeBuilder;
  try { ({ default: AxeBuilder } = await import("@axe-core/playwright")); }
  catch {
    console.error("✘ Липсва @axe-core/playwright (npm i -D @axe-core/playwright). Не мога да проверя — това НЕ е зелено.");
    return finish(2);
  }

  const { browser, error } = await launchChromium();
  if (error) { console.error(`✘ Не мога да проверя: ${error}`); return finish(2); }

  const page = await browser.newPage();
  const resp = await page.goto(url, { waitUntil: "load", timeout: 30000 }).catch(() => null);
  if (!resp) {
    await browser.close();
    console.error("✘ Страницата НЕ се зареди — няма измерване, няма присъда.");
    return finish(2);
  }
  await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});

  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "EN-301-549"])
    .analyze();
  await browser.close();

  const v = results.violations.sort((a, b) => (IMPACT_ORDER[a.impact] ?? 9) - (IMPACT_ORDER[b.impact] ?? 9));
  console.log(`\n# Достъпност (WCAG 2.1 AA) — ${url}\n`);
  for (const r of v) {
    console.log(`[${(r.impact || "?").toUpperCase()}] ${r.id} — ${r.help}`);
    console.log(`  ${r.nodes.length} елемента · ${r.helpUrl}`);
    r.nodes.slice(0, 3).forEach((n) => console.log(`    ${n.target.join(" ")}`));
  }
  const counts = v.reduce((a, r) => ((a[r.impact] = (a[r.impact] || 0) + 1), a), {});
  const out = verdict({ loaded: true, violations: results.violations });
  console.log(`\nРезюме: ${JSON.stringify(counts)}`);
  console.log(`${out.code ? "🔴" : "🟢"} ${out.label}`);
  console.log("Това е обща информация, не е правен съвет.");
  return finish(out.code);
}

// CLI guard — тестът внася verdict(); код на върха на модула би убил тест-рънъра при import.
if (import.meta.url === `file://${process.argv[1]}`) await main();
