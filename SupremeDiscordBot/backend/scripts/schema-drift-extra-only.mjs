// backend/scripts/schema-drift-extra-only.mjs
// Чете изхода на `prisma migrate diff --from-url <живата база> --to-schema-datamodel`
// (stdin или файл) и казва дали разликата е САМО „в базата има таблици, които
// този код не познава“ (+ техните FK/индекси). Това е точно положението при
// връщане към по-стара версия след адитивна миграция: старият код не пипа новите
// таблици и работи. Всичко друго (липсваща/сменена колона, нова таблица, която
// кодът очаква) е истинско разминаване → fail-closed.
//
// Изход: 0 = само излишни таблици (безопасно), 1 = истинско разминаване.
// ЗАЩО (одит на VPS-аджията 25.09.2026, проверено срещу Postgres 16): rollback
// 3.5.0 → 3.4.0 спираше backend-а в цикъл от рестарти заради 13-те таблици на v50.
import { readFileSync } from "node:fs";

export function extraTablesOnly(text) {
  const lines = String(text).split("\n").map((l) => l.replace(/\s+$/, "")).filter(Boolean);
  const removed = new Set();
  let section = null;
  let current = null;
  for (const l of lines) {
    if (l === "[-] Removed tables") { section = "removed"; current = null; continue; }
    const changed = /^\[\*\] Changed the `([^`]+)` table$/.exec(l);
    if (changed) { section = "changed"; current = changed[1]; continue; }
    if (section === "removed" && /^ {2}- \S+$/.test(l)) { removed.add(l.trim().slice(2)); continue; }
    if (section === "changed" && current && removed.has(current)
        && /^ {2}\[-\] Removed (foreign key|index|unique index|primary key) on columns? \(.+\)$/.test(l)) continue;
    return { ok: false, reason: `неочакван ред: ${l}` };
  }
  if (!removed.size) return { ok: false, reason: "няма премахнати таблици — нещо друго се разминава" };
  return { ok: true, tables: [...removed] };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const text = readFileSync(process.argv[2] || 0, "utf8");
  const out = extraTablesOnly(text);
  if (out.ok) console.log(`[schema] само излишни таблици (${out.tables.length}): ${out.tables.join(", ")}`);
  else console.log(`[schema] ${out.reason}`);
  process.exit(out.ok ? 0 : 1);
}
