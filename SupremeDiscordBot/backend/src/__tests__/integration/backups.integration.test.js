// backend/src/__tests__/integration/backups.integration.test.js
// Резервни копия срещу ЖИВ Postgres (docs/BACKUP_SPEC.md).
//
// Мокът не може да докаже трите неща, на които стои функцията:
//   Б14 — „едно възстановяване наведнъж на сървър“ се пази от УНИКАЛЕН индекс, не от проверка;
//   Б2  — в колоната наистина лежи шифротекст и се отваря обратно до същото копие;
//   Б15 — картата стар → нов ID се трупа в JSONB през истинските маршрути на бота.
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import express from "express";
import request from "supertest";
import { prisma, resetDb, makeServer, makeUser } from "./db.js";

process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || "ab".repeat(32);
process.env.API_SECRET = process.env.API_SECRET || "integration-secret";

const { createBackup, openBackup, purgeExpiredBackups, markServerBackupsExpiring, clearServerBackupsExpiry } = await import("../../lib/backups.js");
const { BASE_LIMITS } = await import("../../lib/premium.js");
const botBackups = (await import("../../routes/bot_backups.js")).default;

const SID = "333333333333333333";
const ID = (n) => String(500000000000000000n + BigInt(n));
const snap = (o = {}) => ({
  v: 1, guild: { id: SID, name: "Сървър", ownerId: "111111111111111111" }, capturedAt: "2026-11-28T10:00:00.000Z",
  everyone: { permissions: "104324673" },
  roles: [{ id: ID(1), name: "Админ", color: 0, hoist: true, mentionable: false, permissions: "8", position: 1 }],
  categories: [{ id: ID(10), name: "Общи", position: 0, overwrites: [{ id: SID, kind: "everyone", allow: "0", deny: "1024" }] }],
  channels: [
    { id: ID(20), type: 0, name: "общ-чат", parentId: ID(10), position: 0, overwrites: [] },
    { id: ID(21), type: 0, name: "тикет-0001", parentId: null, position: 1, overwrites: [] },
  ],
  ...o,
});
const tier = { plan: "free", limits: BASE_LIMITS };
const botApp = () => {
  const a = express();
  a.use(express.json());
  a.use("/api/bot", botBackups);
  a.use((e, _q, r, _n) => r.status(500).json({ error: e.message }));
  return a;
};
const asBot = (r) => r.set("x-bot-secret", process.env.API_SECRET);

beforeEach(async () => {
  await resetDb();
  await makeServer({ id: SID });
});
afterAll(async () => { await prisma.$disconnect(); });

describe("резервни копия — жива база", () => {
  it("Б2/Б3: шифротекст в колоната, без тикет-канала; отваря се до същото копие", async () => {
    await makeUser("111111111111111111"); // тикетът има външен ключ към създателя
    await prisma.ticket.create({ data: { serverId: SID, creatorId: "111111111111111111", channelId: ID(21) } });
    const out = await createBackup(SID, { kind: "MANUAL", tier, snapshot: snap(), createdBy: "111111111111111111" });
    expect(out.ok).toBe(true);
    const [raw] = await prisma.$queryRaw`SELECT "data" FROM "server_backups"`;
    expect(raw.data).toMatch(/^[0-9a-f]{24}:[0-9a-f]{32}:[0-9a-f]+$/);
    expect(raw.data).not.toContain("общ-чат");
    const row = await prisma.serverBackup.findUnique({ where: { id: out.backup.id } });
    const opened = openBackup(row);
    expect(opened.channels.map((c) => c.name)).toEqual(["общ-чат"]);
    expect(row).toMatchObject({ roleCount: 1, categoryCount: 1, channelCount: 1, kind: "MANUAL", ownerId: "111111111111111111" });
  });

  it("Б4: автоматичните се въртят (Free пази 1), ръчните остават", async () => {
    await createBackup(SID, { kind: "MANUAL", tier, snapshot: snap(), createdBy: "111111111111111111" });
    await createBackup(SID, { kind: "AUTO", tier, snapshot: snap() });
    await createBackup(SID, { kind: "AUTO", tier, snapshot: snap() });
    const rows = await prisma.serverBackup.findMany({ where: { serverId: SID } });
    expect(rows.filter((r) => r.kind === "AUTO")).toHaveLength(1);
    expect(rows.filter((r) => r.kind === "MANUAL")).toHaveLength(1);
  });

  it("Б14: второ активно възстановяване в същия сървър пада на уникалния индекс; след края — може", async () => {
    const base = { backupId: "cx", sourceServerId: SID, targetServerId: SID, mode: "SAME", status: "RUNNING" };
    const first = await prisma.backupRestore.create({ data: { ...base, activeServerId: SID } });
    await expect(prisma.backupRestore.create({ data: { ...base, activeServerId: SID } })).rejects.toMatchObject({ code: "P2002" });
    await prisma.backupRestore.update({ where: { id: first.id }, data: { status: "DONE", activeServerId: null } });
    await expect(prisma.backupRestore.create({ data: { ...base, activeServerId: SID } })).resolves.toBeTruthy();
  });

  it("Б15: ботът взима задачата и картата се трупа в базата; краят освобождава сървъра", async () => {
    const b = await createBackup(SID, { kind: "MANUAL", tier, snapshot: snap(), createdBy: "111111111111111111" });
    const r = await prisma.backupRestore.create({ data: { backupId: b.backup.id, sourceServerId: SID, targetServerId: SID, mode: "SAME", status: "PENDING", activeServerId: SID } });
    const got = await asBot(request(botApp()).get(`/api/bot/backup-restores/${r.id}`));
    expect(got.status).toBe(200);
    expect(got.body.snapshot.roles[0].name).toBe("Админ");
    await asBot(request(botApp()).post(`/api/bot/backup-restores/${r.id}/progress`)).send({ idMap: { roles: { [ID(1)]: "600000000000000001" } } });
    await asBot(request(botApp()).post(`/api/bot/backup-restores/${r.id}/progress`)).send({ idMap: { channels: { [ID(10)]: "600000000000000010" } }, counts: { rolesCreated: 1 } });
    await asBot(request(botApp()).post(`/api/bot/backup-restores/${r.id}/progress`)).send({ status: "DONE" });
    const done = await prisma.backupRestore.findUnique({ where: { id: r.id } });
    expect(done.idMap).toEqual({ roles: { [ID(1)]: "600000000000000001" }, channels: { [ID(10)]: "600000000000000010" } });
    expect(done).toMatchObject({ status: "DONE", activeServerId: null, attempts: 1 });
    expect(done.counts).toMatchObject({ rolesCreated: 1 });
  });

  it("Б17: срок при махане, падане при покана, изтриване на изтеклите", async () => {
    const b = await createBackup(SID, { kind: "MANUAL", tier, snapshot: snap(), createdBy: null });
    const t0 = new Date("2026-01-01T00:00:00Z");
    await markServerBackupsExpiring(SID, t0);
    expect((await prisma.serverBackup.findUnique({ where: { id: b.backup.id } })).expiresAt.toISOString()).toBe("2026-04-01T00:00:00.000Z");
    await clearServerBackupsExpiry(SID);
    expect((await prisma.serverBackup.findUnique({ where: { id: b.backup.id } })).expiresAt).toBeNull();
    await markServerBackupsExpiring(SID, t0);
    await purgeExpiredBackups(new Date("2026-03-31T00:00:00Z"));
    expect(await prisma.serverBackup.count()).toBe(1);
    await purgeExpiredBackups(new Date("2026-04-02T00:00:00Z"));
    expect(await prisma.serverBackup.count()).toBe(0);
  });
});
