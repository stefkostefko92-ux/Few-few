#!/usr/bin/env node
// tools/commerce/stripe-lint.mjs — статичен детектор на Stripe анти-патърни (Продавача v2.0).
//
// Употреба:
//   node tools/commerce/stripe-lint.mjs <файл-или-папка> [още пътища…]
//
// Евристичен (regex) — НЕ замества code review или реален webhook тест със `stripe listen`.
// Цел: бърз CI гейт за най-скъпите грешки в payments код. Връща изходен код 1, ако има
// находка с тежест HIGH; иначе 0. Грешките се отчитат като `файл:ред  [ТЕЖЕСТ]  съобщение`.

import { readFileSync, statSync, readdirSync } from "node:fs";
import { join, extname } from "node:path";

const SKIP_DIRS = new Set(["node_modules", ".git", "dist", "build", ".next", "coverage"]);
const EXfTS = new Set([".js", ".mjs", ".cjs", ".ts", ".jsx", ".tsx"]);

// Всяко правило: regex над целия файл; ако match → находка. `perLine` дава точен ред.
const RULES = [
  {
    id: "webhook-no-verify",
    severity: "HIGH",
    test: (src) => /\.webhooks\.constructEvent\s*\(/.test(src) === false && /stripe-signature/i.test(src) === false && /\/webhook/i.test(src),
    line: (src) => firstLine(src, /\/webhook/i),
    msg: "Webhook route без `stripe.webhooks.constructEvent(...)` + проверка на подпис със суров body.",
  },
  {
    id: "webhook-construct-no-secret",
    severity: "HIGH",
    perLine: /\.webhooks\.constructEvent\s*\(([^)]*)\)/,
    when: (m) => m[1].split(",").length < 3,
    msg: "`constructEvent` без 3-те аргумента (rawBody, signature, endpointSecret) — подписът не се проверява коректно.",
  },
  {
    id: "client-amount",
    severity: "HIGH",
    perLine: /(amount|unit_amount|price)\s*:\s*(req|request|ctx)\.(body|query|params)\./,
    msg: "Сума/цена идва от клиента (req.body/query). Чети я от Stripe Price или сървърна конфигурация.",
  },
  {
    id: "grant-in-success-url",
    severity: "MED",
    perLine: /success_url[\s\S]{0,200}?(isPremium|grant|entitlement|activate|upgrade)\s*[:=]/i,
    msg: "Изглежда достъп се дава около `success_url` (redirect). Давай го през проверен webhook.",
  },
  {
    id: "missing-idempotency",
    severity: "MED",
    perLine: /\.(customers|paymentIntents|charges|subscriptions|invoices)\.create\s*\(\s*\{[\s\S]*?\}\s*\)/,
    when: (m) => /idempotencyKey|Idempotency-Key/i.test(m[0]) === false,
    msg: "Мутираща Stripe заявка без `{ idempotencyKey }` втори аргумент — ретрай може да дублира.",
  },
  {
    id: "selfhost-stripejs",
    severity: "HIGH",
    perLine: /<script[^>]+src=["'][^"']*stripe[^"']*\.js/i,
    when: (m) => /js\.stripe\.com/.test(m[0]) === false,
    msg: "Stripe.js не се зарежда от `js.stripe.com` — чупи SAQ A (PCI обхват).",
  },
  {
    id: "json-before-raw",
    severity: "MED",
    test: (src) => /express\.json\(\)/.test(src) && /constructEvent/.test(src) && /express\.raw\s*\(/.test(src) === false,
    line: (src) => firstLine(src, /constructEvent/),
    msg: "Webhook ползва `constructEvent`, но не виждам `express.raw(...)` — суровият body може да е загубен (подписът ще пада).",
  },
  {
    id: "hardcoded-key",
    severity: "HIGH",
    perLine: /(sk|rk)_(test|live|prod)_[A-Za-z0-9]{10,}/,
    msg: "Твърдо зашит Stripe ключ. Премести в env/secret vault веднага и ротирай.",
  },
];

function firstLine(src, re) {
  const lines = src.split("\n");
  for (let i = 0; i < lines.length; i++) if (re.test(lines[i])) return i + 1;
  return 1;
}

function lineOfIndex(src, idx) {
  return src.slice(0, idx).split("\n").length;
}

function walk(path, acc) {
  let st;
  try { st = statSync(path); } catch { return acc; }
  if (st.isDirectory()) {
    for (const name of readdirSync(path)) {
      if (SKIP_DIRS.has(name)) continue;
      walk(join(path, name), acc);
    }
  } else if (EXfTS.has(extname(path)) || path.endsWith(".html") || path.endsWith(".ejs")) {
    acc.push(path);
  }
  return acc;
}

function lintFile(file, findings) {
  let src;
  try { src = readFileSync(file, "utf8"); } catch { return; }
  // Подсказка за Stripe файл — пропускаме очевидно несвързани, за да намалим шума
  const looksStripe = /stripe|webhook|checkout|payment|invoice|subscription/i.test(src) || /\.html$/.test(file);
  if (!looksStripe) return;

  for (const rule of RULES) {
    if (rule.perLine) {
      const re = new RegExp(rule.perLine, "gms");
      let m;
      while ((m = re.exec(src)) !== null) {
        if (rule.when && !rule.when(m)) continue;
        findings.push({ file, line: lineOfIndex(src, m.index), severity: rule.severity, id: rule.id, msg: rule.msg });
      }
    } else if (rule.test && rule.test(src)) {
      findings.push({ file, line: rule.line ? rule.line(src) : 1, severity: rule.severity, id: rule.id, msg: rule.msg });
    }
  }
}

const paths = process.argv.slice(2);
if (!paths.length) {
  console.error("Употреба: node tools/commerce/stripe-lint.mjs <файл-или-папка> [още…]");
  process.exit(2);
}

const files = [];
for (const p of paths) walk(p, files);

const findings = [];
for (const f of files) lintFile(f, findings);

const order = { HIGH: 0, MED: 1, LOW: 2 };
findings.sort((a, b) => order[a.severity] - order[b.severity] || a.file.localeCompare(b.file) || a.line - b.line);

if (!findings.length) {
  console.log(`✅ stripe-lint: чисто (${files.length} файла сканирани).`);
  process.exit(0);
}

console.log(`stripe-lint: ${findings.length} находки (${files.length} файла)\n`);
for (const f of findings) {
  console.log(`${f.file}:${f.line}  [${f.severity}]  (${f.id}) ${f.msg}`);
}
const high = findings.filter((f) => f.severity === "HIGH").length;
console.log(`\n${high} HIGH · ${findings.length - high} по-ниски. (Евристично — потвърди ръчно.)`);
process.exit(high > 0 ? 1 : 0);
