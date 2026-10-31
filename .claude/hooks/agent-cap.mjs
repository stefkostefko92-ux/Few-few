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
// Състояние: .claude/hooks/_state/agent-cap.json {session_id: брой}. Fail-open при грешка на куката
// (броячът е икономия, не сигурност — не бива да спира нашите агенти).

import { readFileSync, writeFileSync, mkdirSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
export const CAP = 10;

export function ourAgents(dir = join(HERE, "..", "agents")) {
  try { return new Set(readdirSync(dir).filter((f) => f.endsWith(".md") && !f.startsWith("_") && f !== "README.md").map((f) => f.slice(0, -3))); }
  catch { return new Set(); }
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

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    const payload = JSON.parse(readFileSync(0, "utf8") || "{}");
    const dir = join(HERE, "_state");
    const file = join(dir, "agent-cap.json");
    let state = {};
    try { state = JSON.parse(readFileSync(file, "utf8")); } catch { state = {}; }
    const r = decide(payload, state, ourAgents());
    if (r.block) {
      process.stderr.write(`agent-cap: ${r.why}. Ползвай наш агент от .claude/agents/ (route-hint ги назовава) или провери сам; нужда от повече общи → собственикът решава.\n`);
      process.exit(2);
    }
    mkdirSync(dir, { recursive: true });
    writeFileSync(file, JSON.stringify(state));
    process.exit(0);
  } catch { process.exit(0); }
}
