// supto.db.test.ts — поведението с истинска SQLite база (временна): т. 2, 9, 12, 13, 15 и
// хеш веригата. Чистите функции са в supto.test.ts; тук е проверката, че БД го налага.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const dir = mkdtempSync(join(tmpdir(), "cspos-supto-"));
process.env.DATABASE_URL = `file:${join(dir, "test.db")}`;

type Lib = {
  prisma: typeof import("../db").prisma;
  ensureDbGuards: typeof import("../integrity").ensureDbGuards;
  openDraft: typeof import("../sale-draft").openDraft;
  syncDraft: typeof import("../sale-draft").syncDraft;
  cancelDraft: typeof import("../sale-draft").cancelDraft;
  lockDraftForPayment: typeof import("../sale-draft").lockDraftForPayment;
  audit: typeof import("../audit").audit;
  verifyAuditChain: typeof import("../audit").verifyAuditChain;
};
let L: Lib;
let userId = "";
let shiftId = "";
let productId = "";

before(async () => {
  execFileSync("npx", ["prisma", "db", "push", "--skip-generate", "--accept-data-loss"], {
    env: { ...process.env },
    stdio: "ignore",
  });
  const db = await import("../db");
  const integrity = await import("../integrity");
  const draft = await import("../sale-draft");
  const audit = await import("../audit");
  L = {
    prisma: db.prisma,
    ensureDbGuards: integrity.ensureDbGuards,
    openDraft: draft.openDraft,
    syncDraft: draft.syncDraft,
    cancelDraft: draft.cancelDraft,
    lockDraftForPayment: draft.lockDraftForPayment,
    audit: audit.audit,
    verifyAuditChain: audit.verifyAuditChain,
  };
  await L.ensureDbGuards();
  const u = await L.prisma.user.create({
    data: { name: "Иван Иванов", operatorCode: 7, pinHash: "x", role: "CASHIER" },
  });
  userId = u.id;
  const sh = await L.prisma.shift.create({ data: { userId, openingCashCents: 0 } });
  shiftId = sh.id;
  const cat = await L.prisma.category.create({ data: { name: "Напитки" } });
  const p = await L.prisma.product.create({
    data: { plu: 102, name: "Вода 0,5 л", categoryId: cat.id, vatGroup: "B", priceCents: 199 },
  });
  productId = p.id;
});

after(async () => {
  await L?.prisma.$disconnect();
  rmSync(dir, { recursive: true, force: true });
});

const op = () => ({ userId, operatorCode: 7, role: "CASHIER" as const, shiftId });

test("т. 9: УНП от първия артикул; поредният № е отделен за всеки ИН на ФУ", async () => {
  const a = await L.openDraft(op(), "DT000001");
  const b = await L.openDraft(op(), "DT000001");
  const c = await L.openDraft(op(), "ZK000002");
  assert.equal(a.unp, "DT000001-0007-0000001");
  assert.equal(b.unp, "DT000001-0007-0000002");
  assert.equal(c.unp, "ZK000002-0007-0000001");
});

test("т. 12: анулиран ред се записва с УНП, количество и сървърна стойност", async () => {
  const d = await L.openDraft(op(), "DT000001");
  await L.syncDraft(d.id, op(), [{ uid: "l1", productId, qtyMilli: 3000, discountPermille: 0 }]);
  await L.syncDraft(d.id, op(), [{ uid: "l1", productId, qtyMilli: 1000, discountPermille: 0 }]);
  const rows = await L.prisma.cancelledItem.findMany({ where: { draftId: d.id } });
  assert.equal(rows.length, 1);
  assert.equal(rows[0]!.qtyMilli, 2000);
  assert.equal(rows[0]!.totalCents, 398, "стойността е от сървъра: 2 × 1,99 €");
  assert.equal(rows[0]!.unp, d.unp);
  assert.equal(rows[0]!.plu, 102);
  const log = await L.prisma.auditLog.findFirst({ where: { action: "SALE_ITEM_ANNULLED", unp: d.unp } });
  assert.ok(log, "анулирането е в дневника с УНП в отделно поле");
});

test("т. 12: изчистване на бона = пълно анулиране на продажбата", async () => {
  const d = await L.openDraft(op(), "DT000001");
  await L.syncDraft(d.id, op(), [{ uid: "x", productId, qtyMilli: 2000, discountPermille: 0 }]);
  await L.cancelDraft(d.id, op());
  const draft = await L.prisma.saleDraft.findUnique({ where: { id: d.id } });
  assert.equal(draft!.state, "CANCELLED");
  const rows = await L.prisma.cancelledItem.findMany({ where: { draftId: d.id } });
  assert.equal(rows.reduce((a, r) => a + r.qtyMilli, 0), 2000);
  assert.ok(await L.prisma.auditLog.findFirst({ where: { action: "SALE_ANNULLED", unp: d.unp } }));
});

test("т. 2: едновременно плащане на една продажба — само едното минава", async () => {
  const d = await L.openDraft(op(), "DT000001");
  await L.syncDraft(d.id, op(), [{ uid: "y", productId, qtyMilli: 1000, discountPermille: 0 }]);
  const [first, second] = await Promise.all([
    L.lockDraftForPayment(d.id, userId),
    L.lockDraftForPayment(d.id, userId),
  ]);
  assert.equal([first, second].filter(Boolean).length, 1);
});

test("т. 13: продажби и дневник не се изтриват; дневникът не се променя", async () => {
  // собствени данни — тестът не зависи от реда на останалите
  await L.audit(userId, "LOGIN");
  const d = await L.openDraft(op(), "DT000001");
  await L.syncDraft(d.id, op(), [{ uid: "t13", productId, qtyMilli: 2000, discountPermille: 0 }]);
  await L.syncDraft(d.id, op(), []);

  // Prisma превежда RAISE(ABORT) като нарушено ограничение — важното е, че нищо не изчезва
  const counts = async () => [
    await L.prisma.auditLog.count(),
    await L.prisma.cancelledItem.count(),
    await L.prisma.saleDraft.count(),
  ];
  const before = await counts();
  await assert.rejects(L.prisma.auditLog.deleteMany({}));
  await assert.rejects(L.prisma.cancelledItem.deleteMany({}));
  await assert.rejects(L.prisma.saleDraft.deleteMany({}));
  assert.deepEqual(await counts(), before, "нито един запис не е изтрит");

  await assert.rejects(L.prisma.auditLog.updateMany({ data: { action: "X" } }));
  assert.equal(await L.prisma.auditLog.count({ where: { action: "X" } }), 0, "дневникът не е променен");

  const names = await L.prisma.$queryRawUnsafe<Array<{ name: string }>>(
    `SELECT name FROM sqlite_master WHERE type = 'trigger' AND name LIKE 'supto_%'`
  );
  for (const t of ["supto_no_delete_Sale", "supto_no_update_Sale", "supto_no_delete_SaleItem", "supto_no_delete_AuditLog", "supto_no_update_AuditLog"]) {
    assert.ok(names.some((n) => n.name === t), `липсва тригер ${t}`);
  }
});

test("хеш веригата на дневника е цяла и открива подмяна", async () => {
  await L.audit(userId, "LOGOUT");
  const ok = await L.verifyAuditChain();
  assert.equal(ok.ok, true);
  assert.ok(ok.checked >= 4);
  // подмяна „отвън“: махаме тригера като нападател и пипаме запис
  await L.prisma.$executeRawUnsafe(`DROP TRIGGER IF EXISTS supto_no_update_AuditLog`);
  await L.prisma.$executeRawUnsafe(`UPDATE "AuditLog" SET "action" = 'LOGIN' WHERE "action" = 'LOGOUT'`);
  const bad = await L.verifyAuditChain();
  assert.equal(bad.ok, false);
});
