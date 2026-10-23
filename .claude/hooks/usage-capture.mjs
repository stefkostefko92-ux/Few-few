#!/usr/bin/env node
// usage-capture.mjs — реалната употреба на всяко пускане на агент (SubagentStop) + доставка (Stop).
//
// Защо (2026-09-23): цялата токен-отчетност беше оценка от статичния текст, който е под 8% от цената.
// Транскриптът на субагента носи точната употреба на всеки ход — тук се превръща в ЕДИН запис с
// числа (без текст от задачата) и отива в локален буфер в .git. При край на хода на главната сесия
// (Stop) буферът се изпраща като един commit в клона agents/memory, фоново — клонът на задачата
// остава чист, а данните оцеляват след контейнера.
//
// Регистрирана и за SubagentStop, и за Stop (едно място за едно нещо). Fail-open навсякъде.
// AGENT_MEMORY_SYNC=0 спира фоновата доставка (тестове/офлайн); буферът остава за следващия път.

import { readFileSync, existsSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { summarizeTranscript } from "../../tools/lib/usage.mjs";
import { appendPendingUsage, pendingUsagePath, isGitRepo } from "../../tools/lib/memory-branch.mjs";
import { evalMode } from "../../tools/lib/eval-mode.mjs";

const ROOT = process.env.CLAUDE_PROJECT_DIR || join(dirname(fileURLToPath(import.meta.url)), "..", "..");

export function captureRun(payload, cwd = ROOT) {
  const tp = payload.agent_transcript_path;
  if (!tp || !isGitRepo(cwd)) return null;
  const rec = summarizeTranscript(tp, { agentType: payload.agent_type || "", effort: payload.effort?.level || "" });
  if (!rec) return null;
  const ev = evalMode(cwd);
  if (ev) rec.eval = `${ev.label}${ev.memory === "off" ? "·без-памет" : ""}`; // проверка ≠ продукция в отчета
  return appendPendingUsage(cwd, rec) ? rec : null;
}

function flushInBackground(cwd = ROOT) {
  if (process.env.AGENT_MEMORY_SYNC === "0") return false;
  const p = pendingUsagePath(cwd);
  if (!p || !existsSync(p) || statSync(p).size === 0) return false;
  try {
    const child = spawn(process.execPath, [join(cwd, "tools", "lib", "memory-branch.mjs"), "--sync", "--flush-usage"],
      { cwd, detached: true, stdio: "ignore", env: { ...process.env, CLAUDE_PROJECT_DIR: cwd } });
    child.unref();
    return true;
  } catch { return false; }
}

function main() {
  let p = {};
  try { p = JSON.parse(readFileSync(0, "utf8")); } catch { process.exit(0); }
  if (p.hook_event_name === "SubagentStop") {
    // Агент, върнат от DoD гейта, спира отново — записът е по идентичност на транскрипта (id), дублите
    // се махат при доставка. Затова тук просто записваме.
    captureRun(p);
  } else if (p.hook_event_name === "Stop") {
    flushInBackground();
  }
  process.exit(0);
}

if (import.meta.url === `file://${process.argv[1]}`) { try { main(); } catch { process.exit(0); } }
