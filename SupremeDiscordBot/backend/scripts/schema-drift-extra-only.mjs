// backend/scripts/schema-drift-extra-only.mjs
// Чете изхода на `prisma migrate diff --from-url <живата база> --to-schema-datamodel`
// (stdin или файл) и казва дали разликата е САМО „в базата има таблици, които
// този код не познава“ (+ техните FK/индекси). Това е точно положението при
// връщане към по-стара версия след адитивна миграция: старият код не пипа новите
// таблици и работи. Всичко друго (липсваща/сменена колона, нова таблица, която
// кодът очаква) е истинско разминаване → fail-closed.
//
// Изход: 0 = само излишни таблици/колони (безопасно), 1 = истинско разминаване.
// ЗАЩО (одит на VPS-аджията 25.09.2026, проверено срещу Postgres 16): rollback
// 3.5.0 → 3.4.0 спираше backend-а в цикъл от рестарти заради 13-те таблици на v50.
import { readFileSync } from "node:fs";

export function extraTablesOnly(text) {
  const lines = String(text).split("\n").map((l) => l.replace(/\s+$/, "")).filter(Boolean);
  const removed = new Set();
  // v51 (26.09.2026): адитивна миграция може да добави и КОЛОНИ към стари
  // таблици (v51: users.adminNote…, servers.customBotPausedAt). При rollback те
  // са излишни за стария код — безопасни САМО ако могат да са празни или имат
  // подразбиране (иначе старият INSERT пада на NOT NULL). Текстът на diff-а
  // това не казва → колоните се връщат тук и CLI-то ги сверява с базата.
  const columns = [];
  let section = null;
  let current = null;
  for (const l of lines) {
    if (l === "[-] Removed tables") { section = "removed"; current = null; continue; }
    const changed = /^\[\*\] Changed the `([^`]+)` table$/.exec(l);
    if (changed) { section = "changed"; current = changed[1]; continue; }
    if (section === "removed" && /^ {2}- \S+$/.test(l)) { removed.add(l.trim().slice(2)); continue; }
    if (section === "changed" && current && removed.has(current)
        && /^ {2}\[-\] Removed (foreign key|index|unique index|primary key) on columns? \(.+\)$/.test(l)) continue;
    const col = /^ {2}\[-\] Removed column `([^`]+)`$/.exec(l);
    if (section === "changed" && current && !removed.has(current) && col) { columns.push({ table: current, column: col[1] }); continue; }
    return { ok: false, reason: `неочакван ред: ${l}` };
  }
  if (!removed.size && !columns.length) return { ok: false, reason: "няма излишни таблици или колони — нещо друго се разминава" };
  return { ok: true, tables: [...removed], columns };
}

/**
 * Излишните колони са безопасни за стария код само ако са nullable или имат
 * DEFAULT. `query(table, column)` връща { is_nullable, column_default } от
 * information_schema (инжектира се — тестовете не искат база). Fail-closed:
 * непозната колона или грешка в заявката = НЕ е безопасно.
 */
export async function extraColumnsSafe(columns, query) {
  for (const { table, column } of columns) {
    let row;
    try { row = await query(table, column); } catch { return { ok: false, reason: `не успях да проверя ${table}.${column}` }; }
    if (!row) return { ok: false, reason: `колоната ${table}.${column} не е намерена` };
    if (row.is_nullable !== "YES" && row.column_default == null) {
      return { ok: false, reason: `${table}.${column} е NOT NULL без подразбиране — старият код не може да създава редове` };
    }
  }
  return { ok: true };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const text = readFileSync(process.argv[2] || 0, "utf8");
  const out = extraTablesOnly(text);
  if (!out.ok) { console.log(`[schema] ${out.reason}`); process.exit(1); }
  if (out.columns.length) {
    const { PrismaClient } = await import("@prisma/client");
    const prisma = new PrismaClient();
    const safe = await extraColumnsSafe(out.columns, async (table, column) => {
      const rows = await prisma.$queryRaw`SELECT is_nullable, column_default FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = ${table} AND column_name = ${column}`;
      return rows[0] || null;
    }).finally(() => prisma.$disconnect());
    if (!safe.ok) { console.log(`[schema] ${safe.reason}`); process.exit(1); }
  }
  const parts = [];
  if (out.tables.length) parts.push(`таблици (${out.tables.length}): ${out.tables.join(", ")}`);
  if (out.columns.length) parts.push(`колони (${out.columns.length}): ${out.columns.map((c) => `${c.table}.${c.column}`).join(", ")}`);
  console.log(`[schema] само излишни ${parts.join("; ")}`);
  process.exit(0);
}
