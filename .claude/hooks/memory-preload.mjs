#!/usr/bin/env node
// .claude/hooks/memory-preload.mjs — SubagentStart hook (v6.0 самообучение).
//
// Инжектира секцията „Проверени поуки" от _memory/<agent>.md в контекста на агента
// при стартиране, за да тръгне с натрупаното знание (а не „моля, прочети файла").
// Изнася само ПРОВЕРЕНОТО (карантината не се хранѝ обратно като факт), капнато.
// Ако агентът не е от нашия списък или няма памет — мълчи (exit 0, без изход).

import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HOOK_DIR = dirname(fileURLToPath(import.meta.url));
const PROJECT_DIR = process.env.CLAUDE_PROJECT_DIR || join(HOOK_DIR, "..", "..");
const MEM_DIR = join(PROJECT_DIR, ".claude", "agents", "_memory");
const MAX_LESSONS = 40; // капва инжекцията — паметта не бива да залива контекста

function readStdin() {
  try { return readFileSync(0, "utf8"); } catch { return ""; }
}

function verifiedSection(file) {
  const txt = readFileSync(file, "utf8");
  const lines = txt.split("\n");
  const start = lines.findIndex((l) => /^##\s*Проверени поуки/.test(l));
  if (start === -1) return [];
  const out = [];
  for (let i = start + 1; i < lines.length; i++) {
    if (/^##\s/.test(lines[i])) break; // следваща секция (напр. Карантина)
    if (lines[i].trim().startsWith("- ")) out.push(lines[i]);
  }
  return out;
}

function main() {
  let payload = {};
  try { payload = JSON.parse(readStdin()); } catch { /* ignore */ }
  const agent = payload.agent_type || payload.subagent_type || payload.agent_name || "";
  if (!agent) process.exit(0);
  const file = join(MEM_DIR, `${agent}.md`);
  if (!existsSync(file)) process.exit(0);

  const lessons = verifiedSection(file).slice(0, MAX_LESSONS);
  if (!lessons.length) process.exit(0);

  const context =
    `Проверена памет на „${agent}" (v6.0 самообучение — ползвай я, не повтаряй научена грешка):\n` +
    lessons.join("\n") +
    `\n\nНакрая на отговора си добави блок \`\`\`learn (виж _memory/PROTOCOL.md) само с НОВО проверено знание.`;

  process.stdout.write(JSON.stringify({
    hookSpecificOutput: { hookEventName: "SubagentStart", additionalContext: context },
  }));
  process.exit(0);
}

try { main(); } catch { process.exit(0); }
