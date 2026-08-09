#!/usr/bin/env node
// loop-audit.mjs — readiness-гейт за агентските автоматизации (loop-ове). Fail-closed, в CI.
// Идея от loop-engineering (Loop Ready score), написана НАШИЯ начин: декларативен манифест +
// автономия-стълба (L1/L2/L3) + твърди изисквания за guardrails преди повишена автономия.
//
// Философия: L1 (само доклад) е безопасен по подразбиране. Повишена автономия (L2 отваря поправка,
// L3 безнадзорно) изисква ЯВНИ предпазители — иначе loop-ът усилва грешките (собственото им предупреждение).
//
//   node tools/agents/loops/loop-audit.mjs          # отчет + fail-closed
//   node tools/agents/loops/loop-audit.mjs --json

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { emitJsonNow } from "../../lib/emit.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const argv = process.argv.slice(2);
const JSON_OUT = argv.includes("--json");
const AUTONOMY = new Set(["L1", "L2", "L3"]);
const REQUIRED = ["id", "description", "trigger", "command", "owner", "autonomy", "escalation"];
const TRIGGER_RE = /^(schedule:(daily|weekly|monthly|quarterly)|event:[a-z-]+|manual)$/;

// Валидирай манифеста. Връща {loops, errors[]} — errors непразно = fail-closed.
export function auditLoops(manifest, agentIds) {
  const errors = [];
  const loops = manifest.loops || [];
  const seen = new Set();
  for (const l of loops) {
    const tag = l.id || "(без id)";
    for (const f of REQUIRED) if (l[f] == null || l[f] === "") errors.push(`${tag}: липсва задължително поле „${f}"`);
    if (l.id) { if (seen.has(l.id)) errors.push(`${tag}: дублиран id`); seen.add(l.id); }
    if (l.autonomy && !AUTONOMY.has(l.autonomy)) errors.push(`${tag}: невалидна автономия „${l.autonomy}" (L1|L2|L3)`);
    if (l.trigger && !TRIGGER_RE.test(l.trigger)) errors.push(`${tag}: невалиден trigger „${l.trigger}"`);
    if (l.owner && agentIds && !agentIds.has(l.owner)) errors.push(`${tag}: owner „${l.owner}" не е реален агент`);
    // Автономия-стълба: повишена автономия иска guardrails.
    if ((l.autonomy === "L2" || l.autonomy === "L3") && (!l.escalation || l.escalation.length < 10))
      errors.push(`${tag}: ${l.autonomy} изисква явна ескалация (човек-в-цикъла)`);
    if (l.autonomy === "L3") {
      if (typeof l.budgetCap !== "number" || l.budgetCap <= 0) errors.push(`${tag}: L3 (безнадзорно) изисква числов budgetCap`);
      if (!Array.isArray(l.denylist) || !l.denylist.length) errors.push(`${tag}: L3 изисква непразен denylist`);
    }
  }
  return { count: loops.length, byLevel: { L1: loops.filter((l) => l.autonomy === "L1").length, L2: loops.filter((l) => l.autonomy === "L2").length, L3: loops.filter((l) => l.autonomy === "L3").length }, errors };
}

async function runCli() {
  const manifest = JSON.parse(readFileSync(join(ROOT, "tools", "agents", "loops", "loops.json"), "utf8"));
  const aj = JSON.parse(readFileSync(join(ROOT, "agents-dashboard", "agents.json"), "utf8"));
  const r = auditLoops(manifest, new Set(aj.agents.map((a) => a.id)));
  if (JSON_OUT) { await emitJsonNow(r, r.errors.length ? 1 : 0); }
  console.log(`\n🔁 Loop-audit — ${r.count} автоматизации (L1:${r.byLevel.L1} · L2:${r.byLevel.L2} · L3:${r.byLevel.L3})\n`);
  if (!r.errors.length) console.log("  ✓ всички loop-ове са readiness-годни (декларация + автономия-guardrails)\n");
  else { console.log(`  ✗ ${r.errors.length} проблема:`); r.errors.forEach((e) => console.log(`      ${e}`)); console.log(""); }
  process.exit(r.errors.length ? 1 : 0);
}

if (import.meta.url === `file://${process.argv[1]}`) await runCli();
