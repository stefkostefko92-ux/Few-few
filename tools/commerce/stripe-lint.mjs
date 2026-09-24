#!/usr/bin/env node
// tools/commerce/stripe-lint.mjs — статичен детектор на Stripe анти-патърни (Продавача v2.0).
//
// Употреба:
//   node tools/commerce/stripe-lint.mjs <файл-или-папка> [още пътища…]
//
// Евристичен (regex) — НЕ замества code review или реален webhook тест със `stripe listen`.
// Цел: бърз CI гейт за най-скъпите грешки в payments код. Връща изходен код 1, ако има
// находка с тежест HIGH; иначе 0. Грешките се отчитат като `файл:ред  [ТЕЖЕСТ]  съобщение`.
//
// 2026-09-24: жива проверка на Продавача пусна линтера върху checkout с 6 заложени дефекта — той
// хвана 2. Пропусна Premium, даден от GET маршрута след плащане (достъп без плащане), `express.json()`
// преди webhook маршрута (без `constructEvent` в файла старото правило мълчеше), webhook без
// идемпотентност/await и абонамент без отнемане на достъп. Върху .md казваше „0 файла“ — фалшиво
// чисто. Освен това `webhook-no-verify` гърмеше на ВСЕКИ низ „/webhook“ (import редове, Discord
// webhook-и): 29 фалшиви HIGH в SupremeDiscordBot. Сега webhook маршрут = реална дефиниция на маршрут
// във файл, който ползва Stripe; тестовите файлове се прескачат.

import { readFileSync, statSync, readdirSync } from "node:fs";
import { join, extname, basename } from "node:path";

const SKIP_DIRS = new Set(["node_modules", ".git", "dist", "build", ".next", "coverage", "__tests__", "__mocks__"]);
const CODE_EXTS = new Set([".js", ".mjs", ".cjs", ".ts", ".jsx", ".tsx"]);
const isTestFile = (f) => /\.(test|spec)\.[cm]?[jt]sx?$/.test(basename(f));

const USES_STRIPE = /(from\s+["']stripe["']|require\(\s*["']stripe["']\s*\)|\bstripe\.(checkout|webhooks|customers|subscriptions|paymentIntents|invoices)\b)/;
// Дефиниция на webhook маршрут: app.post('/…webhook…', …) / router.all(…) / app.use('/…webhook…', …)
const WEBHOOK_ROUTE = /\.(post|all|use)\(\s*["'`][^"'`]*webhook[^"'`]*["'`]/i;
const handlerRegion = (src) => {
  const m = WEBHOOK_ROUTE.exec(src);
  if (!m) return null;
  const rest = src.slice(m.index);
  const end = rest.slice(1).search(/\n\s*(app|router)\.(get|post|put|patch|delete|all|use)\(/);
  return { start: m.index, text: end < 0 ? rest : rest.slice(0, end + 1) };
};

// Всяко правило: test(src) → bool (+ line) ИЛИ perLine regex (+ when).
const RULES = [
  {
    id: "webhook-no-verify",
    severity: "HIGH",
    test: (src) => USES_STRIPE.test(src) && WEBHOOK_ROUTE.test(src) && !/\.webhooks\.constructEvent(Async)?\s*\(/.test(src),
    line: (src) => firstLine(src, WEBHOOK_ROUTE),
    msg: "Stripe webhook маршрут без `stripe.webhooks.constructEvent(rawBody, sig, secret)` — всеки може да изпрати фалшиво събитие.",
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
    id: "grant-in-get-route",
    severity: "HIGH",
    // GET маршрут (обикновено целта на success_url), който записва достъп — отваря се без плащане.
    perLine: /\.get\(\s*["'`][^"'`]*["'`][^\n]*\n(?:(?!\n\s*(?:app|router)\.)[\s\S]){0,600}?\b(premium|isPremium|entitle\w*|paid|plan|tier|active)\b\s*:\s*(true|["'`](premium|pro|paid|active)["'`])/i,
    when: (m) => /update|upsert|create|save|set|grant/i.test(m[0]),
    msg: "GET маршрут записва платен достъп (обикновено целта на success_url) — отваря се без плащане. Давай достъп само в проверения webhook.",
  },
  {
    id: "grant-in-success-url",
    severity: "MED",
    perLine: /success_url[\s\S]{0,200}?(isPremium|grant|entitlement|activate|upgrade)\s*[:=]/i,
    msg: "Изглежда достъп се дава около `success_url` (redirect). Давай го през проверен webhook.",
  },
  {
    id: "json-before-webhook",
    severity: "HIGH",
    test: (src) => {
      const j = src.search(/\.use\(\s*express\.json\(/);
      const w = src.search(WEBHOOK_ROUTE);
      return USES_STRIPE.test(src) && j >= 0 && w > j && !/express\.raw\s*\(/.test(src);
    },
    line: (src) => lineOfIndex(src, src.search(/\.use\(\s*express\.json\(/)),
    msg: "`express.json()` е монтиран преди Stripe webhook маршрута и няма `express.raw(...)` — суровото тяло се губи и проверката на подписа не може да мине. Webhook маршрутът — ПРЕДИ json, с `express.raw({ type: 'application/json' })`.",
  },
  {
    id: "json-before-raw",
    severity: "MED",
    // req.rawBody = суровото тяло е запазено от verify callback на express.json (друг файл) — не е дефект.
    test: (src) => /express\.json\(\)/.test(src) && /constructEvent/.test(src) && /express\.raw\s*\(/.test(src) === false && !/\brawBody\b/.test(src),
    line: (src) => firstLine(src, /constructEvent/),
    msg: "Webhook ползва `constructEvent`, но не виждам `express.raw(...)` — суровият body може да е загубен (подписът ще пада).",
  },
  {
    id: "webhook-no-idempotency",
    severity: "MED",
    test: (src) => { const h = USES_STRIPE.test(src) && handlerRegion(src); return !!h && /event\.type|\.type\s*===/.test(h.text) && !/event\.id|idempot|processed|already/i.test(h.text); },
    line: (src) => lineOfIndex(src, handlerRegion(src).start),
    msg: "Webhook-ът не записва `event.id` — Stripe повтаря доставката и ефектът (достъп/имейл) се изпълнява два пъти. Запис по `event.id` в същата транзакция като ефекта.",
  },
  {
    id: "webhook-ack-without-await",
    severity: "MED",
    test: (src) => {
      const h = USES_STRIPE.test(src) && handlerRegion(src);
      if (!h || !/res\.(sendStatus\(200\)|status\(200\)|json\()/.test(h.text)) return false;
      return h.text.split("\n").some((l) => !/^\s*(\/\/|\*|\/\*)/.test(l) && /\b(grant|provision|fulfil|fulfill|activate|upgrade)\w*\s*\(/i.test(l.replace(/\/\/.*$/, "")) && !/\bawait\b/.test(l) && !/function|=>\s*$/.test(l));
    },
    line: (src) => lineOfIndex(src, handlerRegion(src).start),
    msg: "Webhook-ът връща 200, без да изчака ефекта (няма `await`) — при провал Stripe не опитва пак и клиентът е платил без достъп.",
  },
  {
    id: "subscription-no-revoke",
    severity: "MED",
    test: (src) => /mode\s*:\s*["'`]subscription["'`]/.test(src) && WEBHOOK_ROUTE.test(src) && !/customer\.subscription\.(deleted|updated)/.test(src),
    line: (src) => firstLine(src, /mode\s*:\s*["'`]subscription/),
    msg: "Абонамент без обработка на `customer.subscription.deleted`/`updated` — прекратеният или неплатен абонамент запазва достъпа.",
  },
  {
    id: "missing-idempotency",
    severity: "MED",
    // Целият извик до затварящата скоба (балансирано, с низове) — ключът е ВТОРИЯТ аргумент, а шаблонен
    // низ като `${id})` в първия обект чупеше регекса и `create({…}, { idempotencyKey })` беше фалшив сигнал.
    perLine: /\.(customers|paymentIntents|charges|subscriptions|invoices)\.create\s*\(/,
    when: (m, src) => !/idempotencyKey|Idempotency-Key/i.test(callText(src, m.index + m[0].length - 1)),
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
    id: "hardcoded-key",
    severity: "HIGH",
    perLine: /(sk|rk)_(test|live|prod)_[A-Za-z0-9]{10,}/,
    msg: "Твърдо зашит Stripe ключ. Премести в env/secret vault веднага и ротирай.",
  },
];

/** Текстът на извика от отварящата скоба `(` при `open` до затварящата, с прескачане на низове. */
export function callText(src, open) {
  let depth = 0, q = null;
  for (let i = open; i < src.length && i < open + 4000; i++) {
    const c = src[i];
    if (q) { if (c === "\\") i++; else if (c === q) q = null; continue; }
    if (c === '"' || c === "'" || c === "`") q = c;
    else if (c === "(") depth++;
    else if (c === ")" && --depth === 0) return src.slice(open, i + 1);
  }
  return src.slice(open, open + 4000);
}

function firstLine(src, re) {
  const lines = src.split("\n");
  for (let i = 0; i < lines.length; i++) if (re.test(lines[i])) return i + 1;
  return 1;
}
const lineOfIndex = (src, idx) => src.slice(0, Math.max(0, idx)).split("\n").length;

/** Markdown → само кодовите блокове (js/ts/html), с празни редове на мястото на прозата — редовете съвпадат. */
export function codeFromMarkdown(md) {
  let inCode = false;
  return String(md).split("\n").map((l) => {
    if (/^\s*```/.test(l)) { inCode = !inCode && /```\s*(js|javascript|ts|typescript|jsx|tsx|mjs|html|)\s*$/i.test(l); return ""; }
    return inCode ? l : "";
  }).join("\n");
}

/** Чистото ядро (тестваемо): находки за един източник. */
export function lintSource(src, file = "<вход>") {
  const findings = [];
  const looksStripe = /stripe|webhook|checkout|payment|invoice|subscription/i.test(src) || /\.html$/.test(file);
  if (!looksStripe) return findings;
  for (const rule of RULES) {
    if (rule.perLine) {
      const re = new RegExp(rule.perLine, "gims");
      let m;
      while ((m = re.exec(src)) !== null) {
        if (rule.when && !rule.when(m, src)) continue;
        findings.push({ file, line: lineOfIndex(src, m.index), severity: rule.severity, id: rule.id, msg: rule.msg });
      }
    } else if (rule.test && rule.test(src)) {
      findings.push({ file, line: rule.line ? rule.line(src) : 1, severity: rule.severity, id: rule.id, msg: rule.msg });
    }
  }
  return findings;
}

function walk(path, acc, explicit = false) {
  let st;
  try { st = statSync(path); } catch { return acc; }
  if (st.isDirectory()) {
    for (const name of readdirSync(path)) if (!SKIP_DIRS.has(name)) walk(join(path, name), acc);
  } else if ((CODE_EXTS.has(extname(path)) && (explicit || !isTestFile(path))) || /\.(html|ejs)$/.test(path) || (explicit && extname(path) === ".md")) {
    acc.push(path);
  }
  return acc;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const paths = process.argv.slice(2);
  if (!paths.length) {
    console.error("Употреба: node tools/commerce/stripe-lint.mjs <файл-или-папка> [още…]");
    process.exit(2);
  }
  const files = [];
  for (const p of paths) walk(p, files, true);
  const findings = [];
  let mdEmpty = 0;
  for (const f of files) {
    let src; try { src = readFileSync(f, "utf8"); } catch { continue; }
    if (f.endsWith(".md")) { src = codeFromMarkdown(src); if (!src.trim()) { mdEmpty++; continue; } }
    findings.push(...lintSource(src, f));
  }
  if (mdEmpty) console.log(`▲ ${mdEmpty} .md файла без js/ts кодов блок — нищо за проверка там (не е „чисто“).`);
  const order = { HIGH: 0, MED: 1, LOW: 2 };
  findings.sort((a, b) => order[a.severity] - order[b.severity] || a.file.localeCompare(b.file) || a.line - b.line);
  if (!findings.length) {
    console.log(`✅ stripe-lint: чисто (${files.length} файла сканирани).`);
    process.exit(0);
  }
  console.log(`stripe-lint: ${findings.length} находки (${files.length} файла)\n`);
  for (const f of findings) console.log(`${f.file}:${f.line}  [${f.severity}]  (${f.id}) ${f.msg}`);
  const high = findings.filter((f) => f.severity === "HIGH").length;
  console.log(`\n${high} HIGH · ${findings.length - high} по-ниски. (Евристично — потвърди ръчно.)`);
  process.exit(high > 0 ? 1 : 0);
}
