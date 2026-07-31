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
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { checkScope } from "../../tools/agents/scope-check.mjs";
import { validateHandoff, knownAgentIds } from "../../tools/agents/handoff.mjs";

const ROOT = process.env.CLAUDE_PROJECT_DIR || join(dirname(fileURLToPath(import.meta.url)), "..", "..");

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

// Съдържанието на tool_result записите, в РЕДА на появата им. Дотук хукът събираше само
// tool_use (име+вход), затова знаеше че гейтът е ПУСНАТ, но не и че е МИНАЛ — агент можеше да
// пусне гейта, той да падне червен, и DoD пак да каже „наред". Собствената ни доктрина е обратната:
// „готово" = гейтът е РЕАЛНО зелен, не „предполагам минава".
export function collectToolResults(jsonl) {
  const out = [];
  const text = (c) => {
    if (typeof c === "string") return c;
    if (Array.isArray(c)) return c.map(text).join("\n");
    if (c && typeof c === "object") return text(c.text ?? c.content ?? "");
    return "";
  };
  const walk = (o) => {
    if (!o || typeof o !== "object") return;
    if (Array.isArray(o)) { o.forEach(walk); return; }
    if (o.type === "tool_result") out.push(text(o.content));
    for (const v of Object.values(o)) walk(v);
  };
  for (const line of String(jsonl).split("\n")) {
    const t = line.trim();
    if (!t) continue;
    try { walk(JSON.parse(t)); } catch { /* skip непарсим ред */ }
  }
  return out;
}

// Маркери, които НАШИТЕ гейтове печатат само при зелено/червено. Near-zero-FP: гледаме точни низове,
// не „✗" (то се среща в легитимни одитни таблици). Броим ПОСЛЕДНОТО срещане на семейството —
// пуснал гейта, видял червено, поправил, пуснал пак зелено е ПРАВИЛНИЯТ поток и не бива да блокира.
const RESULT_MARKERS = [
  { name: "гейтът на агентския слой", green: /СТАТУС: гейтът е зелен/, red: /СТАТУС: ГЕЙТЪТ Е ЧЕРВЕН/ },
  { name: "надзорът над екипа (oversee)", green: /СТАТУС: екипът е здрав/, red: /СТАТУС: има твърди проблеми/ },
  { name: "тестовете", green: /^# fail 0$/m, red: /^# fail (?!0$)\d+$/m },
  // ВНИМАНИЕ (собствен FP, хванат от теста): първият вариант търсеше „изтекл" и съвпадаше със
  // ЗЕЛЕНИЯ ред „чисто — нула изтекли тайни". Маркерът трябва да е точният низ на провала
  // (`secret-scan: N възможни тайни`), не дума, която се среща и в успешното съобщение.
  { name: "secret-scan", green: /secret-scan: чисто/, red: /secret-scan: \d+ възможни тайни/ },
];

/** Гейт, чийто ПОСЛЕДЕН резултат в транскрипта е ЧЕРВЕН → работата не е „готова". */
export function checkFailedGates(results) {
  const bad = [];
  for (const m of RESULT_MARKERS) {
    let last = null;
    for (const r of results) {
      if (m.red.test(r)) last = "red";
      else if (m.green.test(r)) last = "green";
    }
    if (last === "red") bad.push(m.name);
  }
  if (!bad.length) return null;
  return {
    files: ["(край на отговора)"],
    gate: `последният резултат е ЧЕРВЕН за: ${bad.join(" · ")} — „готово" значи гейтът е РЕАЛНО зелен, не пуснат`,
  };
}

// Bash пренасочване към файл се брои за „писане" (red-team F3: `cat > x.lua` заобикаляше гейта).
// Хваща `> path`, `>> path`, `tee path`, heredoc `> path <<EOF`. Връща списък файлове.
export function bashWrites(bashCmds) {
  const out = [];
  const re = /(?:>>?|\btee(?:\s+-a)?)\s+["']?([^\s"'|;&<>]+)/g;
  for (const cmd of bashCmds) { let m; while ((m = re.exec(cmd))) out.push(m[1]); }
  return out;
}

// Последният текст на асистента в транскрипта = отговорът, с който агентът приключва. Той трябва да
// носи блока „ПРЕДАВАНЕ". Обхождаме JSONL-а отзад-напред и вземаме първия непразен assistant текст.
export function lastAssistantText(jsonl) {
  const lines = String(jsonl).split("\n").filter((l) => l.trim());
  for (let i = lines.length - 1; i >= 0; i--) {
    let o; try { o = JSON.parse(lines[i]); } catch { continue; }
    const msg = o.message || o;
    if (msg.role !== "assistant") continue;
    const c = msg.content;
    const txt = typeof c === "string" ? c
      : Array.isArray(c) ? c.filter((b) => b && b.type === "text").map((b) => b.text).join("\n")
      : "";
    if (txt.trim()) return txt;
  }
  return "";
}

// Договорът за колаборация (блокът ПРЕДАВАНЕ) — доктрината го изисква от ВСЕКИ агент, но досега
// нищо не го проверяваше: агент можеше да завърши със свободен текст и веригата тихо се късаше.
export function checkHandoffViolation(finalText, agentIds) {
  if (!String(finalText || "").trim()) return null; // няма изход за съдене → не заклещвай агента
  const r = validateHandoff(finalText, { agentIds });
  if (r.ok) return null;
  return {
    files: ["(край на отговора)"],
    gate: `договорът ПРЕДАВАНЕ е нарушен — ${r.problems.map((p) => `[${p.field}] ${p.msg}`).join(" · ")}`,
  };
}

// Чиста логика — тестваема: {violations:[{file, gate}]}. `root` за релативизиране на абсолютни пътища (F1).
export function checkDoD(uses, root) {
  const bashCmds = uses.filter((u) => u.name === "Bash").map((u) => String(u.input.command || ""));
  const bash = bashCmds.join("\n");
  const written = [
    ...uses.filter((u) => u.name === "Write" || u.name === "Edit").map((u) => String(u.input.file_path || "")),
    ...bashWrites(bashCmds), // F3: и Bash-записите
  ].filter(Boolean);
  const violations = [];
  for (const r of RULES) {
    const hits = written.filter((f) => r.wrote.test(f));
    if (hits.length && !r.mustRun.test(bash)) violations.push({ files: [...new Set(hits)], gate: r.gate });
  }
  // Монорепо закон №1: писане в ≥2 продуктови папки в една задача = scope creep. (root → F1 фикс)
  const scope = checkScope(written, root);
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
  const violations = checkDoD(collectToolUses(jsonl), ROOT);
  const hv = checkHandoffViolation(lastAssistantText(jsonl), knownAgentIds(join(ROOT, ".claude", "agents")));
  if (hv) violations.push(hv);
  // Гейт, ПУСНАТ но ЧЕРВЕН, дотук минаваше за изпълнен ангажимент. Отделен вид нарушение,
  // защото инструкцията е различна: не „пусни гейта", а „поправи го, той е червен".
  const fg = checkFailedGates(collectToolResults(jsonl));
  if (fg) violations.push({ ...fg, kind: "failed" });
  if (!violations.length) process.exit(0);
  const msg = violations.map((v) => v.kind === "failed"
    ? `DoD НЕ е изпълнен: ${v.gate}. Поправи причината и пусни отново, преди да приключиш.`
    : `DoD гейт НЕ е пуснат: писа ${v.files.join(", ")} без да пуснеш „${v.gate}". Пусни гейта сега и поправи HIGH находките, преди да приключиш.`).join("\n");
  if (payload.stop_hook_active) { console.log(`⚠ dod-check (advisory, без повторно връщане): ${msg}`); process.exit(0); }
  console.error(msg);
  process.exit(2); // харнесът връща агента с инструкцията
}

if (import.meta.url === `file://${process.argv[1]}`) { try { main(); } catch { process.exit(0); } }
