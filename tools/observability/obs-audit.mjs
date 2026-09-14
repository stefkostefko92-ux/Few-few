#!/usr/bin/env node
// tools/observability/obs-audit.mjs — „ръката" на Наблюдателят (v1.0).
//
// Статичен скан на хигиената на наблюдаемостта: неструктурирано логване (console.log в сървърен код),
// вероятен PII/тайна в лог, висока кардиналност на метрика (user id/имейл като label), аларма по ПРИЧИНА
// (CPU/памет праг) вместо по симптом, липсващ health/readiness endpoint. Zero-dep, near-zero-FP.
//
// Употреба: node tools/observability/obs-audit.mjs [път] [--json] [--strict]
// Не замества наблюдението на живата система — допълва го. Аларми по симптом, не по причина.

import { readdirSync, readFileSync, existsSync, statSync } from "node:fs";
import { join, relative, extname } from "node:path";
import { emitJsonNow } from "../lib/emit.mjs";

const ROOT = process.argv[2] && !process.argv[2].startsWith("--") ? process.argv[2] : ".";
const JSON_OUT = process.argv.includes("--json");
const STRICT = process.argv.includes("--strict");
const SKIP = new Set(["node_modules", ".git", "dist", "build", ".next", "out", "coverage", "vendor", "Pods", ".gradle", "_memory", "public"]);
const CODE = new Set([".js", ".mjs", ".cjs", ".ts", ".tsx", ".jsx"]);

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

// сървърни файлове (за health-endpoint проверка) — груба евристика: съдържат express()/app.listen/http.createServer
const serverFiles = [];

// правила за съдържание
const PII_LOG = /\b(console\.(log|error|warn|info)|logger\.\w+|log\.\w+)\s*\([^)]*\b(password|passwd|senha|token|secret|apikey|api_key|authorization|email|имейл|e-?mail|ssn|egn|егн|iban|card|cvv|phone|телефон)\b/i;
const HIGH_CARD = /\b(labels?|tags?)\s*[:=]\s*\{[^}]*\b(user_?id|userId|email|имейл|session_?id|request_?id|trace_?id|ip)\b/i;
const CAUSE_ALERT = /\b(alert|expr|condition)\b[^\n]*\b(cpu|memory|mem_used|disk_used|ram)\b[^\n]*[<>]=?\s*\d/i;

for (const f of files) {
  const t = read(f);
  if (/\bexpress\s*\(\)|app\.listen\s*\(|http\.createServer|fastify\s*\(|createServer\s*\(/.test(t)) serverFiles.push({ f, t });
  const lines = t.split("\n");
  lines.forEach((ln, i) => {
    if (PII_LOG.test(ln))
      add("warn", "pii-in-log", f, i + 1, "Вероятен PII/тайна в лог (парола/токен/имейл/ЕГН…). Логове/traces НЕ съдържат лични данни — redact преди запис (GDPR; сверявай с Правния).");
    if (HIGH_CARD.test(ln))
      add("warn", "high-cardinality", f, i + 1, "Висока кардиналност на метрика: user_id/имейл/session/ip като label взривява Prometheus и изтича PII. Дръж label-ите с ниска кардиналност.");
    if (CAUSE_ALERT.test(ln))
      add("info", "alert-on-cause", f, i + 1, "Аларма по ПРИЧИНА (CPU/памет праг) вместо по СИМПТОМ. Алармирай, когато потребителят усеща болка (SLO/latency/error rate гори), не по машинен ресурс.");
  });
  // неструктурирано логване в сървърен код (само сигнал, не блокер)
  const raw = (t.match(/\bconsole\.log\s*\(/g) || []).length;
  if (raw >= 5 && /\bexpress|fastify|http\.createServer|app\.listen/.test(t))
    add("info", "unstructured-log", f, 0, `${raw}× console.log в сървърен файл — предпочитай структуриран логър (JSON, ниво, trace_id корелация) за наблюдаемост.`);
}

// health/readiness endpoint при сървърни приложения
for (const { f, t } of serverFiles) {
  const hasHealth = /\/(healthz|health|livez|readyz|ready|_health|ping)\b/.test(t) || /\.get\s*\(\s*['"`]\/(health|ready|ping)/i.test(t);
  if (!hasHealth)
    add("info", "no-health-endpoint", f, 0, "Сървър без health/readiness endpoint (/healthz, /readyz). Liveness рестартира при забиване; readiness спира трафика при незавършен старт — различни цели.");
}

const order = { block: 0, warn: 1, info: 2 };
findings.sort((a, b) => order[a.sev] - order[b.sev] || a.file.localeCompare(b.file));
const blockers = findings.filter(x => x.sev === "block").length;

if (JSON_OUT) {
  await emitJsonNow({ root: ROOT, filesScanned: files.length, servers: serverFiles.length, findings, summary: { blockers, warns: findings.filter(x => x.sev === "warn").length, infos: findings.filter(x => x.sev === "info").length } }, STRICT && blockers ? 1 : 0);
}
const ic = { block: "✗", warn: "▲", info: "·" };
console.log(`\n🔭  Наблюдателят — одит на наблюдаемостта (${files.length} кодови файла, ${serverFiles.length} сървъра)\n`);
if (!findings.length) console.log("  ✓ Няма чести проблеми в наблюдаемостта.");
for (const x of findings.slice(0, 200)) console.log(`  ${ic[x.sev]} [${x.rule}] ${x.file}${x.line ? ":" + x.line : ""}\n      ${x.msg}`);
if (findings.length > 200) console.log(`  … и още ${findings.length - 200}`);
console.log(`\nИтог: ${blockers} блокери · ${findings.filter(x => x.sev === "warn").length} предупреждения · ${findings.filter(x => x.sev === "info").length} бележки`);
console.log(blockers ? "СТАТУС: има блокери." : "СТАТУС: няма твърди блокери (наблюдение на живата система все пак задължително).");
process.exit(STRICT && blockers ? 1 : 0);
