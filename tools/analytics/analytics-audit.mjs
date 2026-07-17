#!/usr/bin/env node
// tools/analytics/analytics-audit.mjs — „ръката" на Анализаторът (v1.0).
//
// Статичен скан на хигиената на продуктовата аналитика (приватност-първо): аналитичен скрипт/пиксел,
// зареждащ се БЕЗ проверка за съгласие; вероятен PII в проследяване (имейл/телефон/име като параметър);
// hardcode-нат analytics ключ/measurement id в клиента; липсваща IP анонимизация. Zero-dep, near-zero-FP.
//
// Употреба: node tools/analytics/analytics-audit.mjs [път] [--json] [--strict]
// Не замества ревюто на живата интеграция — допълва го. Съгласие преди проследяване; нула PII.

import { readdirSync, readFileSync } from "node:fs";
import { join, relative, extname } from "node:path";

const ROOT = process.argv[2] && !process.argv[2].startsWith("--") ? process.argv[2] : ".";
const JSON_OUT = process.argv.includes("--json");
const STRICT = process.argv.includes("--strict");
const SKIP = new Set(["node_modules", ".git", "dist", "build", ".next", "out", "coverage", "vendor", "Pods", ".gradle", "_memory"]);
const CODE = new Set([".js", ".mjs", ".cjs", ".ts", ".tsx", ".jsx", ".html", ".ejs", ".vue", ".svelte"]);

const findings = [];
const add = (sev, rule, file, line, msg) => findings.push({ sev, rule, file: relative(ROOT, file) || file, line, msg });
const read = p => { try { return readFileSync(p, "utf8"); } catch { return ""; } };

const files = [];
(function walk(dir) {
  let e; try { e = readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const x of e) {
    if (x.isDirectory()) { if (!SKIP.has(x.name) && !x.name.startsWith(".")) walk(join(dir, x.name)); }
    else if (CODE.has(extname(x.name))) files.push(join(dir, x.name));
  }
})(ROOT);

// Доставчици, ИЗИСКВАЩИ съгласие (бисквитки/PII/устройствен идентификатор — ePrivacy чл.5(3)):
// GA/gtag, Facebook Pixel, GTM, Hotjar, Clarity, Mixpanel, Amplitude, Segment.
const CONSENT_REQUIRED = /googletagmanager\.com\/gtag|www\.google-analytics\.com|\bgtag\s*\(|\bga\s*\(\s*['"]create|connect\.facebook\.net|\bfbq\s*\(|hotjar|clarity\.ms|mixpanel|segment\.com\/analytics|amplitude|posthog\.(init|capture)/i;
// Доставчици БЕЗ бисквитки/PII по дизайн → съгласие-ОСВОБОДЕНИ (не искат банер, GDPR-безопасни):
// Plausible, Umami, Cloudflare Web Analytics, GoatCounter. Не ги флагвай за липса на съгласие.
const CONSENT_EXEMPT = /plausible|umami|cloudflareinsights|static\.cloudflareinsights|goatcounter/i;
const CONSENT = /consent|cookieConsent|cookie_consent|hasConsent|gtag\s*\(\s*['"]consent|granted|CookieConsent|Cookiebot|osano|onetrust|съгласие|onConsent|allowAnalytics/i;
// PII в РЕАЛНО проследяващо извикване: функция track/capture/identify/logEvent/gtag/fbq(…) + PII като
// КЛЮЧ на свойство (email:/'email'/email=), не просто съвпадение на думи (напр. phone() + "…track…").
const TRACK_CALL = /\b(?:gtag|fbq|logEvent|identify|track|capture|trackEvent|sendEvent)\s*\(/i;
const PII_KEY = /['"]?\b(email|имейл|e-?mail|phone_?number|firstName|first_name|lastName|last_name|full_?name|address|street|ssn|egn|егн|iban|passport|dateOfBirth|date_of_birth)\b['"]?\s*[:=]/i;
// hardcode-нат measurement id / ключ в клиентски файл
const HARDCODE_ID = /\b(G-[A-Z0-9]{8,}|UA-\d{4,}-\d+|GTM-[A-Z0-9]{5,}|phc_[A-Za-z0-9]{20,})\b/;
const IP_ANON = /anonymize_?ip|anonymizeIp|ip_?anonymization/i;

for (const f of files) {
  const t = read(f);
  const needsConsent = CONSENT_REQUIRED.test(t);
  const exempt = CONSENT_EXEMPT.test(t);
  const hasConsent = CONSENT.test(t);
  const lines = t.split("\n");
  lines.forEach((ln, i) => {
    if (TRACK_CALL.test(ln) && PII_KEY.test(ln))
      add("warn", "pii-in-tracking", f, i + 1, "PII като свойство в проследяващо извикване (имейл/телефон/име/адрес). Нула PII в събития/properties — минимизация и псевдонимизация (GDPR; сверявай с Правния).");
    if (HARDCODE_ID.test(ln) && /\.(html|ejs|jsx|tsx|vue|svelte)$/.test(f))
      add("info", "client-analytics-id", f, i + 1, "Analytics measurement id/ключ в клиента (G-/UA-/GTM-/phc_). Публичните measurement id-та са ОК, но провери да няма таен API/write ключ в бъндъла.");
  });
  if (needsConsent && !hasConsent)
    add("warn", "tracking-without-consent", f, 0, "Доставчик с бисквитки/PII се зарежда без видима проверка за СЪГЛАСИЕ (ePrivacy чл.5(3)). Никакво проследяване преди валидно съгласие — или мини на съгласие-освободен инструмент (Plausible/Umami).");
  if (exempt && !needsConsent)
    add("info", "consent-exempt-analytics", f, 0, "Съгласие-освободена аналитика (Plausible/Umami/CF — cookieless, без PII). GDPR-безопасно без банер; само потвърди, че не подаваш PII в custom properties.");
  if (needsConsent && /google-analytics|gtag/i.test(t) && !IP_ANON.test(t) && !hasConsent)
    add("info", "no-ip-anon", f, 0, "GA без видима IP анонимизация/consent mode — анонимизирай IP и уважавай съгласието (GDPR минимизация).");
}

const order = { block: 0, warn: 1, info: 2 };
findings.sort((a, b) => order[a.sev] - order[b.sev] || a.file.localeCompare(b.file));
const blockers = findings.filter(x => x.sev === "block").length;

if (JSON_OUT) {
  console.log(JSON.stringify({ root: ROOT, filesScanned: files.length, findings, summary: { blockers, warns: findings.filter(x => x.sev === "warn").length, infos: findings.filter(x => x.sev === "info").length } }, null, 2));
  process.exit(STRICT && blockers ? 1 : 0);
}
const ic = { block: "✗", warn: "▲", info: "·" };
console.log(`\n📊  Анализаторът — одит на продуктовата аналитика (${files.length} файла)\n`);
if (!findings.length) console.log("  ✓ Няма чести проблеми в аналитиката.");
for (const x of findings.slice(0, 200)) console.log(`  ${ic[x.sev]} [${x.rule}] ${x.file}${x.line ? ":" + x.line : ""}\n      ${x.msg}`);
if (findings.length > 200) console.log(`  … и още ${findings.length - 200}`);
console.log(`\nИтог: ${blockers} блокери · ${findings.filter(x => x.sev === "warn").length} предупреждения · ${findings.filter(x => x.sev === "info").length} бележки`);
console.log(blockers ? "СТАТУС: има блокери." : "СТАТУС: няма твърди блокери (ревю на живата интеграция все пак задължително).");
process.exit(STRICT && blockers ? 1 : 0);
