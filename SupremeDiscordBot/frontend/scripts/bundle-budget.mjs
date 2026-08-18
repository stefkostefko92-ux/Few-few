#!/usr/bin/env node
// frontend/scripts/bundle-budget.mjs — таван за размера на билда.
//
// ЗАЩО ТОВА, А НЕ LIGHTHOUSE В CI (одит, 07.08.2026): измерихме Core Web Vitals
// веднъж с истински Chromium (75/100, CLS-ът беше от логото без размери) и го
// поправихме. Нищо обаче не пречи на следващия човек да го върне. Пълен
// Lighthouse на всеки PR е бавен, шумен и зависи от натоварването на runner-а —
// три поредни пробега дават три различни числа.
//
// Размерът на бъндъла е ДЕТЕРМИНИСТИЧЕН и е реалната причина за регресиите на
// LCP и TBT: една добавена зависимост тежи, независимо колко е бърз runner-ът.
// Затова гейтваме него, а полевите числа сверяваме след деплой с
// `tools/seo/cwv.mjs` срещу реалния PageSpeed.
//
// Бюджетите са СЕГАШНИТЕ стойности + малък запас. Не са пожелание — вдигне ли
// се бюджет, това трябва да е съзнателно решение с обосновка в диффа.
import { readdirSync, statSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

const DIST = join(dirname(fileURLToPath(import.meta.url)), "..", "dist");

// Име (без хеша) → таван в KB на GZIP-натия размер. Мрежата вижда gzip, не суров.
const BUDGETS = {
  "index":             150,  // главният чънк — влиза на всяка страница
  "vendor":             85,  // React + рутер + заявки
  "LandingLocalized":   30,  // 7-те локализирани лендинга
  "gsap":               28,
};

// Общ таван на JS-а, който браузърът дърпа за ПЪРВАТА рисунка. Отделен от
// сумата на всички чънкове: lazy зареденото не боли при първо посещение.
const EAGER_BUDGET_KB = 250;
const EAGER = ["index", "vendor"];

const files = readdirSync(join(DIST, "assets")).filter((f) => f.endsWith(".js"));
if (files.length === 0) {
  console.error("✗ няма JS в dist/assets — пусни `npm run build` първо.");
  process.exit(1);
}

/** `index-DEYOD4St.js` → `index` */
const baseName = (f) => f.replace(/-[A-Za-z0-9_-]{8,}\.js$/, "");

const rows = files.map((f) => {
  const buf = readFileSync(join(DIST, "assets", f));
  return {
    file: f,
    name: baseName(f),
    raw: statSync(join(DIST, "assets", f)).size / 1024,
    gz: gzipSync(buf).length / 1024,
  };
});

let failed = 0;
console.log("Бюджет на бъндъла (gzip):\n");

for (const [name, budget] of Object.entries(BUDGETS)) {
  const hit = rows.find((r) => r.name === name);
  if (!hit) {
    // Изчезнал чънк е също толкова интересен, колкото надут: значи билдът се е
    // преструктурирал и бюджетът вече не пази нищо.
    console.log(`  ? ${name.padEnd(20)} липсва в билда — бюджетът е остарял`);
    failed++;
    continue;
  }
  const over = hit.gz > budget;
  if (over) failed++;
  console.log(
    `  ${over ? "✗" : "✓"} ${name.padEnd(20)} ${hit.gz.toFixed(1).padStart(6)} KB / ${String(budget).padStart(4)} KB` +
    (over ? `  ← над бюджета с ${(hit.gz - budget).toFixed(1)} KB` : ""),
  );
}

const eagerGz = rows.filter((r) => EAGER.includes(r.name)).reduce((s, r) => s + r.gz, 0);
const eagerOver = eagerGz > EAGER_BUDGET_KB;
if (eagerOver) failed++;
console.log(
  `\n  ${eagerOver ? "✗" : "✓"} първоначален JS      ${eagerGz.toFixed(1).padStart(6)} KB / ${EAGER_BUDGET_KB} KB` +
  (eagerOver ? "  ← това удря директно LCP и TBT" : ""),
);

const totalGz = rows.reduce((s, r) => s + r.gz, 0);
console.log(`  · общо (вкл. lazy)     ${totalGz.toFixed(1).padStart(6)} KB · ${rows.length} чънка`);

if (failed) {
  console.error(
    `\n✗ ${failed} над бюджета. Или свали теглото (lazy import, по-лека зависимост),` +
    "\n  или вдигни бюджета В СЪЩИЯ дифф с обосновка защо си струва.",
  );
  process.exit(1);
}
console.log("\n✓ bundle-budget: в рамките.");
