// template.db.test.ts — шаблонната база за инсталатора (КП-П.1) и обновяването на стара база
// при нова версия. С истинска временна SQLite база.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const dir = mkdtempSync(join(tmpdir(), "cspos-tpl-"));
const upgradeUrl = `file:${join(dir, "old.db")}`;
const templateUrl = `file:${join(dir, "template.db")}`;
process.env.DATABASE_URL = upgradeUrl;

after(() => rmSync(dir, { recursive: true, force: true }));

before(() => {
  execFileSync("npx", ["prisma", "db", "push", "--skip-generate", "--accept-data-loss"], {
    cwd: root,
    env: { ...process.env, DATABASE_URL: templateUrl },
    stdio: "ignore",
  });
  execFileSync("npx", ["tsx", "prisma/seed-template.ts"], {
    cwd: root,
    env: { ...process.env, DATABASE_URL: templateUrl },
    stdio: "ignore",
  });
});

test("КП-П.1: шаблонът е без демо стоки, клиенти, продажби и без демо ПИН", async () => {
  const { PrismaClient } = await import("@prisma/client");
  const bcrypt = (await import("bcryptjs")).default;
  const db = new PrismaClient({ datasources: { db: { url: templateUrl } } });
  try {
    const users = await db.user.findMany({ orderBy: { operatorCode: "asc" } });
    assert.deepEqual(users.map((u) => u.operatorCode), [1, 99]);
    assert.ok(users.every((u) => u.mustChangePin), "всички сменят ПИН при първи вход");
    const auditor = users.find((u) => u.operatorCode === 99)!;
    assert.equal(auditor.readOnly, true);
    for (const u of users) {
      for (const demo of ["9999", "5555", "1111", "2929"]) {
        assert.equal(await bcrypt.compare(demo, u.pinHash), false, `демо ПИН ${demo} у ${u.operatorCode}`);
      }
    }
    // начален ПИН само на администратора (описан в ръководството); одиторът няма известен ПИН
    assert.equal(await bcrypt.compare("0000", users[0]!.pinHash), true);
    assert.equal(await bcrypt.compare("0000", auditor.pinHash), false);
    // т. 6 и т. 19: период на ролята
    assert.equal(await db.userRoleGrant.count({ where: { validTo: null } }), 2);

    const products = await db.product.findMany();
    assert.ok(products.length > 0 && products.every((p) => p.name.startsWith("Свободна продажба")), "само свободна продажба");
    assert.equal(await db.customer.count(), 0);
    assert.equal(await db.supplier.count(), 0);
    assert.equal(await db.promotion.count(), 0);
    assert.equal(await db.sale.count(), 0);
    assert.equal(await db.barcode.count(), 0);
  } finally {
    await db.$disconnect();
  }
});

test("обновяване: стара база получава новите таблица, колона и индекс, данните остават", async () => {
  const { SCHEMA_SQL } = await import("../schema-sql.generated");
  const { parseSchemaSql } = await import("../schema-upgrade");
  const { prisma } = await import("../db");
  const { upgradeSchema } = await import("../schema-upgrade-db");
  const parsed = parseSchemaSql(SCHEMA_SQL);

  // „стара версия“: без CancelledItem, без User.mustChangePin, без един индекс
  for (const t of parsed.tables) {
    if (t.name === "CancelledItem") continue;
    const sql = t.name === "User" ? t.createSql.replace(/,\s*"mustChangePin"[^,\n]*/, "") : t.createSql;
    await prisma.$executeRawUnsafe(sql);
  }
  const skipped = parsed.indexes.find((i) => i.table === "User")!;
  for (const i of parsed.indexes) {
    if (i === skipped || i.table === "CancelledItem") continue;
    await prisma.$executeRawUnsafe(i.sql);
  }
  await prisma.$executeRawUnsafe(
    `INSERT INTO "User" ("id","name","operatorCode","pinHash","role","readOnly","active","updatedAt") VALUES ('u1','Стар Оператор',7,'x','CASHIER',false,true,CURRENT_TIMESTAMP)`
  );
  const before = (await prisma.$queryRawUnsafe(`PRAGMA table_info("User")`)) as Array<{ name: string }>;
  assert.ok(!before.some((c) => c.name === "mustChangePin"));

  const r = await upgradeSchema(prisma);
  assert.ok(r.applied.length >= 3, r.applied.join("\n"));

  const user = await prisma.user.findUnique({ where: { id: "u1" } });
  assert.equal(user?.name, "Стар Оператор");
  assert.equal(user?.mustChangePin, false);
  assert.equal(await prisma.cancelledItem.count(), 0);
  const idx = (await prisma.$queryRawUnsafe(
    `SELECT name FROM sqlite_master WHERE type='index' AND name='${skipped.name}'`
  )) as unknown[];
  assert.equal(idx.length, 1);

  // втори път — нищо за правене
  assert.deepEqual((await upgradeSchema(prisma)).applied, []);
  await prisma.$disconnect();
});
