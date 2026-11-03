#!/usr/bin/env node
// consistency-audit.mjs — zero-defect гейт за паметите на флота.
// Държавно ниво = грешка/противоречие не оцелява тихо в „Проверени поуки".
// Сканира всяка _memory/<id>.md и хваща:
//   • unresolved_conflict — verified поука, която САМИЯТ агент е маркирал като
//       противоречие/несигурност (противоречи, за досверяване, да потвърди, конфликт…).
//       Такава поука НЕ е уреден факт — трябва разрешаване (човек/агент), не тихо да стои.
//   • sourceless_verified — verified БЕЗ реален източник (URL / file:line / нормативен акт).
//       Това е integrity leak (hook-ът трябва да го спира) → --check се проваля.
// Zero-dep, fail-closed. В CI (agents.yml). Тестове: consistency-audit.test.mjs.
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const MEM_DIR = join(HERE, "..", "..", ".claude", "agents", "_memory");

// ТОЧЕН маркер, че поуката е ЯВНО обявена за неуредена от самия агент (не просто описва
// разлика/дисперсия като предмет). Целим само истински „това противоречи / трябва човек /
// за досверяване", не факти, които СЪДЪРЖАТ думата „разминава/differs". Прецизност > обхват.
const CONFLICT =
  /против[оа]речи\s+на\s+(?:стар|по-стар|предиш|предход|записан|записа|мо[йя]|_memory)|против[оа]речие[^.]{0,60}?(?:човек\s+да|да\s+потвърди|за\s+проверка|за\s+досверяване)|за\s+досверяване|човек\s+да\s+(?:потвърди|реши|провери)\s+(?:преди|дали|точ|за\b)|за\s+проверка\s+при\s+следваща|needs?\s+re-?verif|to\s+be\s+re-?verif|КОРЕКЦИЯ\s+на\s+пред(?:ишен|ходен|ишна)|човек\s+да\s+реши\s+curate/i;
// Истински integrity leak = ПРАЗЕН източник на verified поука (нула цитат). Форматът на
// НЕпразните източници се владее от hook-а (memory-capture → sourceIsReal) при запис —
// одиторът НЕ го пре-съди (иначе фалшиви положителни по историческо/seed знание).
const EMPTY_SOURCE = (src) => !String(src || "").trim() || /^\(?празен/i.test(String(src).trim());

// Извлича последния `_( … )_` мета-блок от булет ред и връща {scope, conf, source, text}.
export function parseLesson(line) {
  const m = line.match(/^\s*-\s+\*\*(.+?):\*\*\s*([\s\S]*?)\s*_\((.*)\)_\s*$/);
  if (!m) return null;
  const text = m[2].trim();
  // meta = scope; confidence; source  (кавичките варират: " „ " ')
  const parts = m[3].split(";");
  const strip = (s) => (s || "").trim().replace(/^["'„“”]+|["'„“”]+$/g, "").trim();
  return { date: m[1].trim(), text, scope: strip(parts[0]), conf: strip(parts[1]).toLowerCase(), source: strip(parts.slice(2).join(";")) };
}

// Връща булетите под дадено heading (до следващ ## ).
export function verifiedBullets(md) {
  const lines = md.split("\n");
  const out = [];
  let inSec = false;
  for (const ln of lines) {
    if (/^##\s/.test(ln)) { inSec = /verified|Проверени поуки/i.test(ln); continue; }
    if (inSec && /^\s*-\s+\*\*/.test(ln)) out.push(ln);
  }
  return out;
}

export function auditText(md, id) {
  const findings = [];
  for (const line of verifiedBullets(md)) {
    const les = parseLesson(line);
    if (!les) continue;
    if (les.conf !== "verified") continue; // само verified раздел; други секции = карантина
    if (CONFLICT.test(les.text) || CONFLICT.test(les.scope))
      findings.push({ id, kind: "unresolved_conflict", scope: les.scope, snippet: les.text.slice(0, 150) });
    if (EMPTY_SOURCE(les.source))
      findings.push({ id, kind: "empty_source", scope: les.scope, snippet: les.text.slice(0, 100) });
  }
  return findings;
}

export function auditAll(dir = MEM_DIR) {
  const files = readdirSync(dir).filter((f) => f.endsWith(".md") && !/^_|PROTOCOL|SECURITY|SHARED/i.test(f));
  let all = [];
  for (const f of files) all = all.concat(auditText(readFileSync(join(dir, f), "utf8"), f.replace(/\.md$/, "")));
  return all;
}

// CLI
if (import.meta.url === `file://${process.argv[1]}`) {
  const check = process.argv.includes("--check");
  const all = auditAll();
  const leaks = all.filter((f) => f.kind === "empty_source");
  const conflicts = all.filter((f) => f.kind === "unresolved_conflict");
  const byId = {};
  for (const f of conflicts) (byId[f.id] ||= []).push(f);

  if (conflicts.length) {
    console.log(`\n▲ Неразрешени противоречия/несигурност в „Проверени поуки" (${conflicts.length}):`);
    for (const id of Object.keys(byId).sort())
      byId[id].forEach((f) => console.log(`  • ${id} [${f.scope}] — ${f.snippet}…`));
    console.log("  → разреши: агентът да сверя на живо и да остави ЕДНА уредена формулировка (или премести в Карантина).");
  }
  if (leaks.length) {
    console.log(`\n✗ verified БЕЗ реален източник (${leaks.length}) — integrity leak:`);
    leaks.forEach((f) => console.log(`  • ${f.id} [${f.scope}] — ${f.snippet}`));
  }
  console.log(`\nИтог: ${leaks.length} sourceless-verified (твърд) · ${conflicts.length} противоречия (съвет).`);
  if (!conflicts.length && !leaks.length) console.log("✓ Чисто — нула противоречия, нула безизточникови verified поуки.");
  if (check && leaks.length) process.exit(1);
}
