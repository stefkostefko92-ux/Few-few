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
//   node tools/agents/route.mjs "провери за SQL injection в checkout webhook"
//   node tools/agents/route.mjs --json "преведи етикета на бутона на италиански"
//   echo "мигрирай Prisma схемата" | node tools/agents/route.mjs

import { readFileSync } from "node:fs";

const argv = process.argv.slice(2);
const JSON_OUT = argv.includes("--json");
let task = argv.filter((a) => a !== "--json").join(" ").trim();
if (!task) { try { task = readFileSync(0, "utf8").trim(); } catch { /* без stdin */ } }

// Сигнали за ДЪЛБОЧИНА/РИСК → opus + high (безопасно-критично или сложно разсъждение).
const DEEP = /пари|плащан|payment|stripe|webhook|фискал|н-18|супто|евроцент|право|gdpr|правн|legal|клинич|медицин|алерги|сигурн|уязвим|injection|инжекц|owasp|exfil|мигр|migrat|schema|схема|деплой|deploy|архитект|architect|рефактор|concurren|race|крипт|auth|токен подпис|jwt|бектест|backtest|инвариант|дедукц|threat|red.?team|razbivacha/i;
// Сигнали за МЕХАНИЧНО/ШАБЛОННО → sonnet + low (детерминистично, малко преценка).
const MECH = /превод|превед|translate|parity|паритет|changelog|release note|формат|format|преимен|rename|коментар|comment|typo|печатн|таблиц|списък с|seed|сийд|линт|lint фикс|whitespace|индент/i;

let model = "sonnet", effort = "medium", why;
if (DEEP.test(task)) { model = "opus"; effort = "high"; why = "дълбочина/риск (пари·право·фискал·сигурност·миграция·архитектура) → пълна дълбочина"; }
else if (MECH.test(task)) { model = "sonnet"; effort = "low"; why = "механично/шаблонно (превод·seed·формат·changelog) → минимален reasoning бюджет"; }
else { why = "стандартна специалист-задача → способно на sonnet, средно усилие"; }

const out = { task, model, effort, rationale: why, note: "съвет за президента; per-invocation надстройка над per-agent default; без Haiku" };
if (JSON_OUT) { console.log(JSON.stringify(out, null, 2)); process.exit(0); }
if (!task) { console.log('Дай задача: node tools/agents/route.mjs "<описание>"'); process.exit(0); }
console.log(`\n🧭 Рутинг по задача\n  задача: ${task}\n  → модел: ${model} · усилие: ${effort}\n  защо: ${why}\n  (съвет за AI-джията · per-invocation · без Haiku)\n`);
process.exit(0);
