#!/usr/bin/env node
// claims-audit.mjs — свежест + карта на зависимостта за ВОЛАТИЛНИ ПРАВНИ/ТАКСОНОМИЧНИ твърдения.
//
// Защо съществува (различно от version-freshness = npm версии; от def-freshness = ДАТИ в дефиниции):
//   Правен/регулаторен цитат в дефиниция гниеше БЕЗ механизъм за свежест — паметта се самолекува през
//   кука, но дефиницията се пипа само на ръка. Тук всяко твърдение носи source + checkedAt + TTL и
//   claims-audit --check ПАДА при изтекъл TTL → налага повторна проверка срещу първоизточника.
//   agents[] е картата: при промяна знаеш кои да сверт. anchor (по избор, само НЕДВУСМИСЛЕН литерал
//   като таксономичен код) дава авто-проверка за присъствие; правните членове НЕ се grep-ват (измерено
//   двусмислени → шум), само TTL + карта, човек сверява.
//
//   node tools/agents/claims-audit.mjs [--json] [--check]   OVERSEE_TODAY=YYYY-MM-DD за детерминизъм

import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { emitJsonNow } from "../lib/emit.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const AGENTS_DIR = join(ROOT, ".claude", "agents");
const MEM_DIR = join(AGENTS_DIR, "_memory");
const CLAIMS = join(dirname(fileURLToPath(import.meta.url)), "claims.json");
const TODAY = process.env.OVERSEE_TODAY || new Date().toISOString().slice(0, 10);
const daysBetween = (a, b) => Math.round((new Date(b) - new Date(a)) / 86400000);

export function realAgentIds(dir = AGENTS_DIR) {
  return new Set(
    readdirSync(dir).filter((f) => f.endsWith(".md") && !f.startsWith("_") && f !== "README.md").map((f) => f.replace(/\.md$/, "")),
  );
}

// Изтекъл TTL → твърдението не е сверявано скоро → повторна проверка срещу първоизточника (твърд провал).
export function ttlBreaches(reg, today = TODAY) {
  const out = [];
  for (const c of reg.claims) {
    const ttl = c.ttlDays ?? reg.ttlDays;
    const age = daysBetween(c.checkedAt, today);
    if (age > ttl) out.push({ id: c.id, checkedAt: c.checkedAt, age, ttl, source: c.source });
  }
  return out;
}

// Твърдение сочи агент, който не съществува → счупена карта на зависимостта (твърд провал).
export function missingAgents(reg, ids = realAgentIds()) {
  const out = [];
  for (const c of reg.claims) for (const a of c.agents || []) if (!ids.has(a)) out.push({ id: c.id, agent: a });
  return out;
}

// САМО за твърдения с недвусмислен anchor: цитиран агент, чиито дефиниция И памет НЕ съдържат anchor-а
// → твърдението е дрейфнало/паднало от този агент. Всички цитирани без anchor → мъртво твърдение (твърдо);
// част без anchor → предупреждение (може да живее само в паметта на друг / чрез синоним).
export function anchorDrift(reg, agentsDir = AGENTS_DIR, memDir = MEM_DIR) {
  const has = (id, anchor) => {
    const def = join(agentsDir, id + ".md"), mem = join(memDir, id + ".md");
    const t = (existsSync(def) ? readFileSync(def, "utf8") : "") + (existsSync(mem) ? readFileSync(mem, "utf8") : "");
    return t.includes(anchor);
  };
  const rows = [];
  for (const c of reg.claims) {
    if (!c.anchor) continue;
    const absent = (c.agents || []).filter((a) => !has(a, c.anchor));
    if (absent.length) rows.push({ id: c.id, anchor: c.anchor, absent, all: absent.length === (c.agents || []).length });
  }
  return rows;
}

export function loadClaims() { return JSON.parse(readFileSync(CLAIMS, "utf8")); }

if (import.meta.url === `file://${process.argv[1]}`) await runCli();
async function runCli() {
  const JSON_OUT = process.argv.includes("--json");
  const CHECK = process.argv.includes("--check");
  const reg = loadClaims();
  const ids = realAgentIds();
  const ttl = ttlBreaches(reg, TODAY);
  const missing = missingAgents(reg, ids);
  const drift = anchorDrift(reg);
  const hardDrift = drift.filter((d) => d.all);
  const softDrift = drift.filter((d) => !d.all);
  const hard = ttl.length + missing.length + hardDrift.length;

  if (JSON_OUT) await emitJsonNow({ today: TODAY, claims: reg.claims.length, ttlBreaches: ttl, missingAgents: missing, anchorDrift: drift }, CHECK && hard ? 1 : 0);

  const r = (s) => `\x1b[31m${s}\x1b[0m`, y = (s) => `\x1b[33m${s}\x1b[0m`, g = (s) => `\x1b[32m${s}\x1b[0m`, dim = (s) => `\x1b[90m${s}\x1b[0m`;
  console.log(`\n⚖  Регистър на правни/таксономични твърдения (${TODAY}) — ${reg.claims.length} записа, TTL ${reg.ttlDays}д\n`);
  for (const c of reg.claims) {
    const age = daysBetween(c.checkedAt, TODAY), ttlD = c.ttlDays ?? reg.ttlDays;
    const stale = age > ttlD;
    console.log(`  ${stale ? r("✗") : g("✓")} ${c.id} ${dim(`[${c.kind}] сверено ${c.checkedAt} (${age}д/${ttlD}д)`)}`);
    console.log(`     ${dim("агенти:")} ${(c.agents || []).join(", ") || "—"}${c.anchor ? dim(`  anchor: ${c.anchor}`) : ""}`);
  }
  if (ttl.length) { console.log(r(`\n  ✗ изтекъл TTL (сверѝ срещу първоизточника):`)); ttl.forEach((t) => console.log(`     ${t.id} — ${t.age}д (лимит ${t.ttl}д) · ${dim(t.source)}`)); }
  if (missing.length) { console.log(r(`\n  ✗ несъществуващ агент в картата:`)); missing.forEach((m) => console.log(`     ${m.id} → ${m.agent}`)); }
  if (hardDrift.length) { console.log(r(`\n  ✗ мъртво твърдение (anchor липсва във ВСИЧКИ цитирани):`)); hardDrift.forEach((d) => console.log(`     ${d.id} (${d.anchor}) → ${d.absent.join(", ")}`)); }
  if (softDrift.length) { console.log(y(`\n  ▲ частичен дрейф (anchor липсва в част от цитираните):`)); softDrift.forEach((d) => console.log(`     ${d.id} (${d.anchor}) → ${d.absent.join(", ")}`)); }
  if (!ttl.length && !missing.length && !drift.length) console.log(g("\n  ✓ всички твърдения свежи, картата е цяла, без дрейф"));

  console.log(`\nИтог: ${ttl.length} изтекли · ${missing.length} счупени връзки · ${hardDrift.length} мъртви · ${softDrift.length} частичен дрейф.`);
  if (CHECK) console.log(hard ? r("СТАТУС: провал — сверѝ и обнови claims.json.") : g("СТАТУС: зелено."));
  process.exit(CHECK && hard ? 1 : 0);
}
