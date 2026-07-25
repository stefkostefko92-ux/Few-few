#!/usr/bin/env node
// route.mjs — рутинг по ЗАДАЧА (не само по агент): препоръчва модел + усилие за конкретно извикване.
//
// Защо (токен-лост + ефикасност): моделът/усилието са фиксирани per-agent (model-policy.mjs). Но един
// агент върши и тривиални, и тежки под-задачи. Президентът (AI-джията) да НАДСТРОИ per-invocation:
// тривиална под-задача на opus-агент → свали на sonnet/low; рискова под-задача на sonnet-агент → вдигни
// усилието. По-малко reasoning токени за лесното, пълна дълбочина за критичното. Съвет, не команда.
//
// БЕЗ Haiku — умишлено (решение на собственика). Изборът е opus|sonnet × effort low|medium|high.
//
// ОБРАТНА ВРЪЗКА ОТ КАЧЕСТВОТО (`--agent <id>`): рутингът вече не е само статична евристика върху
// текста на задачата — `critique.mjs` връща реални сигнали за агента (грешки в дневника, находки от
// consistency-audit, дисциплина на паметта) и те НАДСТРОЯВАТ решението. Куца ли качеството → вдигаме,
// колкото и „лесна" да изглежда задачата. Свалянето е само кандидатура и минава през човек — никога
// не се прилага автоматично тук. (Гл.16 „Resource-Aware Optimization" — Critique → routing контур.)
//
//   node tools/agents/route.mjs "провери за SQL injection в checkout webhook"
//   node tools/agents/route.mjs --agent kasadjiyata "оправи етикета на бутона"
//   node tools/agents/route.mjs --json "преведи етикета на бутона на италиански"
//   echo "мигрирай Prisma схемата" | node tools/agents/route.mjs

import { readFileSync } from "node:fs";

const argv = process.argv.slice(2);
const JSON_OUT = argv.includes("--json");
const agentIdx = argv.indexOf("--agent");
const AGENT = agentIdx >= 0 ? argv[agentIdx + 1] : null;
// ВНИМАНИЕ: при липсващ --agent agentIdx е -1 → agentIdx+1 е 0 и би изял ПЪРВИЯ аргумент (задачата).
// Затова изключваме индексите само когато флагът реално присъства.
let task = argv.filter((a, i) => a !== "--json" && (agentIdx < 0 || (i !== agentIdx && i !== agentIdx + 1))).join(" ").trim();
if (!task) { try { task = readFileSync(0, "utf8").trim(); } catch { /* без stdin */ } }

// Сигнали за ДЪЛБОЧИНА/РИСК → opus + high (безопасно-критично или сложно разсъждение).
const DEEP = /пари|плащан|payment|stripe|webhook|фискал|н-18|супто|евроцент|право|gdpr|правн|legal|клинич|медицин|алерги|сигурн|уязвим|injection|инжекц|owasp|exfil|мигр|migrat|schema|схема|деплой|deploy|архитект|architect|рефактор|concurren|race|крипт|auth|токен подпис|jwt|бектест|backtest|инвариант|дедукц|threat|red.?team|razbivacha/i;
// Сигнали за МЕХАНИЧНО/ШАБЛОННО → sonnet + low (детерминистично, малко преценка).
const MECH = /превод|превед|translate|parity|паритет|changelog|release note|формат|format|преимен|rename|коментар|comment|typo|печатн|таблиц|списък с|seed|сийд|линт|lint фикс|whitespace|индент/i;

let model = "sonnet", effort = "medium", why;
if (DEEP.test(task)) { model = "opus"; effort = "high"; why = "дълбочина/риск (пари·право·фискал·сигурност·миграция·архитектура) → пълна дълбочина"; }
else if (MECH.test(task)) { model = "sonnet"; effort = "low"; why = "механично/шаблонно (превод·seed·формат·changelog) → минимален reasoning бюджет"; }
else { why = "стандартна специалист-задача → способно на sonnet, средно усилие"; }

// ── Надстройка от критиката (ако е подаден --agent) ──
// Само НАГОРЕ. Сваляне не се прилага автоматично: „кандидат" е предложение за човек, не решение —
// евтин рутинг върху агент с реални сигнали за качество е точно грешката, която пестенето прави.
let critique = null;
if (AGENT) {
  try {
    const { critiqueAll } = await import("./critique.mjs");
    critique = critiqueAll().find((c) => c.id === AGENT) || null;
    if (critique && (critique.nudge === "escalate" || critique.nudge === "hold-max")) {
      const before = `${model}/${effort}`;
      if (critique.nudge === "escalate") { model = "opus"; effort = "high"; }
      else { model = critique.model; effort = critique.effort; } // вече на таван → уважи per-agent избора
      why += ` · НАДСТРОЕНО от критиката (${before} → ${model}/${effort}): ${critique.signals.join("; ") || critique.rationale}`;
    }
  } catch { /* критиката е по избор — липсва ли, рутингът пада обратно към евристиката */ }
}

const out = { task, agent: AGENT, model, effort, rationale: why, critique, note: "съвет за президента; per-invocation надстройка над per-agent default; критиката вдига, но НЕ сваля автоматично; без Haiku" };
if (JSON_OUT) { console.log(JSON.stringify(out, null, 2)); process.exit(0); }
if (!task) { console.log('Дай задача: node tools/agents/route.mjs [--agent <id>] "<описание>"'); process.exit(0); }
console.log(`\n🧭 Рутинг по задача${AGENT ? ` · агент ${AGENT}` : ""}\n  задача: ${task}\n  → модел: ${model} · усилие: ${effort}\n  защо: ${why}`);
if (critique && critique.nudge === "deescalate-candidate")
  console.log(`  \x1b[90mбележка: критиката го дава за кандидат за по-евтин рутинг (${critique.rationale}) — решава ЧОВЕК, не се прилага тук\x1b[0m`);
console.log(`  (съвет за AI-джията · per-invocation · без Haiku)\n`);
process.exit(0);
