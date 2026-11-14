// Защита на данните на ниво база (Прил. № 29, т. 13 и т. 4): тригери в SQLite, които отказват
// изтриване на записи за продажби, анулирания, складови движения и одиторския дневник, и
// промяна на приключени записи. Prisma схемата не описва тригери, затова се поставят при
// първата заявка на процеса (идемпотентно — CREATE TRIGGER IF NOT EXISTS).

import { prisma } from "./db";
import { upgradeSchema } from "./schema-upgrade-db";

/** Таблици, от които не се изтрива нищо. */
const NO_DELETE = [
  "Sale",
  "SaleItem",
  "SaleDraft",
  "CancelledItem",
  "Invoice",
  "Shift",
  "CashMovement",
  "StockMovement",
  "UserRoleGrant",
  "AuditLog",
] as const;

/** Таблици, чиито записи не се променят след създаване. */
const NO_UPDATE = ["Sale", "SaleItem", "CancelledItem", "Invoice", "CashMovement", "StockMovement", "AuditLog"] as const;

function triggerSql(table: string, op: "DELETE" | "UPDATE"): string {
  const name = `supto_no_${op.toLowerCase()}_${table}`;
  const verb = op === "DELETE" ? "изтриване" : "промяна";
  return `CREATE TRIGGER IF NOT EXISTS "${name}" BEFORE ${op} ON "${table}"
BEGIN
  SELECT RAISE(ABORT, 'СУПТО (SUPTO): ${verb} на записи в ${table} е забранено (Прил. № 29, т. 13)');
END;`;
}

export const GUARD_STATEMENTS: string[] = [
  ...NO_DELETE.map((t) => triggerSql(t, "DELETE")),
  ...NO_UPDATE.map((t) => triggerSql(t, "UPDATE")),
];

let installing: Promise<void> | null = null;

/**
 * Веднъж на процес, преди първата заявка: обновява базата до схемата на версията (само добавяне,
 * виж schema-upgrade.ts) и поставя тригерите. Грешка не се кешира — следващата заявка опитва пак.
 */
export function ensureDbGuards(): Promise<void> {
  if (!installing) {
    installing = (async () => {
      const { applied } = await upgradeSchema(prisma);
      if (applied.length > 0) console.info(`[cspos] базата е обновена: ${applied.length} промени (само добавяне)`);
      for (const sql of GUARD_STATEMENTS) await prisma.$executeRawUnsafe(sql);
    })().catch((e) => {
      installing = null;
      throw e;
    });
  }
  return installing;
}
