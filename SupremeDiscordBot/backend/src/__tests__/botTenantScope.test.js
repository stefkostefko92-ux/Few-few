// backend/src/__tests__/botTenantScope.test.js
// Червен екип, 10.10.2026: два маршрута за бота търсеха запис САМО по id.
//  • `/giveaway end|reroll` приема свободно въведен id → админ на сървър A
//    приключваше или теглеше наново томбола на сървър B.
//  • `/panel spawn` приема свободно въведен id (вижда се в custom_id на
//    бутоните на чуждия панел) → чуждият панел се публикуваше у нападателя, а
//    записът му (канал/съобщение) се презаписваше.
// Сега всичко е по (id, serverId): без serverId → 400, чужд id → 404 като
// несъществуващ, и записът не мърда. Тестовете падат на стария код.
import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";
import { createPrismaMock } from "./testUtils/prismaMock.js";

const prismaMock = createPrismaMock();
vi.mock("../lib/prisma.js", () => ({ prisma: prismaMock }));
vi.mock("../middleware/auth.js", () => ({ requireBotSecret: (_req, _res, next) => next() }));
const notifyBot = vi.fn().mockResolvedValue({ ok: true });
vi.mock("../services/botNotifier.js", () => ({ notifyBot: (...a) => notifyBot(...a), notifyBotVerbose: vi.fn(), dmUser: vi.fn() }));
vi.mock("../services/webhooks.js", async (orig) => ({ ...(await orig()), fireWebhooks: vi.fn().mockResolvedValue(undefined) }));
vi.mock("../lib/premium.js", async (orig) => {
  const real = await orig();
  return { ...real, getServerTier: vi.fn(async () => ({ plan: "premium", isPremium: true, limits: real.BASE_LIMITS })) };
});

const botRouter = (await import("../routes/bot.js")).default;
const botV18Router = (await import("../routes/bot_v18.js")).default;
const app = express();
app.use(express.json());
app.use("/api/bot", botRouter);
app.use("/api/bot", botV18Router);

const MINE = "222222222222222222";
const THEIRS = "999999999999999999";

beforeEach(() => { vi.clearAllMocks(); });

describe("панелите — само по (id, serverId)", () => {
  it("GET без serverId → 400; чужд id → 404; търсенето носи serverId", async () => {
    expect((await request(app).get("/api/bot/panel/pnl_1")).status).toBe(400);
    prismaMock.panel.findFirst.mockResolvedValueOnce(null);
    const r = await request(app).get("/api/bot/panel/pnl_1").query({ serverId: MINE });
    expect(r.status).toBe(404);
    expect(prismaMock.panel.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "pnl_1", serverId: MINE } }));
    expect(prismaMock.panel.findUnique).not.toHaveBeenCalled();
  });

  it("групираните панели се търсят също в рамките на сървъра", async () => {
    prismaMock.panel.findFirst.mockResolvedValueOnce({ id: "pnl_1", serverId: MINE, channelId: "500000000000000001", messageId: "600000000000000001", buttons: [], server: null });
    prismaMock.panel.findMany.mockResolvedValueOnce([]);
    await request(app).get("/api/bot/panel/pnl_1").query({ serverId: MINE, siblings: "1" });
    expect(prismaMock.panel.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ serverId: MINE }) }));
  });

  it("PATCH spawned: без serverId → 400; чужд панел → 404 и нищо не се презаписва", async () => {
    const body = { channelId: "500000000000000001", messageId: "600000000000000001" };
    expect((await request(app).patch("/api/bot/panel/pnl_1/spawned").send(body)).status).toBe(400);
    prismaMock.panel.updateMany.mockResolvedValueOnce({ count: 0 });
    const r = await request(app).patch("/api/bot/panel/pnl_theirs/spawned").send({ ...body, serverId: MINE });
    expect(r.status).toBe(404);
    expect(prismaMock.panel.updateMany).toHaveBeenCalledWith({ where: { id: "pnl_theirs", serverId: MINE }, data: body });
    expect(prismaMock.panel.update).not.toHaveBeenCalled();
  });
});

describe("томболите — само по (id, serverId)", () => {
  it("end/reroll без serverId → 400; чужда томбола → 404, без промяна и без обява", async () => {
    for (const action of ["end", "reroll"]) {
      expect((await request(app).post(`/api/bot/giveaway/gw_1/${action}`).send({ actorId: "1" })).status).toBe(400);
      prismaMock.giveaway.findFirst.mockResolvedValueOnce(null);
      const r = await request(app).post(`/api/bot/giveaway/gw_theirs/${action}`).send({ serverId: MINE, actorId: "1" });
      expect(r.status).toBe(404);
      expect(prismaMock.giveaway.findFirst).toHaveBeenLastCalledWith(expect.objectContaining({ where: { id: "gw_theirs", serverId: MINE } }));
    }
    expect(prismaMock.giveaway.update).not.toHaveBeenCalled();
    expect(notifyBot).not.toHaveBeenCalled();
  });

  it("собствена томбола: тегли и обявата към бота носи serverId (иначе каналът не се намира)", async () => {
    prismaMock.giveaway.findFirst.mockResolvedValueOnce({ id: "gw_1", serverId: MINE, channelId: "500000000000000001", messageId: "600000000000000001", prize: "Nitro", winnerCount: 1, winnerIds: [], endedAt: null, entries: [{ userId: "333333333333333333" }] });
    prismaMock.giveaway.update.mockResolvedValueOnce({});
    const r = await request(app).post("/api/bot/giveaway/gw_1/end").send({ serverId: MINE, actorId: "1" });
    expect(r.status).toBe(200);
    expect(r.body.winners).toEqual(["333333333333333333"]);
    expect(notifyBot).toHaveBeenCalledWith("GIVEAWAY_ENDED", expect.objectContaining({ serverId: MINE, giveawayId: "gw_1" }));
  });

  it("вече приключила → 409, не 500", async () => {
    prismaMock.giveaway.findFirst.mockResolvedValueOnce({ id: "gw_1", serverId: MINE, endedAt: new Date(), entries: [], winnerIds: [] });
    expect((await request(app).post("/api/bot/giveaway/gw_1/end").send({ serverId: MINE })).status).toBe(409);
  });

  it("GET, участие и spawned: без serverId → 400; търсенето/записът са по сървъра", async () => {
    expect((await request(app).get("/api/bot/giveaway/gw_1")).status).toBe(400);
    expect((await request(app).post("/api/bot/giveaway/gw_1/enter").send({ userId: "333333333333333333" })).status).toBe(400);
    expect((await request(app).patch("/api/bot/giveaway/gw_1/spawned").send({ messageId: "600000000000000001" })).status).toBe(400);

    prismaMock.giveaway.findFirst.mockResolvedValueOnce(null);
    expect((await request(app).get("/api/bot/giveaway/gw_theirs").query({ serverId: MINE })).status).toBe(404);
    prismaMock.giveaway.findFirst.mockResolvedValueOnce(null);
    expect((await request(app).post("/api/bot/giveaway/gw_theirs/enter").send({ serverId: MINE, userId: "333333333333333333" })).status).toBe(404);
    expect(prismaMock.giveawayEntry.create).not.toHaveBeenCalled();
    prismaMock.giveaway.updateMany.mockResolvedValueOnce({ count: 0 });
    expect((await request(app).patch("/api/bot/giveaway/gw_theirs/spawned").send({ serverId: MINE, messageId: "600000000000000001" })).status).toBe(404);
    expect(prismaMock.giveaway.updateMany).toHaveBeenCalledWith({ where: { id: "gw_theirs", serverId: MINE }, data: { messageId: "600000000000000001" } });
  });

  it("serverId се взима от заявката на бота, не от томболата — чужд сървър не може да се представи за свой", async () => {
    prismaMock.giveaway.findFirst.mockResolvedValueOnce(null);
    await request(app).post("/api/bot/giveaway/gw_1/end").send({ serverId: THEIRS });
    expect(prismaMock.giveaway.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "gw_1", serverId: THEIRS } }));
  });
});
