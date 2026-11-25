// backend/src/__tests__/launchAutomation.test.js
// Готовност за пускане, поток И — раздавания, анкети, команди на бота (А2–А4,
// А6, А8). Номерът на критерия е в името на всеки тест.
import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";
import { createPrismaMock } from "./testUtils/prismaMock.js";

const prismaMock = createPrismaMock();
vi.mock("../lib/prisma.js", () => ({ prisma: prismaMock }));

const fireWebhooks = vi.fn().mockResolvedValue(undefined);
vi.mock("../services/webhooks.js", () => ({ fireWebhooks: (...a) => fireWebhooks(...a), VALID_EVENTS: [] }));
const notifyBot = vi.fn();
vi.mock("../services/botNotifier.js", () => ({ notifyBot: (...a) => notifyBot(...a), notifyBotVerbose: vi.fn().mockResolvedValue({ messageId: "m1" }) }));
const pushPollUpdate = vi.fn();
vi.mock("../lib/pollUpdate.js", () => ({ pushPollUpdate: (...a) => pushPollUpdate(...a) }));
const grantXpOnce = vi.fn();
vi.mock("../lib/game/xp.js", () => ({ grantXpOnce: (...a) => grantXpOnce(...a), XP_REWARDS: {} }));
vi.mock("../middleware/auth.js", () => ({
  requireBotSecret: (_req, _res, next) => next(),
  requireAuth: (_req, _res, next) => next(),
  loadUser: (req, _res, next) => { req.user = { id: "111111111111111111", globalRole: "USER" }; next(); },
  requireServerAdmin: (_req, _res, next) => next(),
}));
const getServerTier = vi.fn();
vi.mock("../lib/premium.js", async (orig) => {
  const real = await orig();
  return {
    ...real,
    getServerTier: (...a) => getServerTier(...a),
    requirePremium: () => (_req, _res, next) => next(),
  };
});

const { default: automationRouter } = await import("../routes/automation.js");
const { default: botRouter } = await import("../routes/bot_v18.js");
const { drawWinners } = await import("../lib/giveawayDraw.js");

const SID = "222222222222222222";
const GID = "gw1";
const dash = () => { const a = express(); a.use(express.json()); a.use("/api/servers", automationRouter); a.use((e, _q, r, _n) => r.status(500).json({ error: e.message })); return a; };
const bot = () => { const a = express(); a.use(express.json()); a.use("/api/bot", botRouter); a.use((e, _q, r, _n) => r.status(500).json({ error: e.message })); return a; };
const giveaway = (o = {}) => ({
  id: GID, serverId: SID, channelId: "c1", messageId: "m1", prize: "Nitro", winnerCount: 1,
  endedAt: null, winnerIds: [], requiredRoleIds: [], entries: [{ userId: "u1" }, { userId: "u2" }], ...o,
});

beforeEach(() => {
  vi.resetAllMocks();
  fireWebhooks.mockResolvedValue(undefined);
  pushPollUpdate.mockResolvedValue(undefined);
  grantXpOnce.mockResolvedValue(undefined);
  notifyBot.mockResolvedValue(null); // ботът „офлайн“ → тегленето е без филтър (fail-open)
  getServerTier.mockResolvedValue({ plan: "free", isPremium: false, limits: { scheduledPerServer: 3, stickiesPerServer: 1 } });
});

describe("А3 — приключване на раздаване от таблото е условно", () => {
  it("А3: записът е updateMany с endedAt: null", async () => {
    prismaMock.giveaway.findFirst.mockResolvedValue(giveaway());
    prismaMock.giveaway.updateMany.mockResolvedValue({ count: 1 });
    const res = await request(dash()).post(`/api/servers/${SID}/giveaways/${GID}/end`);
    expect(res.status).toBe(200);
    expect(prismaMock.giveaway.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ id: GID, serverId: SID, endedAt: null }) }),
    );
    expect(prismaMock.giveaway.update).not.toHaveBeenCalled();
  });

  it("А3: загубена надпревара (count 0) → 409 и нито обява, нито webhook", async () => {
    prismaMock.giveaway.findFirst.mockResolvedValue(giveaway());
    prismaMock.giveaway.updateMany.mockResolvedValue({ count: 0 });
    const res = await request(dash()).post(`/api/servers/${SID}/giveaways/${GID}/end`);
    expect(res.status).toBe(409);
    expect(notifyBot).not.toHaveBeenCalledWith("GIVEAWAY_ENDED", expect.anything());
    expect(fireWebhooks).not.toHaveBeenCalled();
  });

  it("А3: вече приключена → 409", async () => {
    prismaMock.giveaway.findFirst.mockResolvedValue(giveaway({ endedAt: new Date() }));
    const res = await request(dash()).post(`/api/servers/${SID}/giveaways/${GID}/end`);
    expect(res.status).toBe(409);
    expect(prismaMock.giveaway.updateMany).not.toHaveBeenCalled();
  });

  it("А3: reroll на още течаща томбола → 409, нищо не се обявява", async () => {
    prismaMock.giveaway.findFirst.mockResolvedValue(giveaway());
    const res = await request(dash()).post(`/api/servers/${SID}/giveaways/${GID}/reroll`);
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("NOT_ENDED");
    expect(prismaMock.giveaway.updateMany).not.toHaveBeenCalled();
    expect(notifyBot).not.toHaveBeenCalled();
  });

  it("А3: reroll след края минава и е условен по endedAt != null", async () => {
    prismaMock.giveaway.findFirst.mockResolvedValue(giveaway({ endedAt: new Date(), winnerIds: ["u1"] }));
    prismaMock.giveaway.updateMany.mockResolvedValue({ count: 1 });
    const res = await request(dash()).post(`/api/servers/${SID}/giveaways/${GID}/reroll`);
    expect(res.status).toBe(200);
    expect(res.body.winners).toEqual(["u2"]);
    expect(prismaMock.giveaway.updateMany.mock.calls[0][0].where.endedAt).toEqual({ not: null });
  });

  it("А3: ботовият reroll на течаща томбола → 409", async () => {
    prismaMock.giveaway.findFirst.mockResolvedValue(giveaway());
    const res = await request(bot()).post(`/api/bot/giveaway/${GID}/reroll`).send({ serverId: SID });
    expect(res.status).toBe(409);
    expect(prismaMock.giveaway.updateMany).not.toHaveBeenCalled();
  });
});

describe("А2 — табло и бот пращат webhook при край на раздаване и анкета", () => {
  it("А2: край на раздаване от таблото → GIVEAWAY_ENDED webhook", async () => {
    prismaMock.giveaway.findFirst.mockResolvedValue(giveaway());
    prismaMock.giveaway.updateMany.mockResolvedValue({ count: 1 });
    await request(dash()).post(`/api/servers/${SID}/giveaways/${GID}/end`);
    await vi.waitFor(() => expect(fireWebhooks).toHaveBeenCalledWith(SID, "GIVEAWAY_ENDED", expect.objectContaining({ giveawayId: GID, prize: "Nitro" })));
  });

  it("А2: край на раздаване от бота → GIVEAWAY_ENDED webhook", async () => {
    prismaMock.giveaway.findFirst.mockResolvedValue(giveaway());
    prismaMock.giveaway.updateMany.mockResolvedValue({ count: 1 });
    await request(bot()).post(`/api/bot/giveaway/${GID}/end`).send({ serverId: SID });
    await vi.waitFor(() => expect(fireWebhooks).toHaveBeenCalledWith(SID, "GIVEAWAY_ENDED", expect.anything()));
  });

  it("А2: затваряне на анкета от таблото → POLL_CLOSED webhook с бройките (без гласували)", async () => {
    prismaMock.poll.findFirst
      .mockResolvedValueOnce({ id: "p1", closedAt: null })
      .mockResolvedValueOnce({ id: "p1", serverId: SID, question: "Q", options: ["a", "b"], multiChoice: false, closedAt: new Date(), votes: [{ option: 0 }, { option: 0 }, { option: 1 }] })
      .mockResolvedValueOnce({ id: "p1", serverId: SID, question: "Q", options: ["a", "b"], multiChoice: false, closedAt: new Date(), votes: [{ option: 0 }, { option: 0 }, { option: 1 }] });
    prismaMock.poll.updateMany.mockResolvedValue({ count: 1 });
    const res = await request(dash()).post(`/api/servers/${SID}/polls/p1/close`);
    expect(res.status).toBe(200);
    await vi.waitFor(() => expect(fireWebhooks).toHaveBeenCalledWith(SID, "POLL_CLOSED", expect.objectContaining({ pollId: "p1", counts: [2, 1], totalVotes: 3 })));
    const payload = fireWebhooks.mock.calls.at(-1)[2];
    expect(JSON.stringify(payload)).not.toMatch(/userId/);
  });

  it("А2: втори клик на „затвори“ не праща второ известие", async () => {
    prismaMock.poll.findFirst.mockResolvedValue({ id: "p1", closedAt: new Date() });
    prismaMock.poll.updateMany.mockResolvedValue({ count: 0 });
    const res = await request(dash()).post(`/api/servers/${SID}/polls/p1/close`);
    expect(res.status).toBe(200);
    await new Promise((r) => setTimeout(r, 10));
    expect(fireWebhooks).not.toHaveBeenCalled();
  });
});

describe("А4 — роли за раздаване и теглене само сред присъстващите", () => {
  const enter = (body) => request(bot()).post(`/api/bot/giveaway/${GID}/enter`).send({ serverId: SID, userId: "333333333333333333", ...body });

  it("А4: липсваща роля → 403 ROLE_REQUIRED и записът НЕ се създава", async () => {
    prismaMock.giveaway.findFirst.mockResolvedValue(giveaway({ requiredRoleIds: ["r1", "r2"] }));
    prismaMock.giveawayEntry.findUnique.mockResolvedValue(null);
    const res = await enter({ memberRoleIds: ["r1"] });
    expect(res.status).toBe(403);
    expect(res.body.error).toBe("ROLE_REQUIRED");
    expect(res.body.missingRoleIds).toEqual(["r2"]);
    expect(prismaMock.giveawayEntry.create).not.toHaveBeenCalled();
  });

  it("А4: без memberRoleIds при раздаване с изискване → отказ (fail closed)", async () => {
    prismaMock.giveaway.findFirst.mockResolvedValue(giveaway({ requiredRoleIds: ["r1"] }));
    prismaMock.giveawayEntry.findUnique.mockResolvedValue(null);
    const res = await enter({});
    expect(res.status).toBe(403);
    expect(res.body.error).toBe("ROLE_REQUIRED");
    expect(prismaMock.giveawayEntry.create).not.toHaveBeenCalled();
  });

  it("А4: невалиден memberRoleIds (не масив) → отказ", async () => {
    prismaMock.giveaway.findFirst.mockResolvedValue(giveaway({ requiredRoleIds: ["r1"] }));
    prismaMock.giveawayEntry.findUnique.mockResolvedValue(null);
    const res = await enter({ memberRoleIds: "r1" });
    expect(res.status).toBe(403);
  });

  it("А4: всички роли налични → записът минава", async () => {
    prismaMock.giveaway.findFirst.mockResolvedValue(giveaway({ requiredRoleIds: ["r1", "r2"] }));
    prismaMock.giveawayEntry.findUnique.mockResolvedValue(null);
    prismaMock.giveawayEntry.create.mockResolvedValue({});
    prismaMock.giveawayEntry.count.mockResolvedValue(1);
    const res = await enter({ memberRoleIds: ["r2", "r1", "x"] });
    expect(res.status).toBe(200);
    expect(res.body.entered).toBe(true);
    expect(prismaMock.giveawayEntry.create).toHaveBeenCalled();
  });

  it("А4: раздаване без изискване не иска memberRoleIds (съвместимост)", async () => {
    prismaMock.giveaway.findFirst.mockResolvedValue(giveaway());
    prismaMock.giveawayEntry.findUnique.mockResolvedValue(null);
    prismaMock.giveawayEntry.create.mockResolvedValue({});
    prismaMock.giveawayEntry.count.mockResolvedValue(1);
    expect((await enter({})).status).toBe(200);
  });

  it("А4: излизане от раздаването е позволено и без роли", async () => {
    prismaMock.giveaway.findFirst.mockResolvedValue(giveaway({ requiredRoleIds: ["r1"] }));
    prismaMock.giveawayEntry.findUnique.mockResolvedValue({ id: "e1" });
    prismaMock.giveawayEntry.count.mockResolvedValue(0);
    const res = await enter({});
    expect(res.status).toBe(200);
    expect(res.body.entered).toBe(false);
  });

  it("А4: при теглене печелят само хора, които още са в сървъра", async () => {
    const isPresent = vi.fn(async (_s, ids) => new Set(ids.filter((id) => id !== "gone")));
    const entries = [{ userId: "gone" }, { userId: "a" }, { userId: "b" }];
    for (let i = 0; i < 30; i++) {
      const w = await drawWinners({ serverId: SID, winnerCount: 2 }, entries, { isPresent });
      expect(w).toHaveLength(2);
      expect(w).not.toContain("gone");
    }
  });

  it("А4: reroll не връща предишен победител", async () => {
    const w = await drawWinners({ serverId: SID, winnerCount: 1, winnerIds: ["a"] }, [{ userId: "a" }, { userId: "b" }], { reroll: true, isPresent: async () => null });
    expect(w).toEqual(["b"]);
  });

  it("А4: недостъпен бот (null) не блокира тегленето", async () => {
    const w = await drawWinners({ serverId: SID, winnerCount: 2 }, [{ userId: "a" }, { userId: "b" }, { userId: "c" }], { isPresent: async () => null });
    expect(w).toHaveLength(2);
  });

  it("А4: ако присъстват по-малко от winnerCount, печелят само те", async () => {
    const w = await drawWinners({ serverId: SID, winnerCount: 3 }, [{ userId: "a" }, { userId: "b" }], { isPresent: async () => new Set(["a"]) });
    expect(w).toEqual(["a"]);
  });
});

describe("А6 — /schedule и /sticky през бота спазват лимитите на плана", () => {
  const premiumTier = (limits) => ({ plan: "premium", isPremium: true, limits: { recurringScheduled: true, ...limits } });
  const sched = { serverId: SID, channelId: "444444444444444444", content: "hi", sendAt: new Date(Date.now() + 3600_000).toISOString() };

  it("А6: /schedule над scheduledPerServer → 403 LIMIT_REACHED, нищо не се създава", async () => {
    getServerTier.mockResolvedValue(premiumTier({ scheduledPerServer: 2, stickiesPerServer: 2 }));
    prismaMock.scheduledMessage.count.mockResolvedValue(2);
    const res = await request(bot()).post("/api/bot/schedule").send(sched);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("LIMIT_REACHED");
    expect(prismaMock.scheduledMessage.create).not.toHaveBeenCalled();
    expect(prismaMock.scheduledMessage.count.mock.calls[0][0].where).toEqual({ serverId: SID, sentAt: null });
  });

  it("А6: /schedule под лимита → 201 (в Serializable транзакция, както в таблото)", async () => {
    getServerTier.mockResolvedValue(premiumTier({ scheduledPerServer: 2, stickiesPerServer: 2 }));
    prismaMock.scheduledMessage.count.mockResolvedValue(1);
    prismaMock.scheduledMessage.create.mockResolvedValue({ id: "s1" });
    const res = await request(bot()).post("/api/bot/schedule").send(sched);
    expect(res.status).toBe(201);
    expect(prismaMock.$transaction.mock.calls[0][1]).toEqual({ isolationLevel: "Serializable" });
  });

  it("А6: /sticky на нов канал над stickiesPerServer → 403, upsert не се вика", async () => {
    getServerTier.mockResolvedValue(premiumTier({ scheduledPerServer: 2, stickiesPerServer: 1 }));
    prismaMock.stickyMessage.findUnique.mockResolvedValue(null);
    prismaMock.stickyMessage.count.mockResolvedValue(1);
    const res = await request(bot()).post("/api/bot/sticky").send({ serverId: SID, channelId: "444444444444444444", content: "x" });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("LIMIT_REACHED");
    expect(prismaMock.stickyMessage.upsert).not.toHaveBeenCalled();
  });

  it("А6: /sticky върху съществуващ канал на сървъра (редакция) не брои лимита", async () => {
    getServerTier.mockResolvedValue(premiumTier({ scheduledPerServer: 2, stickiesPerServer: 1 }));
    prismaMock.stickyMessage.findUnique.mockResolvedValue({ serverId: SID });
    prismaMock.stickyMessage.upsert.mockResolvedValue({ id: "st" });
    const res = await request(bot()).post("/api/bot/sticky").send({ serverId: SID, channelId: "444444444444444444", content: "x" });
    expect(res.status).toBe(200);
    expect(prismaMock.stickyMessage.count).not.toHaveBeenCalled();
  });

  it("А6: sticky канал на ЧУЖД сървър → 409 (изолация)", async () => {
    getServerTier.mockResolvedValue(premiumTier({ scheduledPerServer: 2, stickiesPerServer: 5 }));
    prismaMock.stickyMessage.findUnique.mockResolvedValue({ serverId: "999999999999999999" });
    const res = await request(bot()).post("/api/bot/sticky").send({ serverId: SID, channelId: "444444444444444444", content: "x" });
    expect(res.status).toBe(409);
    expect(prismaMock.stickyMessage.upsert).not.toHaveBeenCalled();
  });
});

describe("А8 — анкета с един избор: един глас при паралелни кликове", () => {
  it("А8: изтриването и записът са под advisory lock по (анкета, човек) в една транзакция", async () => {
    prismaMock.poll.findUnique.mockResolvedValue({ id: "p1", serverId: SID, options: ["a", "b"], multiChoice: false, closedAt: null });
    prismaMock.$executeRaw.mockResolvedValue(1);
    prismaMock.pollVote.findFirst.mockResolvedValue({ id: "v0", option: 0 });
    prismaMock.pollVote.findMany.mockResolvedValue([{ option: 1 }]);
    const res = await request(bot()).post("/api/bot/poll/p1/vote").send({ userId: "u1", option: 1 });
    expect(res.status).toBe(200);
    expect(prismaMock.$transaction).toHaveBeenCalled();
    expect(prismaMock.$executeRaw.mock.calls[0][0].join("?")).toMatch(/pg_advisory_xact_lock\(hashtext\(/);
    expect(prismaMock.$executeRaw.mock.calls[0][1]).toBe("pollvote:p1:u1");
    const lockAt = prismaMock.$executeRaw.mock.invocationCallOrder[0];
    expect(lockAt).toBeLessThan(prismaMock.pollVote.deleteMany.mock.invocationCallOrder[0]);
    expect(lockAt).toBeLessThan(prismaMock.pollVote.create.mock.invocationCallOrder[0]);
  });
});
