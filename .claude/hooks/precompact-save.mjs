#!/usr/bin/env node
// precompact-save.mjs — PreCompact hook: „черна кутия" преди уплътняване на контекста.
// Уплътняването губи детайли (виждали сме го на живо). Този hook снима РАБОТНОТО състояние на
// репото в durable файл, за да може продължаващата сесия да се закотви за ФАКТИ, не за спомени:
// клон, незакомитнати файлове, последни комити, статус на гейтовете (бърз, евтин срез).
// Fail-open: всяка грешка → exit 0 (никога не блокираме уплътняване).

import { writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const OUT_DIR = join(ROOT, ".claude", "hooks", "_state");
const OUT = join(OUT_DIR, "compact-snapshot.md");

const sh = (cmd) => { try { return execSync(cmd, { cwd: ROOT, encoding: "utf8", timeout: 5000 }).trim(); } catch { return "(недостъпно)"; } };

// Чиста сглобка — тестваема.
export function buildSnapshot({ branch, status, log, when }) {
  return [
    `# Снимка преди уплътняване · ${when}`,
    ``,
    `Продължаваща сесийо: закотви се за тези ФАКТИ (не за спомени от уплътнението).`,
    ``,
    `- **Клон:** ${branch}`,
    `- **Незакомитнато:** ${status ? "\n\`\`\`\n" + status + "\n\`\`\`" : "чисто дърво"}`,
    `- **Последни комити:**`,
    "```",
    log,
    "```",
    ``,
    `Провери гейта преди „готово": oversee · eval --check · drift-lint · token-budget · secret-scan · тестове.`,
  ].join("\n");
}

function main() {
  let payload = {};
  try { payload = JSON.parse(readFileSync(0, "utf8")); } catch { /* fail-open */ }
  const snap = buildSnapshot({
    branch: sh("git branch --show-current"),
    status: sh("git status --short"),
    log: sh("git log --oneline -5"),
    when: new Date().toISOString(),
  });
  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(OUT, snap + "\n");
  // stdout при exit 0 се добавя към контекста → кажи на модела КЪДЕ е снимката.
  console.log(`PreCompact: работното състояние е запазено в .claude/hooks/_state/compact-snapshot.md (клон, незакомитнато, комити) — прочети го след уплътняване, ако губиш нишката.${payload.trigger ? ` (trigger: ${payload.trigger})` : ""}`);
}

if (import.meta.url === `file://${process.argv[1]}`) { try { main(); } catch { /* fail-open */ } process.exit(0); }
