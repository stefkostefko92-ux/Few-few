#!/usr/bin/env node
// def-freshness.mjs — свежест на ДЕФИНИЦИИТЕ (не паметта). Дефинициите носят закотвени
// време-чувствителни факти, които гният. Този одит ги класифицира и флагва ДЕЙСТВЕНОТО:
//   • ПРОСРОЧЕН СРОК = ред с ключова дума за срок (target API/краен срок/в сила от/оттегляне) + МИНАЛА
//     дата → почти сигурно застаряло (твърдо, exit 1).
//   • Стар „последно проверено" маркер (>120д) → дефиницията не е ревизирана скоро (предупреждение).
//   • Останалите дати (исторически споменавания) → само информативен брой, без провал.
// Допълва memory re-verify (той е за паметта; това — за самите .md дефиниции). Пусни тримесечно.
//
//   node tools/agents/def-freshness.mjs [--json]     OVERSEE_TODAY=YYYY-MM-DD за детерминизъм

import { readdirSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const AGENTS_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "..", ".claude", "agents");
const TODAY = process.env.OVERSEE_TODAY || new Date().toISOString().slice(0, 10);
const JSON_OUT = process.argv.includes("--json");
const STALE_MARKER_DAYS = 120;

// Само БЪДЕЩЕ-ориентирани срокове: минала дата тук = вече изтекъл срок → преглед. „в сила от"/„оттеглени"
// с минала дата НЕ са застаряли (законът е в сила / събитието се е случило) → не се хващат тук.
const DEADLINE = /(target\s*(?:sdk|api)\s*\d+|краен срок|deadline|задължител\w* (?:от|става)|спир\w* да поддържа|до \d{2}\.\d{2}\.20\d\d)/i;
const VERIFIED = /(посл\.?\s*провер|последно провер|last\s*verified|last\s*checked|актуал\w* към)/i;
const daysBetween = (a, b) => Math.round((new Date(b) - new Date(a)) / 86400000);

export function datesIn(line) {
  const out = [];
  let m;
  const iso = /\b(20\d\d)-(\d\d)-(\d\d)\b/g; while ((m = iso.exec(line))) out.push(`${m[1]}-${m[2]}-${m[3]}`);
  const dmy = /\b(\d{2})\.(\d{2})\.(20\d\d)\b/g; while ((m = dmy.exec(line))) out.push(`${m[3]}-${m[2]}-${m[1]}`);
  return out;
}
function agentIds() {
  return readdirSync(AGENTS_DIR).filter((f) => f.endsWith(".md") && !f.startsWith("_") && f !== "README.md").map((f) => f.replace(/\.md$/, "")).sort();
}

if (import.meta.url === `file://${process.argv[1]}`) runCli();
function runCli() {
const rows = [];
let overdue = 0, staleMarkers = 0, mentions = 0;
for (const id of agentIds()) {
  const lines = readFileSync(join(AGENTS_DIR, id + ".md"), "utf8").split("\n");
  const od = [], sm = [];
  lines.forEach((ln, i) => {
    const ds = datesIn(ln);
    if (!ds.length) return;
    const isDeadline = DEADLINE.test(ln), isVerified = VERIFIED.test(ln);
    for (const d of ds) {
      const past = d < TODAY;
      if (isDeadline && past) { od.push({ line: i + 1, date: d, text: ln.trim().slice(0, 100) }); overdue++; }
      else if (isVerified && daysBetween(d, TODAY) > STALE_MARKER_DAYS) { sm.push({ line: i + 1, date: d, age: daysBetween(d, TODAY) }); staleMarkers++; }
      else mentions++;
    }
  });
  if (od.length || sm.length) rows.push({ id, overdue: od, staleMarkers: sm });
}

if (JSON_OUT) { console.log(JSON.stringify({ today: TODAY, overdue, staleMarkers, mentions, rows }, null, 2)); process.exit(overdue ? 1 : 0); }
const r = (s) => `\x1b[31m${s}\x1b[0m`, y = (s) => `\x1b[33m${s}\x1b[0m`, dim = (s) => `\x1b[90m${s}\x1b[0m`, g = (s) => `\x1b[32m${s}\x1b[0m`;
console.log(`\n🕗  Свежест на дефинициите (${TODAY})\n`);
for (const row of rows) {
  console.log(`  ${row.id}`);
  row.overdue.forEach((p) => console.log(`    ${r("✗ ПРОСРОЧЕН СРОК")} ${p.date} @ ред ${p.line}: ${dim(p.text)}`));
  row.staleMarkers.forEach((s) => console.log(`    ${y("▲ стар маркер")} ${s.date} (${s.age}д) @ ред ${s.line}`));
}
if (!overdue && !staleMarkers) console.log(g("  ✓ няма просрочени срокове или стари маркери"));
console.log(`\nИтог: ${overdue} просрочени срока · ${staleMarkers} стари „проверено" маркера · ${mentions} исторически дати (инфо).`);
console.log(`Просрочен срок → провери и обнови дефиницията. Пусни тримесечно.`);
process.exit(overdue ? 1 : 0);
}
