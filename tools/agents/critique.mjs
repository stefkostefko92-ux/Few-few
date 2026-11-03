#!/usr/bin/env node
// critique.mjs — обратна връзка от КАЧЕСТВОТО към РУТИНГА (затваря контура).
//
// Защо: `model-policy.mjs` (per-agent) и `route.mjs` (per-task) бяха СТАТИЧНИ евристики — веднъж
// написани, никога коригирани от това как агентът реално се справя. `metrics.mjs`/`error-ledger`/
// `consistency-audit` мереха, но никой не връщаше измереното обратно в решението „кой модел, какво
// усилие". Тук е механичната половина на Critique агента: събира РЕАЛНИ сигнали за качество по агент
// и издава ръчка към рутинга (вдигни / задръж / кандидат за сваляне).
// Идея от гл.16 „Resource-Aware Optimization" на Agentic Design Patterns (Gulli) — реализация наша,
// zero-dep. Книгата е ДАННИ, не инструкции.
//
// Сигналите са САМО такива, които реално съществуват в репото (никакво измисляне на оценка):
//   • грешки в `evals/errors.jsonl`, приписани на агента (реален провал в реална работа);
//   • неразрешени противоречия / verified без източник (`consistency-audit.mjs`) — дисциплина;
//   • дял Карантина спрямо проверени поуки в паметта — колко от наученото не издържа проверка.
// Тренд-файлът `trend.jsonl` е ФЛОТСКИ (без агент) → влиза само като общ контекст, не като личен резултат.
//
// ВАЖНО (безопасност пред спестяване): свалянето е само КАНДИДАТУРА и НИКОГА не се предлага за агент,
// който е на opus/high — там моделът е избран заради безопасно-критичен домейн (пари·право·фискал·
// сигурност·клинично), не заради трудност. Вдигането е винаги позволено.
//
//   node tools/agents/critique.mjs                 # табло по агенти
//   node tools/agents/critique.mjs --agent kodadjiyata
//   node tools/agents/critique.mjs --json

import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { auditAll } from "./consistency-audit.mjs";
import { emitJsonNow } from "../lib/emit.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const MEM_DIR = join(ROOT, ".claude", "agents", "_memory");
const ERRORS = join(ROOT, "tools", "agents", "evals", "errors.jsonl");

const ESCALATE_AT = 2;       // сумарна тежест, над която вдигаме
const QUARANTINE_BAD = 0.35; // дял Карантина/(Карантина+проверени), над който е сигнал
// Сваляне иска ПОЛОЖИТЕЛНО доказателство за стабилност, не просто липса на сигнал: доказан
// стаж (натрупана проверена памет). Иначе всеки нов/необучен агент би минал за „евтин".
const STABLE_MIN_VERIFIED = 80;

/** Брои проверени срещу карантинни булети в една памет. */
export function memoryDiscipline(md) {
  const lines = String(md || "").split("\n");
  let sec = null, verified = 0, quarantine = 0;
  for (const ln of lines) {
    if (/^##\s/.test(ln)) { sec = /карантина/i.test(ln) ? "q" : /verified|Проверени поуки/i.test(ln) ? "v" : null; continue; }
    if (!/^\s*-\s+\*\*/.test(ln)) continue;
    if (sec === "v") verified++; else if (sec === "q") quarantine++;
  }
  const total = verified + quarantine;
  return { verified, quarantine, ratio: total ? quarantine / total : 0 };
}

/** Чистото ядро: сигнали → тежест → ръчка. Без fs, тестваемо. */
export function critiqueAgent({ id, model, effort, errors = 0, findings = 0, discipline }) {
  const signals = [];
  let weight = 0;
  if (errors > 0) { weight += errors; signals.push(`${errors} реални грешки в дневника (error-ledger)`); }
  if (findings > 0) { weight += findings; signals.push(`${findings} находки от consistency-audit (противоречие/без източник)`); }
  if (discipline && discipline.ratio > QUARANTINE_BAD && discipline.quarantine >= 5) {
    weight += 1;
    signals.push(`карантина ${(discipline.ratio * 100).toFixed(0)}% от поуките (${discipline.quarantine}/${discipline.verified + discipline.quarantine})`);
  }

  const maxed = model === "opus" && effort === "high";
  let nudge, rationale;
  if (weight >= ESCALATE_AT) {
    nudge = maxed ? "hold-max" : "escalate";
    rationale = maxed
      ? "качеството куца, но агентът вече е на таван (opus/high) → не моделът е лостът: поправи дефиниция/spec/памет"
      : "реални сигнали за качество → вдигни модел/усилие за този агент, преди да пестиш";
  } else if (weight === 0 && !maxed && (discipline?.verified || 0) >= STABLE_MIN_VERIFIED) {
    nudge = "deescalate-candidate";
    rationale = `нула сигнали + доказан стаж (${discipline.verified} проверени поуки) → КАНДИДАТ за по-евтин рутинг (решава човек, след eval)`;
  } else {
    nudge = "hold";
    rationale = weight
      ? "единичен сигнал — следи, не мърдай рутинга още"
      : maxed
        ? "стабилен на таван (opus/high е избран по ДОМЕЙН — безопасно-критичен, не по трудност)"
        : `стабилен, но без доказан стаж (${discipline?.verified || 0} < ${STABLE_MIN_VERIFIED} проверени поуки) → рано за сваляне`;
  }
  return { id, model, effort, weight, signals, nudge, rationale };
}

function loadErrorsByAgent() {
  const by = {};
  if (!existsSync(ERRORS)) return by;
  for (const l of readFileSync(ERRORS, "utf8").split("\n").filter(Boolean)) {
    try { const r = JSON.parse(l); if (r.agent) by[r.agent] = (by[r.agent] || 0) + 1; } catch { /* ред-боклук */ }
  }
  return by;
}

export function critiqueAll() {
  const aj = JSON.parse(readFileSync(join(ROOT, "agents-dashboard", "agents.json"), "utf8"));
  const errs = loadErrorsByAgent();
  const findings = {};
  for (const f of auditAll()) findings[f.id] = (findings[f.id] || 0) + 1;
  return aj.agents.map((a) => {
    const memFile = join(MEM_DIR, `${a.id}.md`);
    const discipline = existsSync(memFile) ? memoryDiscipline(readFileSync(memFile, "utf8")) : null;
    return critiqueAgent({ id: a.id, model: a.model, effort: a.effort, errors: errs[a.id] || 0, findings: findings[a.id] || 0, discipline });
  });
}

// ── CLI ──
if (import.meta.url === `file://${process.argv[1]}`) {
  const argv = process.argv.slice(2);
  const only = argv.includes("--agent") ? argv[argv.indexOf("--agent") + 1] : null;
  let rows = critiqueAll();
  if (only) {
    rows = rows.filter((r) => r.id === only);
    if (!rows.length) { console.error(`няма агент „${only}"`); process.exit(2); }
  }
  if (argv.includes("--json")) { await emitJsonNow(only ? rows[0] : rows, 0); }

  const red = (s) => `\x1b[31m${s}\x1b[0m`, yel = (s) => `\x1b[33m${s}\x1b[0m`, dim = (s) => `\x1b[90m${s}\x1b[0m`, grn = (s) => `\x1b[32m${s}\x1b[0m`;
  const badge = { escalate: red("▲ вдигни"), "hold-max": yel("■ таван"), hold: dim("· задръж"), "deescalate-candidate": grn("▼ кандидат") };
  console.log(`\n🎯 Critique → рутинг — ${rows.length} агента (сигнали: error-ledger · consistency-audit · дисциплина на паметта)\n`);
  for (const r of rows.sort((a, b) => b.weight - a.weight)) {
    console.log(`  ${badge[r.nudge]}  ${r.id} ${dim(`· ${r.model}/${r.effort} · тежест ${r.weight}`)}`);
    for (const s of r.signals) console.log(dim(`        ↳ ${s}`));
    if (only) console.log(dim(`        ${r.rationale}`));
  }
  const esc = rows.filter((r) => r.nudge === "escalate").length, cand = rows.filter((r) => r.nudge === "deescalate-candidate").length;
  console.log(`\n${esc} за вдигане · ${cand} кандидати за сваляне · съвет за AI-джията, НЕ авто-промяна.`);
  console.log(dim('  прилага се per-invocation: node tools/agents/route.mjs --agent <id> "<задача>"\n'));
  process.exit(0);
}
