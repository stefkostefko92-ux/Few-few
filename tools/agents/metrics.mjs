#!/usr/bin/env node
// metrics.mjs — runtime метрики на самия флот (не на продуктите — това е работа на Наблюдателя).
//
// Защо: `oversee` мери СТАТИЧНА цялост (def↔памет↔json). Тук мерим ДВИЖЕНИЕ: колко учи всеки
// агент, кога за последно, добив на поуки, застой, съотношение карантина, разпределение по зрелост.
// Сигналът идва от `agents-dashboard/agents.json` + `_memory/<id>.md` + (по избор) flow-ledger.
//
//   node tools/agents/metrics.mjs                 # човешки отчет
//   node tools/agents/metrics.mjs --json
//   node tools/agents/metrics.mjs --write          # запиши agents-dashboard/metrics.json (за таблото)

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { sectionBullets } from "./oversee-lib.mjs";
import { emitJsonNow } from "../lib/emit.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const JSON_PATH = join(ROOT, "agents-dashboard", "agents.json");
const MEM_DIR = join(ROOT, ".claude", "agents", "_memory");
const OUT = join(ROOT, "agents-dashboard", "metrics.json");
const argv = process.argv.slice(2);
const JSON_OUT = argv.includes("--json");
const WRITE = argv.includes("--write");
const TODAY = process.env.OVERSEE_TODAY || new Date().toISOString().slice(0, 10);
const STALE_DAYS = 45;

const daysSince = (d) => d ? Math.round((new Date(TODAY) - new Date(d)) / 86400000) : null;
const aj = JSON.parse(readFileSync(JSON_PATH, "utf8"));
const agents = aj.agents || aj;

const per = agents.map((a) => {
  let verified = 0, quarantine = 0;
  const mf = join(MEM_DIR, a.id + ".md");
  if (existsSync(mf)) { const md = readFileSync(mf, "utf8"); verified = sectionBullets(md, "Проверени поуки").length; quarantine = sectionBullets(md, "Карантина").length; }
  const recent = a.recentLessons || [];
  const dates = recent.map((l) => l.date).filter(Boolean).sort();
  const lastLearned = dates.length ? dates[dates.length - 1] : (a.evolution?.[a.evolution.length - 1]?.date || null);
  const yield30 = recent.filter((l) => l.date && daysSince(l.date) <= 30).length;
  const version = a.evolution?.[a.evolution.length - 1]?.version || "0.0.0";
  const idle = daysSince(lastLearned);
  return { id: a.id, verified, quarantine, version, major: +version.split(".")[0], lastLearned, idleDays: idle, yield30, stale: idle != null && idle > STALE_DAYS, qRatio: verified ? +(quarantine / verified).toFixed(2) : 0 };
});

const sum = (k) => per.reduce((a, r) => a + (r[k] || 0), 0);
const totalLessons = sum("verified");
const sorted = [...per].sort((a, b) => b.verified - a.verified);
const median = (arr) => { const s = [...arr].sort((a, b) => a - b); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const fleet = {
  today: TODAY,
  agents: per.length,
  totalLessons,
  avgLessons: +(totalLessons / per.length).toFixed(1),
  medianLessons: median(per.map((r) => r.verified)),
  totalQuarantine: sum("quarantine"),
  quarantineRatio: totalLessons ? +(sum("quarantine") / totalLessons).toFixed(2) : 0,
  yield30: sum("yield30"),
  staleAgents: per.filter((r) => r.stale).map((r) => r.id),
  mostActive: sorted.slice(0, 3).map((r) => ({ id: r.id, lessons: r.verified })),
  leastActive: sorted.slice(-3).map((r) => ({ id: r.id, lessons: r.verified })),
  maturity: { min: Math.min(...per.map((r) => r.major)), max: Math.max(...per.map((r) => r.major)) },
};

// по избор: blocker-rate от flow-ledger, ако има
try {
  const led = join(MEM_DIR, "_flows.jsonl");
  if (existsSync(led)) {
    const rows = readFileSync(led, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
    const starts = rows.filter((r) => r.t === "start").length;
    const blockers = new Set(rows.filter((r) => r.t === "handoff" && r.status === "блокер").map((r) => r.id)).size;
    if (starts) fleet.flowBlockerRate = +(blockers / starts).toFixed(2);
  }
} catch { /* ledger optional */ }

const payload = { fleet, agents: per };
if (WRITE) { writeFileSync(OUT, JSON.stringify(payload, null, 2)); if (!JSON_OUT) console.log(`✎ записан ${OUT.replace(ROOT + "/", "")}`); }
if (JSON_OUT) { await emitJsonNow(payload, 0); }

console.log(`\n📊  Метрики на флота (${TODAY})\n`);
console.log(`  Поуки: ${totalLessons} общо · средно ${fleet.avgLessons}/агент · медиана ${fleet.medianLessons}`);
console.log(`  Добив (30д): ${fleet.yield30} нови поуки · Карантина: ${fleet.totalQuarantine} (съотн. ${fleet.quarantineRatio})`);
console.log(`  Зрелост: v${fleet.maturity.min}–v${fleet.maturity.max} · ${fleet.staleAgents.length} застояли (>${STALE_DAYS}д без учене)`);
if (fleet.flowBlockerRate != null) console.log(`  Flow blocker-rate: ${fleet.flowBlockerRate}`);
console.log(`\n  Най-активни: ${fleet.mostActive.map((r) => `${r.id}(${r.lessons})`).join(", ")}`);
console.log(`  Най-тихи:    ${fleet.leastActive.map((r) => `${r.id}(${r.lessons})`).join(", ")}`);
if (fleet.staleAgents.length) console.log(`\n  ▲ Застояли: ${fleet.staleAgents.join(", ")} — не са учили >${STALE_DAYS}д (не е задължително проблем).`);
process.exit(0);
