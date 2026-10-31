#!/usr/bin/env node
// rescope.mjs — единственият път за смяна на ОБХВАТА на проверена поука (31.10.2026).
//
// Защо. Поуката се извлича по задачата, а обхватът („кога важи“) е най-силният ѝ ключ. 1234 от 6076
// проверени поуки имаха общ обхват — само продуктът, името на агента, „global“ или празно
// (`tools/lib/lesson-scope.mjs`). Такъв обхват не казва ситуацията и поуката се губи сред всички
// останали от домейна. Новите поуки вече не минават с общ обхват (memory-capture); този инструмент
// поправя старите.
//
// ГЛАВНОТО СВОЙСТВО ЗА БЕЗОПАСНОСТ (като promote.mjs): текстът, увереността и източникът идват от
// ФАЙЛА. Агентът дава само нов обхват за поука, чийто обхват е общ. Конкретен обхват не се
// презаписва; нов обхват, който пак е общ, носи „;“ или „_(“/„)_“ (чупи мета-опашката), прилича на
// тайна или на инструкция, се отказва. Поуките в Карантината не се пипат.
//
//   node tools/memory/rescope.mjs --list --agent <id> [--json]       # поуките с общ обхват
//   node tools/memory/rescope.mjs --agent <id> --scopes <файл.json>   # dry-run
//   node tools/memory/rescope.mjs --agent <id> --scopes <файл.json> --write
// Вход: [{ "lid": "1a2b3c4d", "scope": "upsert в seed скрипт по уникален ключ" }]
// Отказаните се изреждат с причина и не спират приложимите; изход 1, ако има отказан.
// Папката с паметта: CURATE_MEM_DIR (по подразбиране .claude/agents/_memory) — вълната работи в
// копие на клона agents/memory, никога в клона на задачата.

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { lessonId } from "./quarantine-review.mjs";
import { genericScope } from "../lib/lesson-scope.mjs";
import { looksSecret, looksInjection } from "../../.claude/hooks/memory-capture.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const MEM_DIR = process.env.CURATE_MEM_DIR || join(ROOT, ".claude", "agents", "_memory");
export const MIN_SCOPE = 6, MAX_SCOPE = 160;

/** Блоковете (поука + продължения) в „## Проверени поуки“: { i, end, block }. */
function verifiedBlocks(lines) {
  const start = lines.findIndex((l) => /^##\s*Проверени поуки/.test(l));
  if (start === -1) return [];
  let stop = lines.length;
  for (let k = start + 1; k < lines.length; k++) if (/^##\s/.test(lines[k])) { stop = k; break; }
  const out = [];
  for (let i = start + 1; i < stop; i++) {
    if (!lines[i].trim().startsWith("- ")) continue;
    let end = i;
    while (end + 1 < stop && lines[end + 1].trim() !== "" && !lines[end + 1].trim().startsWith("- ")) end++;
    out.push({ i, end, block: lines.slice(i, end + 1).map((l) => l.trim()).join(" ") });
    i = end;
  }
  return out;
}

/** Мета-опашката е ПОСЛЕДНОТО `_(…)_` на последния ред на блока; текстът може сам да носи `_(`. */
function tailOf(line) {
  const s = line.trimEnd();
  const at = s.lastIndexOf("_(");
  if (at === -1 || !s.endsWith(")_")) return null;
  const inner = s.slice(at + 2, -2);
  const semi = inner.indexOf(";");
  if (semi === -1) return null;
  return { at, inner, scope: inner.slice(0, semi).trim(), rest: inner.slice(semi) };
}

const textOf = (block) => {
  const s = block.replace(/^-\s+\*\*[^*]*\*\*\s*/, "");
  const at = s.lastIndexOf("_(");
  return (at === -1 ? s : s.slice(0, at)).trim();
};

/** Проверените поуки с общ обхват: [{ lid, scope, why, text }]. */
export function genericLessons(md, agent = "") {
  const lines = String(md).split("\n");
  const out = [];
  for (const b of verifiedBlocks(lines)) {
    const t = tailOf(lines[b.end]);
    if (!t) continue;
    const why = genericScope(t.scope, agent);
    if (why) out.push({ lid: lessonId(b.block), scope: t.scope, why, text: textOf(b.block) });
  }
  return out;
}

/** Причина за отказ на новия обхват, или null. */
export function badScope(scope, agent = "") {
  const s = String(scope ?? "").trim().replace(/^["„“'`]+|["„“'`]+$/g, "").trim();
  if (s.length < MIN_SCOPE) return `под ${MIN_SCOPE} знака`;
  if (s.length > MAX_SCOPE) return `над ${MAX_SCOPE} знака`;
  if (/[;\r\n]/.test(s) || s.includes("_(") || s.includes(")_")) return "„;“, нов ред или „_(“/„)_“ чупят мета-опашката";
  const why = genericScope(s, agent);
  if (why) return `пак общ обхват (${why})`;
  if (looksSecret(s)) return "прилича на тайна";
  if (looksInjection(s)) return "прилича на инструкция (инжекция)";
  return null;
}

/** Чиста функция: текст → { md, applied, rejected }. */
export function applyScopes(md, agent, entries) {
  const lines = String(md).split("\n");
  const byLid = new Map(verifiedBlocks(lines).map((b) => [lessonId(b.block), b]));
  const applied = [], rejected = [], seen = new Set();
  for (const e of Array.isArray(entries) ? entries : []) {
    const lid = String(e?.lid ?? "").trim();
    const reject = (reason) => rejected.push({ lid, scope: e?.scope, reason });
    if (seen.has(lid)) { reject("повторен lid"); continue; }
    seen.add(lid);
    const b = byLid.get(lid);
    if (!b) { reject("няма такава проверена поука"); continue; }
    const t = tailOf(lines[b.end]);
    if (!t) { reject("поуката няма мета-опашка"); continue; }
    if (!genericScope(t.scope, agent)) { reject(`обхватът вече е конкретен („${t.scope}“)`); continue; }
    const bad = badScope(e.scope, agent);
    if (bad) { reject(bad); continue; }
    const scope = String(e.scope).trim().replace(/^["„“'`]+|["„“'`]+$/g, "").trim();
    const line = lines[b.end].trimEnd();
    lines[b.end] = `${line.slice(0, t.at)}_(${scope}${t.rest})_`;
    applied.push({ lid, from: t.scope, to: scope });
  }
  return { md: lines.join("\n"), applied, rejected };
}

function main() {
  const argv = process.argv.slice(2);
  const arg = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : null; };
  const agent = arg("--agent");
  if (!agent || !/^[a-z0-9-]+$/.test(agent)) { console.error("употреба: rescope.mjs --list --agent <id> [--json] | --agent <id> --scopes <файл.json> [--write]"); process.exit(2); }
  const file = join(MEM_DIR, `${agent}.md`);
  if (!existsSync(file)) { console.error(`няма памет за „${agent}“ в ${MEM_DIR}`); process.exit(2); }
  const md = readFileSync(file, "utf8");

  if (argv.includes("--list")) {
    const g = genericLessons(md, agent);
    if (argv.includes("--json")) { process.stdout.write(JSON.stringify(g, null, 2) + "\n"); return; }
    console.log(`${agent}: ${g.length} проверени поуки с общ обхват`);
    for (const x of g) console.log(`  ${x.lid} · „${x.scope}“ (${x.why}) · ${x.text.slice(0, 110)}`);
    return;
  }

  const sf = arg("--scopes");
  if (!sf || !existsSync(sf)) { console.error(`няма файл с обхвати: ${sf}`); process.exit(2); }
  let entries;
  try { entries = JSON.parse(readFileSync(sf, "utf8")); } catch (e) { console.error(`обхватите не се парсват: ${e.message}`); process.exit(2); }
  const r = applyScopes(md, agent, entries);
  const write = argv.includes("--write");
  console.log(`${agent}: ${r.applied.length} с нов обхват · ${r.rejected.length} отказани${write ? "" : "  [dry-run]"}`);
  for (const x of r.rejected) console.log(`  ✗ ${x.lid} „${String(x.scope ?? "").slice(0, 80)}“ — ${x.reason}`);
  if (write && r.applied.length) writeFileSync(file, r.md);
  if (r.rejected.length) process.exit(1);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
