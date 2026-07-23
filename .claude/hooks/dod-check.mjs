#!/usr/bin/env node
// dod-check.mjs — SubagentStop гейт: „обещаното е наложено". Дефинициите казват „пусни гейта X преди
// доставка" — този hook ПРОВЕРЯВА, че агентът реално го е пуснал. Правилата са ФАЙЛ-базирани (не
// per-agent): който е писал .lua ресурс, дължи manifest-lint — независимо кой агент е бил.
//
// Механика: чете транскрипта на субагента, събира Write/Edit файлове + Bash команди. Ако е писан файл
// от клас с задължителен гейт, а гейтът липсва в командите → exit 2 (харнесът връща агента с
// инструкцията да го пусне). Щит срещу цикъл: при stop_hook_active → exit 0 (само предупреждение).
// Fail-open: всяка грешка на hook-а → exit 0 (никога не заклещваме агент заради счупен hook).

import { readFileSync } from "node:fs";
import { checkScope } from "../../tools/agents/scope-check.mjs";

// Правила: писан файл match-ва `wrote` → в Bash командите трябва да се появи `mustRun`.
const RULES = [
  { wrote: /\.lua$/i, mustRun: /manifest-lint\.mjs/, gate: "node tools/fivem/manifest-lint.mjs <папка-на-ресурса>" },
  { wrote: /(^|\/)deploy\/[^/]*\.sh$|autodeploy\.sh$/i, mustRun: /deploy-check\.mjs/, gate: "node tools/vps/deploy-check.mjs <файл>" },
  { wrote: /(^|\/)prisma\/seed-[^/]+\.ts$/i, mustRun: /check-dups\.mjs/, gate: "node tools/seed/check-dups.mjs (от корена)" },
  { wrote: /(^|\/)\.github\/workflows\/[^/]+\.ya?ml$/i, mustRun: /workflow-audit\.mjs/, gate: "node tools/ci/workflow-audit.mjs" },
  { wrote: /(^|\/)\.claude\/(agents|skills)\/[^_][^/]*\.md$/i, mustRun: /oversee\.mjs|lint\.mjs/, gate: "node tools/agents/oversee.mjs (или tools/skills/lint.mjs за skill)" },
];

function readStdin() {
  try { return readFileSync(0, "utf8"); } catch { return ""; }
}

// Обходи транскрипта (JSONL) и събери tool_use записите {name, input}.
export function collectToolUses(jsonl) {
  const uses = [];
  const walk = (o) => {
    if (!o || typeof o !== "object") return;
    if (Array.isArray(o)) { o.forEach(walk); return; }
    if (o.type === "tool_use" && o.name) uses.push({ name: o.name, input: o.input || {} });
    for (const v of Object.values(o)) walk(v);
  };
  for (const line of String(jsonl).split("\n")) {
    const t = line.trim();
    if (!t) continue;
    try { walk(JSON.parse(t)); } catch { /* skip непарсим ред */ }
  }
  return uses;
}

// Чиста логика — тестваема: {violations:[{file, gate}]}.
export function checkDoD(uses) {
  const written = uses.filter((u) => u.name === "Write" || u.name === "Edit").map((u) => String(u.input.file_path || ""));
  const bash = uses.filter((u) => u.name === "Bash").map((u) => String(u.input.command || "")).join("\n");
  const violations = [];
  for (const r of RULES) {
    const hits = written.filter((f) => r.wrote.test(f));
    if (hits.length && !r.mustRun.test(bash)) violations.push({ files: [...new Set(hits)], gate: r.gate });
  }
  // Монорепо закон №1: писане в ≥2 продуктови папки в една задача = scope creep.
  const scope = checkScope(written);
  if (!scope.ok) violations.push({ files: scope.products, gate: `СПРИ — пишеш в ${scope.products.length} продукта (${scope.products.join(", ")}). Един продукт на промяна; останалото е отделна задача/клон` });
  return violations;
}

function main() {
  let payload = {};
  try { payload = JSON.parse(readStdin()); } catch { process.exit(0); }
  const tPath = payload.agent_transcript_path || payload.transcript_path || "";
  if (!tPath) process.exit(0);
  let jsonl = "";
  try { jsonl = readFileSync(tPath, "utf8"); } catch { process.exit(0); }
  const violations = checkDoD(collectToolUses(jsonl));
  if (!violations.length) process.exit(0);
  const msg = violations.map((v) => `DoD гейт НЕ е пуснат: писа ${v.files.join(", ")} без да пуснеш „${v.gate}". Пусни гейта сега и поправи HIGH находките, преди да приключиш.`).join("\n");
  if (payload.stop_hook_active) { console.log(`⚠ dod-check (advisory, без повторно връщане): ${msg}`); process.exit(0); }
  console.error(msg);
  process.exit(2); // харнесът връща агента с инструкцията
}

if (import.meta.url === `file://${process.argv[1]}`) { try { main(); } catch { process.exit(0); } }
