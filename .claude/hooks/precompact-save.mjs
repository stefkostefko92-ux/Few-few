#!/usr/bin/env node
// precompact-save.mjs — PreCompact hook: „черна кутия" преди уплътняване на контекста.
// Уплътняването губи детайли (виждали сме го на живо). Този hook снима РАБОТНОТО състояние на
// репото в durable файл, за да може продължаващата сесия да се закотви за ФАКТИ, не за спомени:
// клон, незакомитнати файлове, последни комити (бърз, евтин срез).
//
// Два канала (19.11.2026, по https://code.claude.com/docs/en/hooks.md — „PreCompact output“ и matcher
// `compact` на SessionStart; досегашният коментар „stdout се добавя към контекста“ беше грешен):
//   • stdout на PreCompact (exit 0) = ИНСТРУКЦИЯ към обобщението на уплътняването, не контекст → тук казваме
//     какво обобщението да запази (цел, договор, решения, блокери, следваща стъпка), под 10 000 знака;
//   • снимката стига до модела след уплътняването през `session-restore.mjs` (SessionStart, matcher compact).
// Подагент, който уплътнява (2.1.323+: `agent_type` в payload-а), пише свой файл — не затрива снимката на
// главната сесия.
// Fail-open: всяка грешка → exit 0 (никога не блокираме уплътняване).

import { writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";
import { isMain } from "../../tools/lib/is-main.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const OUT_DIR = join(ROOT, ".claude", "hooks", "_state");

/** Файлът на снимката: главната сесия → compact-snapshot.md; подагент → compact-snapshot.<агент>.md. */
export function snapshotFile(agentType, dir = OUT_DIR) {
  const a = String(agentType || "").trim();
  return join(dir, /^[a-z0-9-]{1,40}$/.test(a) ? `compact-snapshot.${a}.md` : "compact-snapshot.md");
}

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

/** Инструкцията към обобщението (stdout на PreCompact). Кратка и стабилна — под 10 000 знака. */
export function summaryInstructions({ trigger = "", custom = "" } = {}) {
  return [
    "Обобщението трябва да запази дословно (не перифразирано):",
    "1. Последната заявка на собственика и всяко негово решение/правило в тази сесия, с цитат.",
    "2. Целта и договора на текущата задача (критерии за приемане, обхват, какво е изрично извън него).",
    "3. Какво е направено (клонове, комити, PR номера, file:line) и какво остава — като списък.",
    "4. Блокери, открити въпроси към човека и рисковете, които още не са затворени.",
    "5. Точната следваща стъпка и командата за нея.",
    "Работното състояние на репото е в .claude/hooks/_state/compact-snapshot.md — след уплътняването то се",
    "връща в контекста автоматично; не го преписвай в обобщението.",
    custom ? `Допълнителна инструкция от потребителя за това уплътняване: ${String(custom).slice(0, 2000)}` : "",
    trigger ? `(trigger: ${trigger})` : "",
  ].filter(Boolean).join("\n");
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
  writeFileSync(snapshotFile(payload.agent_type), snap + "\n");
  console.log(summaryInstructions({ trigger: payload.trigger, custom: payload.custom_instructions }));
}

if (isMain(import.meta.url)) { try { main(); } catch { /* fail-open */ } process.exit(0); }
