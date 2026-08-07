// backend/src/__tests__/dataRetention.test.js
// Регресии за секция 3б на retention job-а (07.08.2026).
//
// Историята зад тях: първата версия на секцията триеше самия ред Server за
// сървъри без бот от 30+ дни. PaymentLog и AuditLog висят на Server с
// onDelete: Cascade → изтриването унищожаваше финансовите записи, за които
// заглавието на СЪЩИЯ файл казва „7 години, НИКОГА не се трият автоматично“,
// и GDPR доказателствата, които секция 2 изрично пази. Дефектът беше намерен
// при собствена проверка, преди да стигне до продукция.
import { describe, it, expect, vi, beforeEach } from "vitest";

const db = {
  servers: [],
  deleted: [],      // { table, serverId }
  auditCreated: [], // { serverId, action }
};

const del = (table) => ({
  deleteMany: vi.fn(({ where }) => {
    db.deleted.push({ table, serverId: where.serverId });
    return { count: 1 };
  }),
});

vi.mock("../lib/prisma.js", () => ({
  prisma: {
    server: { findMany: vi.fn(({ where }) => filterServers(where)) },
    ticket: { ...del("ticket"), findMany: vi.fn(() => []) },
    application: del("application"),
    form: del("form"),
    panel: del("panel"),
    verificationPanel: del("verificationPanel"),
    reactionRoleMessage: del("reactionRoleMessage"),
    kbArticle: del("kbArticle"),
    serverMember: del("serverMember"),
    ticketMessage: { deleteMany: vi.fn(() => ({ count: 0 })) },
    auditLog: {
      deleteMany: vi.fn(() => ({ count: 0 })),
      create: vi.fn(({ data }) => {
        db.auditCreated.push({ serverId: data.serverId, action: data.action });
        return data;
      }),
    },
    $transaction: vi.fn(async (ops) => Promise.all(ops)),
  },
}));

vi.mock("../lib/premium.js", () => ({ effectiveFreeWhere: () => ({}) }));

const ACTIVE_PAID = ["active", "past_due", "trialing", "unpaid", "incomplete"];

function filterServers(where) {
  // Достатъчно вярна имитация на условията, които job-ът поставя.
  if (!where?.botRemovedAt) return [];
  const cutoff = where.botRemovedAt.lt;
  return db.servers
    .filter((s) => s.botRemovedAt && s.botRemovedAt < cutoff)
    .filter((s) => !ACTIVE_PAID.includes(s.stripeStatus))
    .filter((s) => !s.purged)
    .map((s) => ({ id: s.id }));
}

const { runRetentionJob } = await import("../jobs/dataRetention.js");

const old = new Date(Date.now() - 60 * 86_400_000);
const recent = new Date(Date.now() - 5 * 86_400_000);

beforeEach(() => {
  db.servers = [];
  db.deleted = [];
  db.auditCreated = [];
});

describe("retention 3б — изчистване на сървъри без бот", () => {
  it("НЕ трие реда Server (иначе PaymentLog пада по каскада — 7-годишно задължение)", async () => {
    db.servers.push({ id: "s1", botRemovedAt: old, stripeStatus: null });
    await runRetentionJob();
    expect(db.deleted.map((d) => d.table)).not.toContain("server");
    expect(db.deleted.map((d) => d.table)).not.toContain("paymentLog");
  });

  it("трие личните данни на изоставения сървър", async () => {
    db.servers.push({ id: "s1", botRemovedAt: old, stripeStatus: null });
    await runRetentionJob();
    const tables = db.deleted.filter((d) => d.serverId === "s1").map((d) => d.table);
    expect(tables).toEqual(
      expect.arrayContaining(["ticket", "application", "form", "panel", "verificationPanel", "reactionRoleMessage", "kbArticle", "serverMember"]),
    );
  });

  it("оставя следа SERVER_DATA_PURGED (дедуп + доказателство)", async () => {
    db.servers.push({ id: "s1", botRemovedAt: old, stripeStatus: null });
    await runRetentionJob();
    expect(db.auditCreated).toContainEqual({ serverId: "s1", action: "SERVER_DATA_PURGED" });
  });

  it("НЕ пипа сървър с жив платен абонамент — може да е махнат бот по погрешка", async () => {
    for (const status of ACTIVE_PAID) {
      db.servers = [{ id: `paid-${status}`, botRemovedAt: old, stripeStatus: status }];
      db.deleted = [];
      await runRetentionJob();
      expect(db.deleted, `статус ${status}`).toHaveLength(0);
    }
  });

  it("НЕ пипа наскоро махнат бот (30-дневният гратис за повторна покана)", async () => {
    db.servers.push({ id: "s-recent", botRemovedAt: recent, stripeStatus: null });
    await runRetentionJob();
    expect(db.deleted).toHaveLength(0);
  });

  it("НЕ пипа сървър с активен бот (botRemovedAt е null)", async () => {
    db.servers.push({ id: "s-live", botRemovedAt: null, stripeStatus: null });
    await runRetentionJob();
    expect(db.deleted).toHaveLength(0);
  });
});

describe("retention 2 — какво НЕ се трие от одитния дневник", () => {
  it("SERVER_DATA_PURGED е защитен от 2-годишното чистене", async () => {
    const { prisma } = await import("../lib/prisma.js");
    await runRetentionJob();
    const call = prisma.auditLog.deleteMany.mock.calls.find((c) => c[0]?.where?.action?.notIn);
    expect(call?.[0].where.action.notIn).toContain("SERVER_DATA_PURGED");
  });
});
