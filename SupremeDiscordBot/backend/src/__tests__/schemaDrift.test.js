// backend/src/__tests__/schemaDrift.test.js
// Гейт срещу разминаване `schema.prisma` ↔ `prisma/migrations/*.sql`.
//
// ЗАЩО: Prisma смята СХЕМАТА за източник на истината. Индекс или таблица, които
// живеят само в SQL миграция, при първия `prisma migrate dev` се обявяват за
// дрейф и се ИЗТРИВАТ. Реално намерено на 07.08.2026:
//   • `tickets(channelId)` — най-горещият път на бота (тикет по канал при всяко
//     съобщение) щеше да стане пълно сканиране;
//   • `audit_logs(createdAt)`, `servers(trialEndsAt)` — същото;
//   • `express_sessions` — цялата таблица със сесиите, тоест всички влезли
//     потребители изхвърчат при рутинна миграция.
//
// Нищо от това не се вижда в код ревю и нищо не гърми при пускането — затова е
// гейт, не бележка.
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const PRISMA_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "prisma");
const schema = readFileSync(join(PRISMA_DIR, "schema.prisma"), "utf-8");

const sql = readdirSync(join(PRISMA_DIR, "migrations"), { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .sort((a, b) => a.name.localeCompare(b.name))
  .map((d) => {
    try {
      return readFileSync(join(PRISMA_DIR, "migrations", d.name, "migration.sql"), "utf-8");
    } catch {
      return "";
    }
  })
  .join("\n");

/** [{ model, table, indexes: [[col, ...], ...] }] */
function parseModels() {
  const out = [];
  for (const [, model, body] of schema.matchAll(/model (\w+) \{([\s\S]*?)\n\}/g)) {
    const mapped = body.match(/@@map\("([^"]+)"\)/);
    out.push({
      model,
      table: mapped ? mapped[1] : model,
      indexes: [...body.matchAll(/@@index\(\[([^\]]+)\]/g)].map((m) =>
        m[1].split(",").map((c) => c.trim()),
      ),
    });
  }
  return out;
}

/** Всяка CREATE (UNIQUE) INDEX в миграциите → "table:col,col". */
function sqlIndexKeys() {
  const keys = new Set();
  // `[\s\S]` заради многоредовите CREATE INDEX в по-старите миграции.
  const re = /CREATE\s+(?:UNIQUE\s+)?INDEX(?:\s+IF\s+NOT\s+EXISTS)?\s+"?[\w]+"?\s+ON\s+"(\w+)"\s*\(([\s\S]*?)\)/gi;
  for (const m of sql.matchAll(re)) {
    const cols = m[2].split(",").map((c) => c.trim().replace(/^"|"$/g, "").split(/\s+/)[0]);
    keys.add(`${m[1]}:${cols.join(",")}`);
  }
  return keys;
}

const models = parseModels();

describe("schema ↔ миграции", () => {
  it("всеки @@index има CREATE INDEX в миграциите", () => {
    const inSql = sqlIndexKeys();
    const missing = [];
    for (const { table, indexes } of models) {
      for (const cols of indexes) {
        const key = `${table}:${cols.join(",")}`;
        if (!inSql.has(key)) missing.push(key);
      }
    }
    expect(missing, `декларирани, но никога създадени: ${missing.join(" · ")}`).toEqual([]);
  });

  it("всяка таблица, създадена в миграциите, е известна на схемата", () => {
    // Обратната посока — тази, която трие. Таблица в SQL без модел значи
    // `prisma migrate dev` ще предложи DROP TABLE.
    const known = new Set(models.map((m) => m.table));
    const dropped = new Set(
      [...sql.matchAll(/DROP TABLE(?:\s+IF EXISTS)?\s+"(\w+)"/gi)].map((m) => m[1]),
    );
    const orphans = [...sql.matchAll(/CREATE TABLE(?:\s+IF NOT EXISTS)?\s+"(\w+)"/gi)]
      .map((m) => m[1])
      .filter((t) => !known.has(t) && !dropped.has(t));

    expect(orphans, `таблици без модел (Prisma би ги изтрила): ${orphans.join(" · ")}`).toEqual([]);
  });

  it("хранилището на сесиите е моделирано (иначе миграция изхвърля всички влезли)", () => {
    expect(schema).toMatch(/@@map\("express_sessions"\)/);
  });
});

describe("горещите пътища имат индекс", () => {
  const idx = (table) =>
    models.find((m) => m.table === table)?.indexes.map((c) => c.join(",")) ?? [];

  it("tickets(channelId) — ботът търси тикет по канал при всяко съобщение", () => {
    expect(idx("tickets")).toContain("channelId");
  });

  it("polls има индекси — моделът дълго време нямаше нито един", () => {
    expect(idx("polls").length).toBeGreaterThan(0);
  });

  it("servers(accessUntil) — метлата за изтекъл гратис сканира по него", () => {
    expect(idx("servers")).toContain("accessUntil");
  });

  // v46 (одит етап 11). Postgres НЕ индексира външните ключове сам, а тези три
  // колони се ползват от РЕАЛНИ заявки. Проверката е отделна от общата за дрейф:
  // тя пази ДВОЙКАТА схема↔миграция, но би останала зелена, ако някой махне
  // индекса и от двете места.
  it("audit_logs(actorId, targetId) — чл. 15 експортът търси и по двете", () => {
    // routes/gdpr.js: where: { OR: [{ actorId }, { targetId }] }
    // Без индекси това е пълно сканиране на таблицата, която расте с ВСЯКО
    // действие в продукта.
    expect(idx("audit_logs")).toContain("actorId");
    expect(idx("audit_logs")).toContain("targetId");
  });

  it("tickets(assigneeId) — изтриването на акаунт занулява през SET NULL", () => {
    expect(idx("tickets")).toContain("assigneeId");
  });
});
