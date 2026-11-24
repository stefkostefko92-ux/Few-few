#!/usr/bin/env node
// agent-cap.mjs — PreToolUse(Agent|Task): правилото „общи агенти: твърд таван 10 на сесия“ става
// механизъм. Наши агенти (.claude/agents/*.md) не се броят; общите (general-purpose, Explore, Plan,
// fork, claude…) се броят по session_id и 11-ият се спира с причина.
//
// Защо (проучване 31.10.2026): таванът живееше само в коренния CLAUDE.md, а харнесът има само таван на
// ЕДНОВРЕМЕННИТЕ субагенти (CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS, по подразбиране 20 —
// code.claude.com/docs/en/agent-sdk/subagents). Opus 5 делегира по-охотно; „моля“ в текст не е таван.
// Правилото на собственика: нашите агенти първо — всяко пускане учи флота, общото не учи нищо.
//
// Състояние: .claude/hooks/_state/agent-cap.json {session_id: брой}. Грешка на куката → спира (fail-closed
// от 23.11.2026, заради месечния таван — виж budgetFor); собственикът вижда причината в съобщението.

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { isMain } from "../../tools/lib/is-main.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
export const CAP = 10;

// Нашите агенти идват от matcher-а на SubagentStart в settings.json — той е под guard-self. Дотогава се четеше
// папката `.claude/agents/`, а нов `general-purpose.md` там правеше общия агент „наш“ и той бягаше и от тавана
// „10 общи на сесия“, и от общия кош на разхода (Разбивача, 23.11.2026, N6). Вградените типове са винаги общи.
const BUILTIN = new Set(["general-purpose", "Explore", "Plan", "fork", "claude", "statusline-setup", "web-fetch", "workflow-subagent"]);
export function ourAgents(settingsFile = join(HERE, "..", "settings.json")) {
  try {
    const s = JSON.parse(readFileSync(settingsFile, "utf8"));
    const m = (s.hooks?.SubagentStart || []).map((h) => h.matcher).find((x) => typeof x === "string" && x.includes("|")) || "";
    return new Set(m.split("|").filter((x) => /^[a-z0-9-]+$/.test(x) && !BUILTIN.has(x)));
  } catch { return new Set(); }
}

/** Решение за едно пускане: {count, block, why}. `state` се променя на място. */
export function decide(payload, state, ours) {
  const type = String(payload?.tool_input?.subagent_type || "general-purpose");
  if (ours.has(type)) return { count: state[payload.session_id] || 0, block: false };
  const sid = String(payload?.session_id || "?");
  const next = (state[sid] || 0) + 1;
  if (next > CAP) return { count: state[sid] || 0, block: true, why: `общ агент № ${next} („${type}“) — таванът е ${CAP} на сесия` };
  state[sid] = next;
  return { count: next, block: false };
}

// Месечният таван на разхода (23.11.2026, искане на собственика) — логиката е в budget.mjs (под guard-self).
// Зарежда се динамично: счупен модул или липсващ дневник не бива да спрат таванa на общите агенти.
// Грешка тук (липсващ модул, папка вместо файл) СПИРА — Разбивача (N3, N7): иначе `git stash -u` или изтрит
// budget.mjs изключваше тавана тихо.
async function budgetFor(payload, ours) {
  try {
    const { budgetCheck, loadUsage } = await import("./budget.mjs");
    return budgetCheck(payload, ours, { records: loadUsage(join(HERE, "..", "..")) });
  } catch (e) {
    return { block: true, warn: false, why: `таванът не може да се провери (${String(e?.message || e).slice(0, 120)}) — собственикът да погледне куката.` };
  }
}

if (isMain(import.meta.url)) {
  try {
    const payload = JSON.parse(readFileSync(0, "utf8") || "{}");
    const ours = ourAgents();
    const dir = join(HERE, "_state");
    const file = join(dir, "agent-cap.json");
    let state = {};
    try { state = JSON.parse(readFileSync(file, "utf8")); } catch { state = {}; }
    // Броячът „10 общи на сесия“ е за Agent/Task; Workflow пуска агентите си сам и се пази от тавана на флота.
    if (payload?.tool_name !== "Workflow") {
      const r = decide(payload, state, ours);
      if (r.block) {
        process.stderr.write(`agent-cap: ${r.why}. Ползвай наш агент от .claude/agents/ (route-hint ги назовава) или провери сам; нужда от повече общи → собственикът решава.\n`);
        process.exit(2);
      }
    }
    const b = await budgetFor(payload, ours);
    if (b?.block) {
      process.stderr.write(`agent-cap: месечният таван е стигнат — ${b.why} Пускането чака одобрение на собственика.\n`);
      process.exit(2);
    }
    mkdirSync(dir, { recursive: true });
    writeFileSync(file, JSON.stringify(state));
    if (b?.warn) process.stdout.write(JSON.stringify({
      systemMessage: `Таван на разхода: ${b.why}`,
      hookSpecificOutput: { hookEventName: "PreToolUse", additionalContext: `Таван на разхода: ${b.why} Дръж пускането кратко и целенасочено.` },
    }));
    process.exit(0);
  } catch (e) {
    process.stderr.write(`agent-cap: куката не може да провери пускането (${String(e?.message || e).slice(0, 120)}) — спира, докато собственикът не погледне.\n`);
    process.exit(2);
  }
}
