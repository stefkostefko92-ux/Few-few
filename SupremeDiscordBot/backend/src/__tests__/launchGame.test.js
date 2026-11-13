// backend/src/__tests__/launchGame.test.js
// Готовност за пускане, поток И — игра и икономика (И1, И5, И7, И8).
// Номерът на критерия е в името на всеки тест.
import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";
import { createPrismaMock } from "./testUtils/prismaMock.js";

const prismaMock = createPrismaMock();
vi.mock("../lib/prisma.js", () => ({ prisma: prismaMock }));
vi.mock("../services/botNotifier.js", () => ({ notifyBot: vi.fn().mockResolvedValue({ ok: true }), dmUser: vi.fn() }));
vi.mock("../middleware/auth.js", () => ({ requireBotSecret: (_q, _s, next) => next() }));
const getServerTier = vi.fn();
vi.mock("../lib/premium.js", async (orig) => {
  const real = await orig();
  return { ...real, getServerTier: (...a) => getServerTier(...a) };
});

const botGameRouter = (await import("../routes/bot_game.js")).default;
const ops = await import("../lib/game/companionOps.js");
const questOps = await import("../lib/game/questOps.js");
const premium = await import("../lib/premium.js");

const SID = "222222222222222222";
const UID = "333333333333333333";
const app = express();
app.use(express.json());
app.use("/api/bot", botGameRouter);
app.use((e, _q, r, _n) => r.status(500).json({ error: e.message }));

const settings = { serverId: SID, enabled: true };
const item = (o = {}) => ({ id: "it1", serverId: SID, name: "VIP", priceSparks: 100, type: "ROLE", roleId: "777777777777777777", durationDays: null, stock: null, enabled: true, ...o });

/** Нова транзакционна „връзка“: отделен мок, за да се види КАКВО минава през tx. */
function withTx() {
  const tx = createPrismaMock();
  prismaMock.$transaction.mockImplementation(async (fn) => fn(tx));
  return tx;
}

beforeEach(() => {
  vi.resetAllMocks();
  getServerTier.mockResolvedValue({ plan: "free", isPremium: false, limits: premium.BASE_LIMITS });
  prismaMock.gameSettings.findUnique.mockResolvedValue(settings);
  prismaMock.$transaction.mockImplementation(async (fn) => fn(prismaMock));
});

describe("И1 — магазин: постоянна роля, която вече имаш → ALREADY_OWNED, без плащане", () => {
  it("И1: има невъзвърната покупка без срок за същата роля → 409 ALREADY_OWNED, искрите не се пипат", async () => {
    prismaMock.shopItem.findFirst.mockResolvedValue(item());
    prismaMock.shopPurchase.findFirst.mockResolvedValue({ id: "old" });
    const res = await request(app).post(`/api/bot/game/shop/${SID}/buy`).send({ userId: UID, itemId: "it1" });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("ALREADY_OWNED");
    expect(prismaMock.memberProgress.updateMany).not.toHaveBeenCalled();
    expect(prismaMock.shopPurchase.create).not.toHaveBeenCalled();
    expect(prismaMock.shopPurchase.findFirst.mock.calls[0][0].where).toMatchObject({ serverId: SID, userId: UID, roleId: "777777777777777777", revokedAt: null, expiresAt: null });
  });

  it("И1: артикул без роля (CUSTOM) не се проверява за притежание", async () => {
    prismaMock.shopItem.findFirst.mockResolvedValue(item({ type: "CUSTOM", roleId: null }));
    prismaMock.memberProgress.createMany.mockResolvedValue({});
    prismaMock.memberProgress.findUnique.mockResolvedValue({ id: "mp", sparks: 500 });
    prismaMock.memberProgress.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.shopPurchase.create.mockImplementation(async ({ data }) => ({ id: "p1", ...data }));
    const res = await request(app).post(`/api/bot/game/shop/${SID}/buy`).send({ userId: UID, itemId: "it1" });
    expect(res.status).toBe(200);
    expect(prismaMock.shopPurchase.findFirst).not.toHaveBeenCalled();
  });
});

describe("И1 — връщане на искри при неполучена роля (идемпотентно)", () => {
  const url = `/api/bot/game/shop/${SID}/purchase/p1/refund`;

  it("И1: първото извикване: условен revokedAt null → now + increment на искрите, в ЕДНА транзакция", async () => {
    const tx = withTx();
    tx.shopPurchase.findFirst.mockResolvedValue({ id: "p1", serverId: SID, userId: UID, priceSparks: 100 });
    tx.shopPurchase.updateMany.mockResolvedValue({ count: 1 });
    tx.memberProgress.updateMany.mockResolvedValue({ count: 1 });
    const res = await request(app).post(url).send({ userId: UID });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: true, already: false, refunded: 100 });
    const claim = tx.shopPurchase.updateMany.mock.calls[0][0];
    expect(claim.where).toEqual({ id: "p1", serverId: SID, userId: UID, revokedAt: null });
    expect(claim.data.revokedAt).toBeInstanceOf(Date);
    expect(tx.memberProgress.updateMany).toHaveBeenCalledWith({ where: { serverId: SID, userId: UID }, data: { sparks: { increment: 100 } } });
    // нищо извън транзакцията
    expect(prismaMock.memberProgress.updateMany).not.toHaveBeenCalled();
  });

  it("И1: второто извикване (count 0) НЕ връща искри втори път", async () => {
    const tx = withTx();
    tx.shopPurchase.findFirst.mockResolvedValue({ id: "p1", serverId: SID, userId: UID, priceSparks: 100 });
    tx.shopPurchase.updateMany.mockResolvedValue({ count: 0 });
    const res = await request(app).post(url).send({ userId: UID });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: true, already: true, refunded: 0 });
    expect(tx.memberProgress.updateMany).not.toHaveBeenCalled();
  });

  it("И1: чужда покупка (друг потребител/сървър) → 404, без връщане", async () => {
    const tx = withTx();
    tx.shopPurchase.findFirst.mockResolvedValue(null);
    const res = await request(app).post(url).send({ userId: UID });
    expect(res.status).toBe(404);
    expect(tx.shopPurchase.findFirst.mock.calls[0][0].where).toEqual({ id: "p1", serverId: SID, userId: UID });
    expect(tx.memberProgress.updateMany).not.toHaveBeenCalled();
  });

  it("И1: няма ред за искри → 409 и откат (покупката не остава „върната“ без искри)", async () => {
    const tx = withTx();
    tx.shopPurchase.findFirst.mockResolvedValue({ id: "p1", serverId: SID, userId: UID, priceSparks: 100 });
    tx.shopPurchase.updateMany.mockResolvedValue({ count: 1 });
    tx.memberProgress.updateMany.mockResolvedValue({ count: 0 });
    const res = await request(app).post(url).send({ userId: UID });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("NO_PROGRESS");
  });

  it("И1: невалиден userId → 400", async () => {
    expect((await request(app).post(url).send({ userId: "x" })).status).toBe(400);
  });
});

describe("И5 — две едновременни хранения не горят искри над прага", () => {
  const owned = { id: "mc1", companionId: "lime-blip", stage: 1, fed: 100 };

  it("И5: fed се вдига условно по видяното fed/stage", async () => {
    const tx = withTx();
    tx.memberCompanion.findFirst.mockResolvedValue(owned);
    tx.memberProgress.updateMany.mockResolvedValue({ count: 1 });
    tx.memberCompanion.updateMany.mockResolvedValue({ count: 1 });
    tx.memberCompanion.findUnique.mockResolvedValue({ ...owned, fed: 600 });
    tx.memberCompanion.update.mockResolvedValue({ ...owned, fed: 300, stage: 3 });
    tx.memberProgress.findUnique.mockResolvedValue({ sparks: 5 });
    prismaMock.seasonConfig?.findFirst?.mockResolvedValue?.(null);
    await ops.feedCompanion(SID, UID, "mc1", 500);
    expect(tx.memberCompanion.updateMany.mock.calls[0][0].where).toMatchObject({ id: "mc1", fed: 100, stage: 1 });
  });

  it("И5: загубена надпревара (count 0) → BUSY; искрите се връщат с отката, без втори запис", async () => {
    const tx = withTx();
    tx.memberCompanion.findFirst.mockResolvedValue(owned);
    tx.memberProgress.updateMany.mockResolvedValue({ count: 1 });
    tx.memberCompanion.updateMany.mockResolvedValue({ count: 0 });
    const out = await ops.feedCompanion(SID, UID, "mc1", 500);
    expect(out).toEqual({ ok: false, code: "BUSY" });
    expect(tx.memberCompanion.update).not.toHaveBeenCalled();
  });

  it("И5: пред-транзакционна грешка, която не е надпревара, не се маскира като BUSY", async () => {
    const tx = withTx();
    tx.memberCompanion.findFirst.mockRejectedValue(new Error("db down"));
    await expect(ops.feedCompanion(SID, UID, "mc1", 10)).rejects.toThrow("db down");
  });
});

describe("И7 — наградата на куест: заявката и начисленията са в една транзакция", () => {
  const quest = { id: "q1", serverId: SID, rewardSparks: 100 };
  const contributions = [{ userId: "u1", amount: 50 }, { userId: "u2", amount: 30 }, { userId: "u3", amount: 20 }];

  it("И7: claim (rewardedAt) и всички increment-и минават през tx, не през глобалния клиент", async () => {
    const tx = withTx();
    tx.serverQuest.updateMany.mockResolvedValue({ count: 1 });
    tx.questContribution.findMany.mockResolvedValue(contributions);
    tx.memberProgress.createMany.mockResolvedValue({});
    tx.memberProgress.findUnique.mockResolvedValue({});
    tx.memberProgress.update.mockResolvedValue({});
    tx.memberCompanion.count.mockResolvedValue(99);
    const out = await questOps.rewardQuest(quest);
    expect(out.rewards.length).toBeGreaterThan(0);
    expect(tx.serverQuest.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "q1", rewardedAt: null } }));
    expect(tx.memberProgress.update).toHaveBeenCalledTimes(out.rewards.length);
    for (const w of ["serverQuest.updateMany", "memberProgress.update", "memberProgress.createMany"]) {
      const [m, f] = w.split(".");
      expect(prismaMock[m][f], `извън транзакцията: ${w}`).not.toHaveBeenCalled();
    }
  });

  it("И7: срив на начисление по средата хвърля (транзакцията откача и claim-а) — не се връща „успех“", async () => {
    const tx = withTx();
    tx.serverQuest.updateMany.mockResolvedValue({ count: 1 });
    tx.questContribution.findMany.mockResolvedValue(contributions);
    tx.memberProgress.createMany.mockResolvedValue({});
    tx.memberProgress.findUnique.mockResolvedValue({});
    tx.memberProgress.update.mockResolvedValueOnce({}).mockRejectedValueOnce(new Error("conn lost"));
    await expect(questOps.rewardQuest(quest)).rejects.toThrow("conn lost");
  });

  it("И7: вече раздадена награда (count 0) → alreadyRewarded, без начисления", async () => {
    const tx = withTx();
    tx.serverQuest.updateMany.mockResolvedValue({ count: 0 });
    const out = await questOps.rewardQuest(quest);
    expect(out.alreadyRewarded).toBe(true);
    expect(tx.memberProgress.update).not.toHaveBeenCalled();
  });
});

describe("И8 — най-много една жива поява на сървър (заключване по сървър)", () => {
  it("И8: проверката и записът са в транзакция под pg_advisory_xact_lock по сървър", async () => {
    const tx = withTx();
    tx.$executeRaw.mockResolvedValue(1);
    tx.companionSpawn.findFirst.mockResolvedValue(null);
    tx.companionSpawn.create.mockImplementation(async ({ data }) => ({ id: "s1", ...data }));
    const out = await ops.createSpawn(SID, "444444444444444444");
    expect(out.ok).toBe(true);
    expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
    expect(tx.$executeRaw.mock.calls[0][0].join("?")).toMatch(/pg_advisory_xact_lock\(hashtext\(/);
    expect(tx.$executeRaw.mock.calls[0][1]).toContain(SID);
    // ключалката е ПРЕДИ четенето
    expect(tx.$executeRaw.mock.invocationCallOrder[0]).toBeLessThan(tx.companionSpawn.findFirst.mock.invocationCallOrder[0]);
    // нищо извън транзакцията
    expect(prismaMock.companionSpawn.findFirst).not.toHaveBeenCalled();
    expect(prismaMock.companionSpawn.create).not.toHaveBeenCalled();
  });

  it("И8: жива поява, видяна под ключалката → SPAWN_ACTIVE, нова не се създава", async () => {
    const tx = withTx();
    tx.$executeRaw.mockResolvedValue(1);
    tx.companionSpawn.findFirst.mockResolvedValue({ caughtById: null, expiresAt: new Date(Date.now() + 60_000), createdAt: new Date() });
    const out = await ops.createSpawn(SID, "444444444444444444", { manual: true });
    expect(out).toEqual({ ok: false, code: "SPAWN_ACTIVE" });
    expect(tx.companionSpawn.create).not.toHaveBeenCalled();
  });
});
