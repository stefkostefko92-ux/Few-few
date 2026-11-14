// Обновяване на базата при старт — заявките към SQLite. Логиката е в ./schema-upgrade.ts.

import type { PrismaClient } from "@prisma/client";
import { SCHEMA_SQL } from "./schema-sql.generated";
import { parseSchemaSql, planUpgrade, type ExistingSchema } from "./schema-upgrade";

async function readExisting(db: PrismaClient): Promise<ExistingSchema> {
  const rows = (await db.$queryRawUnsafe(
    `SELECT name, type FROM sqlite_master WHERE type IN ('table','index') AND name NOT LIKE 'sqlite_%'`
  )) as Array<{ name: string; type: string }>;
  const tables = new Map<string, Set<string>>();
  const indexes = new Set<string>();
  for (const r of rows) {
    if (r.type === "index") {
      indexes.add(r.name);
      continue;
    }
    const cols = (await db.$queryRawUnsafe(`PRAGMA table_info("${r.name.replace(/"/g, '""')}")`)) as Array<{ name: string }>;
    tables.set(r.name, new Set(cols.map((c) => c.name)));
  }
  return { tables, indexes };
}

/**
 * Довежда базата до схемата на текущата версия, само с добавяне. При колона, която не може да
 * се добави безопасно, хвърля грешка и НЕ прилага нищо — касата не тръгва с половин схема.
 */
export async function upgradeSchema(db: PrismaClient): Promise<{ applied: string[] }> {
  const plan = planUpgrade(parseSchemaSql(SCHEMA_SQL), await readExisting(db));
  if (plan.problems.length > 0) {
    throw new Error(`Базата не може да се обнови автоматично до тази версия:\n${plan.problems.join("\n")}`);
  }
  if (plan.statements.length === 0) return { applied: [] };
  await db.$transaction(plan.statements.map((sql) => db.$executeRawUnsafe(sql)));
  return { applied: plan.statements };
}
